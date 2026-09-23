const script = document.querySelector('script[data-cloud-entry]');
const entries = (script?.dataset.cloudEntry || '').split(',').map(value => value.trim()).filter(Boolean);
const managed = key => key.startsWith('loja-') || key.startsWith('painel-loja-diadema-');
const pendingPrefix = 'cloud-pending:';
const nativeSet = Storage.prototype.setItem;
const nativeRemove = Storage.prototype.removeItem;
const revisions = new Map();
const queues = new Map();

function showBlockingError(message) {
  const box = document.createElement('div');
  box.setAttribute('role', 'alert');
  box.style.cssText = 'position:fixed;inset:0;z-index:99999;display:grid;place-items:center;padding:24px;background:#f7f8fa;font-family:system-ui;color:#172033';
  box.innerHTML = `<div style="max-width:480px;padding:28px;border:1px solid #e4e7ec;border-radius:16px;background:white;box-shadow:0 18px 60px #17203322"><strong style="display:block;font-size:20px;margin-bottom:8px">Banco de dados indisponível</strong><p style="line-height:1.5;color:#667085">${message}</p><button style="border:0;border-radius:9px;padding:11px 16px;background:#f15a24;color:white;font-weight:700;cursor:pointer" onclick="location.reload()">Tentar novamente</button></div>`;
  document.body.appendChild(box);
}

async function request(method, body) {
  const response = await fetch('/api/data', {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'Falha ao acessar o banco de dados.');
    error.status = response.status;
    throw error;
  }
  return data;
}

function enqueue(key, operation) {
  const previous = queues.get(key) || Promise.resolve();
  const next = previous.then(operation, operation).catch(error => {
    console.error(error);
    if (error.status === 409) {
      alert('Este registro foi alterado em outro aparelho. A página será atualizada para evitar perda de dados.');
      location.reload();
      return;
    }
    alert('A alteração ficou pendente porque o banco online não respondeu. Ela será reenviada quando você abrir o painel novamente.');
  });
  queues.set(key, next);
}

function installCloudWrites() {
  Storage.prototype.setItem = function(key, value) {
    nativeSet.call(this, key, value);
    if (this !== localStorage || !managed(String(key))) return;
    nativeSet.call(localStorage, pendingPrefix + key, String(value));
    enqueue(String(key), async () => {
      const saved = await request('PUT', { key: String(key), value: String(value), baseRevision: revisions.get(String(key)) || 0 });
      revisions.set(String(key), saved.revision);
      nativeRemove.call(localStorage, pendingPrefix + key);
    });
  };
  Storage.prototype.removeItem = function(key) {
    nativeRemove.call(this, key);
    if (this !== localStorage || !managed(String(key))) return;
    if (!revisions.has(String(key)) && !queues.has(String(key))) return;
    enqueue(String(key), async () => {
      await request('DELETE', { key: String(key), baseRevision: revisions.get(String(key)) || 0 });
      revisions.delete(String(key));
    });
  };
}

async function start() {
  try {
    const payload = await request('GET');
    const pending = new Map();
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(pendingPrefix)) pending.set(key.slice(pendingPrefix.length), localStorage.getItem(key));
    }
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && managed(key)) keys.push(key);
    }
    keys.forEach(key => nativeRemove.call(localStorage, key));
    for (const record of payload.records || []) {
      nativeSet.call(localStorage, record.key, record.value);
      revisions.set(record.key, Number(record.revision || 0));
    }
    installCloudWrites();
    for (const [key, value] of pending) {
      if (value !== null) localStorage.setItem(key, value);
    }
    for (const entry of entries) await import(new URL(entry, import.meta.url));
  } catch (error) {
    console.error(error);
    showBlockingError('Não foi possível carregar as informações da loja. Nenhuma informação foi alterada. Verifique a conexão e tente novamente.');
  }
}

start();
