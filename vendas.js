const KEYS={sales:'loja-pos-sales-v1',customers:'loja-pos-customers-v1',products:'loja-pos-products-v1',cancelledSales:'loja-pos-cancelled-sales-v1'};
const $=s=>document.querySelector(s),money=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}),esc=(v='')=>String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch{return fallback}},normalize=v=>String(v||'').trim().toLocaleLowerCase('pt-BR');
let sales=read(KEYS.sales,[]);
const customers=read(KEYS.customers,[]),params=new URLSearchParams(location.search);
let selectedSaleId='';
let customerId=params.get('cliente')||'';
let activeView=params.get('aba')==='orcamentos'&&!customerId&&!params.get('venda')?'quotes':'sales';

function validDate(value){const date=new Date(value);return Number.isNaN(date.getTime())?new Date(0):date}
function dateKey(value){const d=validDate(value),year=d.getFullYear(),month=String(d.getMonth()+1).padStart(2,'0'),day=String(d.getDate()).padStart(2,'0');return`${year}-${month}-${day}`}
function timeLabel(value){return new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit'}).format(validDate(value))}
function dateTimeLabel(value){return new Intl.DateTimeFormat('pt-BR',{dateStyle:'long',timeStyle:'short'}).format(validDate(value))}
function customerForSale(sale){return customers.find(c=>c.id===sale.customerId)||null}
function isCustomerSale(sale,customer){return sale.customerId===customer.id||(!sale.customerId&&normalize(sale.customer)===normalize(customer.name))}
function saleCost(sale){return(sale.items||[]).reduce((sum,item)=>sum+Number(item.cost||0)*Number(item.qty||1),0)}
function saleProfit(sale){return Number(sale.total||0)-saleCost(sale)}

function dayLabel(key){
  const date=new Date(`${key}T12:00:00`),today=new Date(),yesterday=new Date();yesterday.setDate(today.getDate()-1);
  if(key===dateKey(today))return'Hoje';
  if(key===dateKey(yesterday))return'Ontem';
  const weekday=new Intl.DateTimeFormat('pt-BR',{weekday:'long'}).format(date);
  const full=new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'long',year:'numeric'}).format(date);
  return`${weekday.charAt(0).toUpperCase()+weekday.slice(1)}, ${full}`;
}

function visibleSales(){
  const query=normalize($('#saleSearch').value),from=$('#dateFrom').value,to=$('#dateTo').value,payment=$('#paymentFilter').value,customer=customers.find(c=>c.id===customerId);
  return sales.filter(sale=>{
    const key=dateKey(sale.createdAt),haystack=normalize(`${sale.number} ${sale.customer} ${sale.operator} ${sale.payment} ${(sale.items||[]).map(i=>i.name).join(' ')}`);
    return(!query||haystack.includes(query))&&(!from||key>=from)&&(!to||key<=to)&&(!payment||sale.payment===payment)&&(!customer||isCustomerSale(sale,customer));
  }).sort((a,b)=>validDate(b.createdAt)-validDate(a.createdAt));
}

function saleRow(sale){
  const customer=customerForSale(sale),items=sale.items||[],itemsText=items.slice(0,2).map(i=>`${i.trackStock===false?'Serviço: ':''}${esc(i.name)}`).join(' • '),more=items.length>2?` +${items.length-2}`:'';
  return`<article class="sale-row"><time datetime="${esc(sale.createdAt)}">${timeLabel(sale.createdAt)}</time><div class="sale-number"><strong>#${String(sale.number||0).padStart(4,'0')}</strong><small>${esc(sale.operator||'Operador não informado')}</small></div><div class="sale-customer"><strong>${esc(sale.customer||'Consumidor')}</strong>${customer?'<small class="linked">✓ Cliente cadastrado</small>':'<small>Venda sem cadastro vinculado</small>'}</div><div class="sale-items"><strong>${itemsText||'Itens não informados'}${more}</strong><small>${items.length} ${items.length===1?'item':'itens'}</small></div><span class="payment">${esc(sale.payment||'—')}</span><strong class="sale-total">${money.format(Number(sale.total||0))}</strong><button class="detail-button" data-sale="${esc(sale.id)}">Ver detalhes</button></article>`;
}

