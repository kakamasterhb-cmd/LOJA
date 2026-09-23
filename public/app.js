const STORAGE_KEY = 'painel-loja-diadema-v1';
const QUOTES_KEY = 'loja-pos-quotes-v1';
const PRODUCTS_KEY = 'loja-pos-products-v1';
const statuses = [
  { id: 'todo', label: 'A fazer' },
  { id: 'doing', label: 'Em andamento' },
  { id: 'waiting', label: 'Aguardando' },
  { id: 'done', label: 'Concluído' },
];

const isoDate = (offset = 0) => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
};

const DEMO_CLEANUP_KEY = 'painel-loja-diadema-demo-cleanup-v1';
const DEMO_TASK_TITLES = new Set([
  'Confirmar chegada das peças encomendadas',
  'Finalizar revisão da Titan 160',
  'Cobrar retorno do orçamento',
  'Conferir fechamento do caixa',
  'Organizar bancada e ferramentas',
  'Atualizar preços dos retrovisores',
]);

let tasks = loadTasks();
let selectedArea = 'all';
let quickFilter = null;
let draggedId = null;
let pendingDeleteId = null;
let pendingDeleteTimer = null;

const $ = (selector) => document.querySelector(selector);
const board = $('#board');
const dialog = $('#taskDialog');
const form = $('#taskForm');

function loadTasks() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    const tasks = Array.isArray(saved) ? saved : [];
    if (localStorage.getItem(DEMO_CLEANUP_KEY) !== '1') {
      const cleaned = tasks.filter(task => !DEMO_TASK_TITLES.has(task.title));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
      localStorage.setItem(DEMO_CLEANUP_KEY, '1');
      return cleaned;
    }
    return tasks;
  } catch { return []; }
}

function readQuotes() {
  try {
    const saved = JSON.parse(localStorage.getItem(QUOTES_KEY));
    return Array.isArray(saved) ? saved : [];
  } catch { return []; }
}

function readProducts() {
  try {
    const saved = JSON.parse(localStorage.getItem(PRODUCTS_KEY));
    return Array.isArray(saved) ? saved : [];
  } catch { return []; }
}

function quoteTask(quote) {
  const itemNames = (quote.items || []).slice(0, 3).map(item => item.name).join(', ');
  const vehicle = [quote.vehicle, quote.plate].filter(Boolean).join(' • ');
  return {
    id: crypto.randomUUID(), quoteId: quote.id, quoteNumber: quote.number,
    title: `Orçamento #${String(quote.number || 0).padStart(4, '0')} — ${quote.customer || 'Cliente'}`,
    description: [vehicle, itemNames, quote.notes].filter(Boolean).join(' | '),
    area: 'Oficina e funcionários', priority: 'Média', owner: 'Equipa da oficina',
    due: isoDate(0), status: quote.status || 'todo', createdAt: new Date(quote.createdAt || Date.now()).getTime(),
  };
}

function syncQuoteTasks() {
  let changed = false;
  readQuotes().forEach(quote => {
    const task = tasks.find(item => item.quoteId === quote.id);
    if (!task) { tasks.unshift(quoteTask(quote)); changed = true; return; }
    if (task.status !== quote.status) { task.status = quote.status || 'todo'; changed = true; }
  });
  if (changed) localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

function syncQuoteFromTask(task) {
  if (!task?.quoteId) return;
  const quotes = readQuotes(), quote = quotes.find(item => item.id === task.quoteId);
  if (!quote) return;
  quote.status = task.status;
  quote.updatedAt = new Date().toISOString();
  localStorage.setItem(QUOTES_KEY, JSON.stringify(quotes));
}

function removeQuoteForTask(task) {
  if (!task?.quoteId) return false;
  const quotes = readQuotes().filter(item => item.id !== task.quoteId);
  localStorage.setItem(QUOTES_KEY, JSON.stringify(quotes));
  return true;
}

function persist(message = 'Alterações guardadas') {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  showToast(message);
}

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 1900);
}

function dateOnly() { return isoDate(0); }
function isOverdue(task) { return task.status !== 'done' && task.due < dateOnly(); }
function isToday(task) { return task.status !== 'done' && task.due === dateOnly(); }

function formatDate(value) {
  const d = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(d).replace('.', '');
}

