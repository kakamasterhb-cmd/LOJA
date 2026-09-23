const KEYS={customer:'loja-pos-customers-v1',supplier:'loja-pos-suppliers-v1',sales:'loja-pos-sales-v1'};
const $=s=>document.querySelector(s),uid=()=>crypto.randomUUID(),esc=(v='')=>String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}},save=(key,value)=>localStorage.setItem(key,JSON.stringify(value));
const money=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}),normalize=v=>String(v||'').trim().toLocaleLowerCase('pt-BR');
let customers=read(KEYS.customer,[]),suppliers=read(KEYS.supplier,[]),sales=read(KEYS.sales,[]),activeType='customer';

function list(){return activeType==='customer'?customers:suppliers}
function store(){save(KEYS.customer,customers);save(KEYS.supplier,suppliers)}
function toast(message){const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),1800)}
function fmtDate(v){return v?new Intl.DateTimeFormat('pt-BR').format(new Date(v)):'Cadastro anterior'}
function fmtDateTime(v){return new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(v))}
function salesFor(customer){if(!customer)return[];return sales.filter(s=>s.customerId===customer.id||(!s.customerId&&normalize(s.customer)===normalize(customer.name))).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt))}

function render(){
  const query=$('#recordSearch').value.trim().toLowerCase(),items=list().filter(x=>!query||`${x.name} ${x.document} ${x.phone} ${x.email} ${x.vehicle||''} ${x.plate||''} ${x.color||''} ${x.contact||''}`.toLowerCase().includes(query));
  $('#customerCount').textContent=customers.length;
  $('#supplierCount').textContent=suppliers.length;
  $('#listSummary').textContent=`${items.length} ${items.length===1?'cadastro':'cadastros'}`;
  $('#recordsHead').innerHTML=activeType==='customer'?'<tr><th>Cliente</th><th>CPF/CNPJ</th><th>Telefone</th><th>Moto/placa</th><th>Cadastro</th><th></th></tr>':'<tr><th>Fornecedor</th><th>CPF/CNPJ</th><th>Telefone</th><th>Contato/condição</th><th>Cadastro</th><th></th></tr>';
  $('#recordsBody').innerHTML=items.length?items.map(row).join(''):`<tr class="empty-row"><td colspan="6">Nenhum ${activeType==='customer'?'cliente':'fornecedor'} cadastrado.</td></tr>`;
  document.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>openRecord(b.dataset.edit));
}

function row(item){
  const detail=activeType==='customer'?`${esc(item.vehicle||'Moto não informada')}${item.plate||item.color?`<small>${[item.plate,item.color].filter(Boolean).map(esc).join(' • ')}</small>`:''}`:`${esc(item.contact||'Contato não informado')}${item.terms?`<small>${esc(item.terms)}</small>`:''}`;
  return`<tr><td><strong>${esc(item.name)}</strong><small>${esc(item.email||'Sem e-mail')}</small></td><td>${esc(item.document||'—')}</td><td>${esc(item.phone||'—')}</td><td>${detail}</td><td>${fmtDate(item.createdAt)}</td><td><button class="edit-button" data-edit="${item.id}">Abrir</button></td></tr>`;
}

function renderCustomerSales(customer){
  const list=salesFor(customer),total=list.reduce((sum,s)=>sum+Number(s.total||0),0),last=list[0];
  $('#customerSalesSummary').innerHTML=`<article><small>Compras</small><strong>${list.length}</strong></article><article><small>Total comprado</small><strong>${money.format(total)}</strong></article><article><small>Última compra</small><strong>${last?fmtDateTime(last.createdAt):'—'}</strong></article>`;
  if(!customer){
    $('#customerSalesList').innerHTML='<p class="customer-sales-empty">Depois de salvar o cliente, as vendas vinculadas aparecerão aqui.</p>';
    return;
  }
  $('#customerSalesList').innerHTML=list.length?`${list.map(s=>`<a class="customer-sale" href="vendas.html?cliente=${encodeURIComponent(customer.id)}&venda=${encodeURIComponent(s.id)}"><span><strong>#${String(s.number||0).padStart(4,'0')} • ${fmtDateTime(s.createdAt)}</strong><small>${(s.items||[]).length} ${(s.items||[]).length===1?'item':'itens'} • ${esc(s.payment||'Sem forma informada')}</small></span><b>${money.format(Number(s.total||0))}</b></a>`).join('')}<a class="all-sales-link" href="vendas.html?cliente=${encodeURIComponent(customer.id)}">Ver todas as vendas deste cliente →</a>`:'<p class="customer-sales-empty">Nenhuma venda vinculada a este cliente.</p>';
}