function render(){
  const list=visibleSales(),customer=customers.find(c=>c.id===customerId);
  $('#salesCount').textContent=list.length;$('#resultCount').textContent=`${list.length} ${list.length===1?'venda':'vendas'}`;
  $('#customerFilter').hidden=!customer;if(customer)$('#customerFilterName').textContent=customer.name;
  const groups=new Map();list.forEach(sale=>{const key=dateKey(sale.createdAt);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(sale)});
  $('#salesGroups').innerHTML=list.length?[...groups].map(([key,daySales])=>`<section class="day-group"><header><div><h2>${dayLabel(key)}</h2><small>${daySales.length} ${daySales.length===1?'venda':'vendas'}</small></div></header><div class="day-sales">${daySales.map(saleRow).join('')}</div></section>`).join(''):'<div class="empty-state"><span>▦</span><strong>Nenhuma venda encontrada</strong><p>As vendas finalizadas no caixa aparecerão aqui, separadas por dia e horário.</p><a class="button button-primary" href="caixa.html">Ir para o caixa</a></div>';
  document.querySelectorAll('[data-sale]').forEach(button=>button.onclick=()=>openSale(button.dataset.sale));
}

function openSale(id){
  const sale=sales.find(s=>s.id===id);if(!sale)return;
  selectedSaleId=id;
  const customer=customerForSale(sale),items=sale.items||[];
  $('#detailNumber').textContent=`#${String(sale.number||0).padStart(4,'0')}`;
  $('#detailMeta').innerHTML=`<div><small>Data e horário</small><strong>${dateTimeLabel(sale.createdAt)}</strong></div><div><small>Cliente</small><strong>${esc(sale.customer||'Consumidor')}</strong>${customer?`<a href="cadastros.html?cliente=${encodeURIComponent(customer.id)}">Abrir cadastro vinculado</a>`:''}</div><div><small>Pagamento</small><strong>${esc(sale.payment||'Não informado')}</strong></div><div><small>Operador</small><strong>${esc(sale.operator||'Não informado')}</strong></div>`;
  $('#detailItems').innerHTML=`<p class="section-label">Itens da venda</p>${items.map(i=>`<div class="detail-item"><span><strong>${esc(i.name)}</strong><small>${i.trackStock===false?'Mão de obra':`${Number(i.qty||1)} × ${money.format(Number(i.price||0))}`}</small></span><b>${money.format(Number(i.price||0)*Number(i.qty||1))}</b></div>`).join('')||'<p class="no-items">Itens não informados</p>'}`;
  $('#detailTotals').innerHTML=`<div><span>Subtotal</span><strong>${money.format(Number(sale.subtotal??sale.total??0))}</strong></div>${Number(sale.discount||0)?`<div><span>Desconto</span><strong>− ${money.format(Number(sale.discount))}</strong></div>`:''}<div class="grand-total"><span>Total</span><strong>${money.format(Number(sale.total||0))}</strong></div>${sale.payment==='Dinheiro'?`<div><span>Recebido</span><strong>${money.format(Number(sale.received||0))}</strong></div><div><span>Troco</span><strong>${money.format(Number(sale.change||0))}</strong></div>`:''}`;
  $('#saleDialog').showModal();
}

function requestSaleCancellation(){
  const sale=sales.find(s=>s.id===selectedSaleId);if(!sale)return;
  const stockItems=(sale.items||[]).filter(item=>item.trackStock!==false&&item.productId);
  $('#cancelSaleNumber').textContent=`#${String(sale.number||0).padStart(4,'0')}`;
  $('#cancelSaleMessage').textContent=stockItems.length?`${stockItems.length} ${stockItems.length===1?'produto será devolvido':'produtos serão devolvidos'} ao estoque.`:'Esta venda não possui produtos para devolver ao estoque.';
  $('#confirmCancelSale').disabled=false;$('#confirmCancelSale').textContent='Sim, excluir e devolver';
  $('#cancelSaleDialog').showModal();
}