function initials(name) {
  return name.split(/\s+/).slice(0, 2).map(n => n[0]).join('').toUpperCase();
}

function escapeHTML(value = '') {
  return value.replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}

function filteredTasks() {
  const query = $('#searchInput').value.trim().toLowerCase();
  const priority = $('#priorityFilter').value;
  const owner = $('#ownerFilter').value;
  return tasks.filter(task => {
    const areaMatch = selectedArea === 'all' || task.area === selectedArea;
    const queryMatch = !query || `${task.title} ${task.description} ${task.owner}`.toLowerCase().includes(query);
    const priorityMatch = priority === 'all' || task.priority === priority;
    const ownerMatch = owner === 'all' || task.owner === owner;
    const quickMatch = !quickFilter ||
      (quickFilter === 'overdue' && isOverdue(task)) ||
      (quickFilter === 'today' && isToday(task)) ||
      (quickFilter === 'progress' && task.status === 'doing') ||
      (quickFilter === 'done' && task.status === 'done');
    return areaMatch && queryMatch && priorityMatch && ownerMatch && quickMatch;
  });
}

function render() {
  renderStats();
  renderOwners();
  renderRestock();
  renderBoard();
  updateFilterBadge();
}

function renderRestock() {
  const panel = $('#restockPanel');
  panel.hidden = selectedArea !== 'Estoque e peças';
  if (panel.hidden) return;
  const products = readProducts().filter(product => product.trackStock !== false && Number(product.stock || 0) <= Number(product.minStock || 0)).sort((a, b) => Number(a.stock || 0) - Number(b.stock || 0) || a.name.localeCompare(b.name, 'pt-BR'));
  $('#restockList').innerHTML = products.length ? products.map(product => {
    const stock = Number(product.stock || 0), minimum = Number(product.minStock || 0), order = Math.max(1, minimum - stock + 1);
    return `<article class="restock-item"><span class="restock-state ${stock <= 0 ? 'out' : 'low'}">${stock <= 0 ? 'Esgotado' : 'Estoque baixo'}</span><div><strong>${escapeHTML(product.name)}</strong><small>${escapeHTML(product.code || 'Sem código')} • ${escapeHTML(product.supplier || 'Fornecedor não informado')}</small></div><div class="restock-numbers"><span>Atual <b>${stock}</b></span><span>Mínimo <b>${minimum}</b></span><span>Pedir <b>${order}</b></span></div><a href="estoque.html">Ver peça</a></article>`;
  }).join('') : '<div class="restock-empty"><strong>Nenhuma peça precisa ser pedida agora.</strong><span>Os produtos abaixo do estoque mínimo aparecerão automaticamente aqui.</span></div>';
}

function renderStats() {
  $('#overdueCount').textContent = tasks.filter(isOverdue).length;
  $('#todayCount').textContent = tasks.filter(isToday).length;
  $('#progressCount').textContent = tasks.filter(t => t.status === 'doing').length;
  $('#doneCount').textContent = tasks.filter(t => t.status === 'done').length;
}

function renderOwners() {
  const select = $('#ownerFilter');
  const current = select.value || 'all';
  const owners = [...new Set(tasks.map(t => t.owner))].sort();
  select.innerHTML = '<option value="all">Todos</option>' + owners.map(o => `<option>${escapeHTML(o)}</option>`).join('');
  select.value = owners.includes(current) ? current : 'all';
}

function renderBoard() {
  const visible = filteredTasks();
  board.innerHTML = statuses.map(status => {
    const items = visible.filter(t => t.status === status.id);
    return `<section class="column" data-status="${status.id}">
      <div class="column-head"><div class="column-title"><i class="${status.id}"></i>${status.label}</div><span class="column-count">${items.length}</span></div>
      <div class="card-list">${items.length ? items.map(taskCard).join('') : '<div class="empty-column">Solte uma tarefa aqui</div>'}</div>
    </section>`;
  }).join('');
  bindBoardEvents();
}

