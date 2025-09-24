// --- Utilities
const fmt = (v)=>{
  const n = Number(v)||0;
  return n.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
}

// State
const state = { rows: [] };

// Create initial 8 rows
function makeRow(id, pn = '', qty = 1, price = 0.00, refunded = false){
  return { id, pn, qty: Number(qty)||1, price: Number(price)||0, refunded: Boolean(refunded) };
}

const partsBody = document.getElementById('partsBody');
const kitPriceEl = document.getElementById('kitPrice');
const rowCountEl = document.getElementById('rowCount');

function init(){
  // Start with 8 empty rows instead of 10
  for(let i=0;i<8;i++) state.rows.push(makeRow(cryptoId(), '', 1, 0.00, false));
  renderRows();
  recalc();
  attachActions();
}

function cryptoId(){
  return Math.random().toString(36).slice(2,9);
}

function renderRows(){
  partsBody.innerHTML = '';
  state.rows.forEach((r, idx)=>{
    const tr = document.createElement('tr');
    tr.dataset.id = r.id;
    
    // Use placeholder for price instead of 0.00
    const priceValue = r.price === 0 ? '' : r.price.toFixed(2);
    const pricePlaceholder = '0.00';
    
    tr.innerHTML = `
      <td><input class="input-text" data-field="pn" value="${escapeHtml(r.pn)}" placeholder="Part #" /></td>
      <td><input class="input-num" type="number" min="1" data-field="qty" value="${r.qty}" /></td>
      <td><input class="input-num" type="number" min="0" step="0.01" data-field="price" value="${priceValue}" placeholder="${pricePlaceholder}" /></td>
      <td style="text-align:center"><input type="checkbox" data-field="refunded" ${r.refunded? 'checked': ''} /></td>
      <td style="text-align:right"><button class="btn ghost btn-del">Remove</button></td>
    `;
    partsBody.appendChild(tr);
  });
  rowCountEl.textContent = state.rows.length;
  // attach change listeners
  partsBody.querySelectorAll('input').forEach(inp=>{
    inp.addEventListener('input', onRowInput);
    inp.addEventListener('change', onRowInput);
  });
  partsBody.querySelectorAll('.btn-del').forEach(b=>b.addEventListener('click', onRemoveRow));
}

function escapeHtml(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

function onRowInput(e){
  const tr = e.target.closest('tr');
  const id = tr.dataset.id;
  const field = e.target.dataset.field;
  const row = state.rows.find(r=>r.id===id);
  if(!row) return;
  if(field==='pn') row.pn = e.target.value;
  if(field==='qty') row.qty = Math.max(1, Number(e.target.value)||1);
  if(field==='price') {
    const value = e.target.value;
    // If input is empty, set to 0 but keep placeholder visible
    row.price = value === '' ? 0 : Math.max(0, Number(value)||0);
  }
  if(field==='refunded') row.refunded = e.target.checked;
  recalc();
}

function onRemoveRow(e){
  const tr = e.target.closest('tr');
  const id = tr.dataset.id;
  const idx = state.rows.findIndex(r=>r.id===id);
  if(idx>-1) state.rows.splice(idx,1);
  renderRows();
  recalc();
}

function attachActions(){
  document.getElementById('addRow').addEventListener('click', ()=>{
    state.rows.push(makeRow(cryptoId(),'',1,0.00,false));
    renderRows(); recalc();
    // scroll to bottom
    window.scrollTo({top:document.body.scrollHeight,behavior:'smooth'});
  });

  document.getElementById('resetRows').addEventListener('click', ()=>{
    state.rows = [];
    // Reset to 8 rows instead of 10
    for(let i=0;i<8;i++) state.rows.push(makeRow(cryptoId(),'',1,0.00,false));
    renderRows(); recalc();
  });

  kitPriceEl.addEventListener('input', ()=>{ recalc(); });
}

// --- Core calculation (proportional allocation)
function recalc(){
  const kitPrice = Number(kitPriceEl.value)||0;
  const totalList = state.rows.reduce((s,r)=> s + (Number(r.price)||0) * (Number(r.qty)||1), 0);

  // Build per-item discounted piece price (per unit)
  // Allocation based on list price * qty share. We'll compute per-unit discounted price for display.
  let allocations = state.rows.map(r=>({
    id: r.id,
    pn: r.pn,
    qty: Number(r.qty)||1,
    listExtended: (Number(r.price)||0) * (Number(r.qty)||1),
    unitList: Number(r.price)||0,
    refunded: r.refunded
  }));

  // If totalList is zero, allocate zero to all
  if(totalList <= 0){
    allocations = allocations.map(a=>({...a, unitAllocated:0, extAllocated:0}));
  } else {
    allocations = allocations.map(a=>{
      const share = a.listExtended / totalList; // share of total list
      const extAllocated = share * kitPrice; // extended allocated value for this line
      const unitAllocated = a.qty ? extAllocated / a.qty : 0;
      return {...a, unitAllocated, extAllocated};
    });
  }

  // Round allocations to 2 decimals for display; keep a tiny internal accurate sum to compute remainder
  const allocatedTotal = allocations.reduce((s,a)=> s + Number(a.extAllocated||0), 0);

  // Show results in right panel
  document.getElementById('totalList').textContent = '$' + fmt(totalList);
  document.getElementById('kitPriceDisplay').textContent = '$' + fmt(kitPrice);
  document.getElementById('allocatedTotal').textContent = '$' + fmt(allocatedTotal);

  // Refund total: sum of extAllocated for rows where refunded===true
  const refundTotal = allocations.reduce((s,a)=> s + (a.refunded ? Number(a.extAllocated||0) : 0), 0);
  document.getElementById('refundTotal').textContent = '$' + fmt(refundTotal);

  // Render per-line result list
  const listResults = document.getElementById('listResults');
  listResults.innerHTML = '';
  allocations.forEach(a=>{
    const div = document.createElement('div');
    div.className = 'part-line';
    div.innerHTML = `
      <div>
        <div class="pn">${escapeHtml(a.pn || '(no part)')}</div>
        <div class="muted">Qty ${a.qty} • List $${fmt(a.unitList)} each • Ext list $${fmt(a.listExtended)}</div>
      </div>
      <div style="text-align:right">
        <div class="muted">Unit alloc.</div>
        <div style="font-weight:800">$ ${fmt(a.unitAllocated)}</div>
      </div>
      <div style="text-align:right">
        <div class="muted">Ext alloc.</div>
        <div style="font-weight:800">$ ${fmt(a.extAllocated)}</div>
      </div>
    `;
    listResults.appendChild(div);
  });

  // Balance note
  const note = document.getElementById('balanceNote');
  const diff = Math.abs(allocatedTotal - kitPrice);
  if(diff < 0.005){
    note.textContent = 'Amounts are balanced';
    note.style.borderColor = 'var(--accent)';
    note.style.color = 'var(--accent)';
  } else {
    note.textContent = 'Allocated total differs from kit price by $' + fmt(allocatedTotal - kitPrice);
    note.style.borderColor = '#ff3333';
    note.style.color = '#ff3333';
  }
}

// Initialize
init();