function applyType(type){activeType=type;document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('active',t.dataset.type===type));render()}

function openRecord(id=null){
  const type=activeType,items=list();
  $('#recordForm').reset();
  $('#recordId').value='';
  $('#recordType').value=type;
  $('#recordCity').value='Diadema';
  $('#recordCreatedAt').value='Será registrada ao salvar';
  $('#customerFields').hidden=type!=='customer';
  $('#supplierFields').hidden=type!=='supplier';
  $('#recordEyebrow').textContent=type==='customer'?'Cadastro de cliente':'Cadastro de fornecedor';
  $('#recordTitle').textContent=type==='customer'?'Novo cliente':'Novo fornecedor';
  $('#nameLabel').textContent=type==='customer'?'Nome do cliente':'Nome/Razão social';
  $('#deleteRecord').hidden=true;
  let record=null;
  if(id){
    record=items.find(x=>x.id===id);
    if(!record)return;
    $('#recordId').value=record.id;
    $('#recordName').value=record.name;
    $('#recordDocument').value=record.document||'';
    $('#recordPhone').value=record.phone||'';
    $('#recordEmail').value=record.email||'';
    $('#recordAddress').value=record.address||'';
    $('#recordCity').value=record.city||'';
    $('#recordCreatedAt').value=fmtDate(record.createdAt);
    $('#recordNotes').value=record.notes||'';
    if(type==='customer'){$('#customerVehicle').value=record.vehicle||'';$('#customerPlate').value=record.plate||'';$('#customerColor').value=record.color||''}
    else{$('#supplierContact').value=record.contact||'';$('#supplierTerms').value=record.terms||''}
    $('#recordTitle').textContent=type==='customer'?'Editar cliente':'Editar fornecedor';
    $('#deleteRecord').hidden=false;
  }
  if(type==='customer')renderCustomerSales(record);
  $('#recordDialog').showModal();
}

$('#recordForm').onsubmit=e=>{
  e.preventDefault();
  const type=$('#recordType').value,id=$('#recordId').value,items=type==='customer'?customers:suppliers,document=$('#recordDocument').value.trim(),duplicate=document&&items.find(x=>x.document.replace(/\D/g,'')===document.replace(/\D/g,'')&&x.id!==id);
  if(duplicate){toast('Já existe um cadastro com esse CPF/CNPJ');return}
  const data={name:$('#recordName').value.trim(),document,phone:$('#recordPhone').value.trim(),email:$('#recordEmail').value.trim(),address:$('#recordAddress').value.trim(),city:$('#recordCity').value.trim(),notes:$('#recordNotes').value.trim()};
  if(type==='customer')Object.assign(data,{vehicle:$('#customerVehicle').value.trim(),plate:$('#customerPlate').value.trim().toUpperCase(),color:$('#customerColor').value.trim()});
  else Object.assign(data,{contact:$('#supplierContact').value.trim(),terms:$('#supplierTerms').value.trim()});
  if(id)Object.assign(items.find(x=>x.id===id),data);else items.unshift({id:uid(),createdAt:new Date().toISOString(),...data});
  store();$('#recordDialog').close();render();toast(id?'Cadastro atualizado':'Cadastro criado');
};

$('#deleteRecord').onclick=()=>{const id=$('#recordId').value;if(!id||!confirm('Excluir este cadastro?'))return;if(activeType==='customer')customers=customers.filter(x=>x.id!==id);else suppliers=suppliers.filter(x=>x.id!==id);store();$('#recordDialog').close();render();toast('Cadastro excluído')};
document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>applyType(t.dataset.type));
$('#newRecordBtn').onclick=()=>{applyType('customer');openRecord()};
$('#newSupplierBtn').onclick=()=>{applyType('supplier');openRecord()};
$('#recordSearch').oninput=render;
$('#closeRecord').onclick=()=>$('#recordDialog').close();
$('#cancelRecord').onclick=()=>$('#recordDialog').close();
render();
const requestedCustomer=new URLSearchParams(location.search).get('cliente');if(requestedCustomer&&customers.some(c=>c.id===requestedCustomer))setTimeout(()=>openRecord(requestedCustomer));