function taskCard(task) {
  const dueClass = isOverdue(task) ? 'overdue' : isToday(task) ? 'today' : '';
  const dueLabel = isOverdue(task) ? `Atrasada · ${formatDate(task.due)}` : isToday(task) ? 'Hoje' : formatDate(task.due);
  const pClass = task.priority === 'Alta' ? 'high' : task.priority === 'Média' ? 'medium' : 'low';
  return `<article class="task-card${task.quoteId ? ' motorcycle-task' : ''}" draggable="true" data-id="${task.id}" tabindex="0" aria-label="Editar ${escapeHTML(task.title)}">
    <div class="task-top"><span class="area-tag">${escapeHTML(task.area)}</span><span class="priority-dot"><i class="${pClass}"></i>${task.priority}</span></div>
    ${task.quoteId ? `<span class="quote-origin">Ligada ao orçamento #${String(task.quoteNumber || 0).padStart(4, '0')}</span>` : ''}
    <h3>${escapeHTML(task.title)}</h3>
    ${task.description ? `<p class="description">${escapeHTML(task.description)}</p>` : ''}
    <div class="task-meta">
      <span class="owner"><span class="avatar">${initials(task.owner)}</span><span>${escapeHTML(task.owner)}</span></span>
      <span class="due ${dueClass}"><svg viewBox="0 0 24 24"><path d="M7 3v3m10-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z"/></svg>${dueLabel}</span>
    </div>
    <div class="card-actions"><button class="card-edit" type="button">Editar</button><button class="card-delete" type="button">Excluir</button></div>
    ${task.status !== 'done' ? '<button class="quick-done" type="button">✓ Marcar como concluída</button>' : ''}
  </article>`;
}

function bindBoardEvents() {
  document.querySelectorAll('.task-card').forEach(card => {
    card.addEventListener('click', e => { if (!e.target.closest('button')) openTask(card.dataset.id); });
    card.addEventListener('keydown', e => { if (e.key === 'Enter') openTask(card.dataset.id); });
    card.addEventListener('dragstart', () => { draggedId = card.dataset.id; card.classList.add('dragging'); });
    card.addEventListener('dragend', () => { draggedId = null; card.classList.remove('dragging'); document.querySelectorAll('.column').forEach(c => c.classList.remove('drag-over')); });
    card.querySelector('.quick-done')?.addEventListener('click', () => completeTask(card.dataset.id));
    card.querySelector('.card-edit')?.addEventListener('click', () => openTask(card.dataset.id));
    card.querySelector('.card-delete')?.addEventListener('click', () => deleteTaskById(card.dataset.id));
  });
  document.querySelectorAll('.column').forEach(column => {
    column.addEventListener('dragover', e => { e.preventDefault(); column.classList.add('drag-over'); });
    column.addEventListener('dragleave', e => { if (!column.contains(e.relatedTarget)) column.classList.remove('drag-over'); });
    column.addEventListener('drop', e => {
      e.preventDefault();
      if (!draggedId) return;
      const task = tasks.find(t => t.id === draggedId);
      if (task && task.status !== column.dataset.status) {
        task.status = column.dataset.status;
        syncQuoteFromTask(task);
        persist(`Tarefa movida para ${statuses.find(s => s.id === task.status).label}`);
        render();
      }
    });
  });
}

function completeTask(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  task.status = 'done';
  syncQuoteFromTask(task);
  persist('Tarefa concluída');
  render();
}

function deleteTaskById(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  const linked = Boolean(task.quoteId);
  if (pendingDeleteId !== id) {
    pendingDeleteId = id;
    clearTimeout(pendingDeleteTimer);
    const cardButton = document.querySelector(`.task-card[data-id="${CSS.escape(id)}"] .card-delete`);
    if (cardButton) cardButton.textContent = linked ? 'Confirmar exclusão' : 'Clique novamente';
    if ($('#taskId').value === id) $('#deleteTask').textContent = linked ? 'Confirmar: excluir moto e tarefa' : 'Confirmar exclusão';
    showToast(linked ? 'Clique novamente para excluir a moto e a tarefa' : 'Clique novamente para confirmar a exclusão');
    pendingDeleteTimer = setTimeout(() => {
      pendingDeleteId = null;
      if (cardButton?.isConnected) cardButton.textContent = 'Excluir';
      if ($('#taskId').value === id) $('#deleteTask').textContent = linked ? 'Excluir moto e tarefa' : 'Excluir tarefa';
    }, 5000);
    return;
  }
  pendingDeleteId = null;
  clearTimeout(pendingDeleteTimer);
  removeQuoteForTask(task);
  tasks = tasks.filter(t => t.id !== id);
  if (dialog.open) dialog.close();
  persist(linked ? 'Moto e tarefa excluídas' : 'Tarefa excluída');
  render();
}

function openTask(id = null) {
  pendingDeleteId = null;
  clearTimeout(pendingDeleteTimer);
  form.reset();
  $('#taskId').value = '';
  $('#taskDue').value = dateOnly();
  $('#taskPriority').value = 'Média';
  $('#taskStatus').value = 'todo';
  $('#modalTitle').textContent = 'Nova tarefa';
  $('#deleteTask').hidden = true;
  if (id) {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    $('#taskId').value = task.id;
    $('#taskTitle').value = task.title;
    $('#taskDescription').value = task.description || '';
    $('#taskArea').value = task.area;
    $('#taskPriority').value = task.priority;
    $('#taskOwner').value = task.owner;
    $('#taskDue').value = task.due;
    $('#taskStatus').value = task.status;
    $('#modalTitle').textContent = 'Editar tarefa';
    $('#deleteTask').hidden = false;
    $('#deleteTask').textContent = task.quoteId ? 'Excluir moto e tarefa' : 'Excluir tarefa';
  }
  dialog.showModal();
  setTimeout(() => $('#taskTitle').focus(), 50);
}

form.addEventListener('submit', e => {
  e.preventDefault();
  if (!form.reportValidity()) return;
  const id = $('#taskId').value;
  const data = {
    title: $('#taskTitle').value.trim(), description: $('#taskDescription').value.trim(), area: $('#taskArea').value,
    priority: $('#taskPriority').value, owner: $('#taskOwner').value.trim(), due: $('#taskDue').value, status: $('#taskStatus').value,
  };
  if (id) {
    const task = tasks.find(t => t.id === id);
    Object.assign(task, data);
    syncQuoteFromTask(task);
  } else tasks.unshift({ id: crypto.randomUUID(), ...data, createdAt: Date.now() });
  dialog.close();
  persist(id ? 'Tarefa atualizada' : 'Tarefa criada');
  render();
});

$('#deleteTask').addEventListener('click', () => {
  deleteTaskById($('#taskId').value);
});

$('#newTaskBtn').addEventListener('click', () => openTask());
$('#mobileNewTaskBtn').addEventListener('click', () => openTask());
$('#closeDialog').addEventListener('click', () => dialog.close());
$('#cancelDialog').addEventListener('click', () => dialog.close());

document.querySelectorAll('.tab').forEach(tab => tab.addEventListener('click', () => {
  selectedArea = tab.dataset.area;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t === tab));
  renderRestock();
  renderBoard();
}));

document.querySelectorAll('.stat-card').forEach(card => card.addEventListener('click', () => {
  quickFilter = card.dataset.quickFilter;
  const labels = { overdue: 'A mostrar apenas tarefas atrasadas', today: 'A mostrar apenas tarefas de hoje', progress: 'A mostrar tarefas em andamento', done: 'A mostrar tarefas concluídas' };
  $('#activeFilterText').textContent = labels[quickFilter];
  $('#activeFilter').hidden = false;
  renderBoard();
}));

$('#clearQuickFilter').addEventListener('click', () => { quickFilter = null; $('#activeFilter').hidden = true; renderBoard(); });
$('#filterToggle').addEventListener('click', () => { const panel = $('#filterPanel'); panel.hidden = !panel.hidden; $('#filterToggle').setAttribute('aria-expanded', String(!panel.hidden)); });
$('#searchInput').addEventListener('input', renderBoard);
$('#priorityFilter').addEventListener('change', render);
$('#ownerFilter').addEventListener('change', () => { renderBoard(); updateFilterBadge(); });
$('#clearFilters').addEventListener('click', () => { $('#priorityFilter').value = 'all'; $('#ownerFilter').value = 'all'; $('#searchInput').value = ''; render(); });

function updateFilterBadge() {
  const count = Number($('#priorityFilter').value !== 'all') + Number($('#ownerFilter').value !== 'all');
  $('#filterCount').textContent = count;
  $('#filterCount').hidden = !count;
}

const now = new Date();
$('#todayLabel').textContent = new Intl.DateTimeFormat('pt-BR', { weekday:'long', day:'2-digit', month:'long' }).format(now);
syncQuoteTasks();
render();