function completeSaleCancellation(){
  const sale=sales.find(s=>s.id===selectedSaleId);if(!sale){$('#cancelSaleDialog').close();return}
  const confirmButton=$('#confirmCancelSale');confirmButton.disabled=true;confirmButton.textContent='Excluindo…';
  try{
    const stockItems=(sale.items||[]).filter(item=>item.trackStock!==false&&item.productId);
    const products=read(KEYS.products,[]),restored=[],notFound=[];
    stockItems.forEach(item=>{const product=products.find(p=>p.id===item.productId),qty=Math.max(1,Number(item.qty)||1);if(product){product.stock=Math.max(0,Number(product.stock)||0)+qty;restored.push({productId:item.productId,name:item.name,qty})}else notFound.push({productId:item.productId,name:item.name,qty})});
    const cancelled=read(KEYS.cancelledSales,[]),remainingSales=sales.filter(item=>item.id!==sale.id);
    cancelled.unshift({...sale,cancelledAt:new Date().toISOString(),stockRestored:restored,stockNotFound:notFound});
    localStorage.setItem(KEYS.products,JSON.stringify(products));localStorage.setItem(KEYS.cancelledSales,JSON.stringify(cancelled));localStorage.setItem(KEYS.sales,JSON.stringify(remainingSales));
    sales=remainingSales;selectedSaleId='';$('#cancelSaleDialog').close();$('#saleDialog').close();render();
    alert(notFound.length?'Venda excluída. Os produtos encontrados voltaram ao estoque, mas alguns itens antigos não existem mais no cadastro.':'Venda excluída e produtos devolvidos ao estoque com sucesso.');
  }catch(error){console.error('Falha ao excluir venda',error);confirmButton.disabled=false;confirmButton.textContent='Tentar novamente';alert('Não foi possível excluir a venda. Nenhuma alteração foi concluída. Tente novamente.')}
}

function setView(view,updateUrl=true){
  activeView=view==='quotes'?'quotes':'sales';
  $('#salesView').hidden=activeView!=='sales';
  $('#quotesView').hidden=activeView!=='quotes';
  document.querySelectorAll('[data-view]').forEach(button=>button.classList.toggle('active',button.dataset.view===activeView));
  $('#viewEyebrow').textContent=activeView==='sales'?'Histórico completo':'Entrada da oficina';
  $('#viewSubtitle').textContent=activeView==='sales'?'Consulte cada dia, horário, cliente, pagamento e valor vendido.':'Acompanhe os orçamentos e as motos em serviço sem sair desta aba.';
  $('#newMovementAction').textContent=activeView==='sales'?'＋ Nova venda':'＋ Orçamento com peças';
  if(updateUrl){const url=new URL(location.href);if(activeView==='quotes'){url.search='?aba=orcamentos'}else{url.searchParams.delete('aba')}history.replaceState({},'',url)}
}

[$('#saleSearch'),$('#dateFrom'),$('#dateTo'),$('#paymentFilter')].forEach(el=>el.oninput=render);
$('#clearFilters').onclick=()=>{$('#saleSearch').value='';$('#dateFrom').value='';$('#dateTo').value='';$('#paymentFilter').value='';render()};
$('#clearCustomerFilter').onclick=()=>{customerId='';history.replaceState({},'',location.pathname);render()};
$('#closeSale').onclick=$('#closeSaleFooter').onclick=()=>$('#saleDialog').close();
$('#printSale').onclick=()=>window.print();
$('#cancelSale').addEventListener('click',requestSaleCancellation);
$('#keepSale').addEventListener('click',()=>$('#cancelSaleDialog').close());
$('#confirmCancelSale').addEventListener('click',completeSaleCancellation);
document.querySelectorAll('[data-view]').forEach(button=>button.onclick=()=>setView(button.dataset.view));
render();
setView(activeView,false);
const requestedSale=params.get('venda');if(requestedSale)setTimeout(()=>openSale(requestedSale));
