/*
  Trustvault single-file frontend app
  - All state in localStorage under key STORE_KEY
  - Admin password stored in localStorage (simple string) under PWD_KEY
  - Charts use Chart.js
  - Tailwind provides all styles
*/

/* -----------------------
   Helpers & storage
   ----------------------- */
const STORE_KEY = 'trustvault_store_v1';
const PWD_KEY = 'trustvault_admin_pwd_v1';

const uid = ()=> Date.now().toString(36) + Math.random().toString(36).slice(2,8);
const todayYMD = ()=> { const d = new Date(); d.setHours(0,0,0,0); return d.toISOString().slice(0,10); };
const fmtCurrency = (n,cur)=> {
  try {
    // Map KES to "KES" (Intl doesn't support KES symbol universally),
    if(cur === 'KES') return new Intl.NumberFormat('en-KE', { style:'currency', currency:'KES', maximumFractionDigits:0 }).format(n);
    return new Intl.NumberFormat(undefined, { style:'currency', currency:cur, maximumFractionDigits:0 }).format(n);
  } catch(e) { return cur + ' ' + n; }
};

function loadStore(){
  const raw = localStorage.getItem(STORE_KEY);
  if(raw) return JSON.parse(raw);
  const seed = {
    admin: { name: 'Admin', email: '' },
    settings: {
      target: 50000, estTime: 90, dailyMin: 100, currency: 'KES',
      methods: ['bank','cash','card','paypal','empesa']
    },
    members: [],
    transactions: [],    // {id, memberId, type:'deposit'|'withdraw', amount, date, method, note}
    messages: [],        // {id,type,text,date,memberId,level}
    todos: []            // {id, title, type:'note'|'event'|'minutes', date, body}
  };
  localStorage.setItem(STORE_KEY, JSON.stringify(seed));
  return seed;
}
function saveStore(s){ localStorage.setItem(STORE_KEY, JSON.stringify(s)); }
let store = loadStore();

/* -----------------------
   Authentication overlay handling
   - If a password is present in localStorage (PWD_KEY) the user must enter it
   - If no password exists, the user must set one (first-run)
   ----------------------- */
let lastDay; // declared here; will be set when app initializes

function authOverlayEl(){ return document.getElementById('authOverlay'); }
function showAuthUI(){
  const overlay = authOverlayEl();
  if(!overlay) { initApp(); return; }
  const stored = localStorage.getItem(PWD_KEY);
  const title = document.getElementById('authTitle');
  const setFields = document.getElementById('authSetFields');
  const enterFields = document.getElementById('authEnterFields');
  const msg = document.getElementById('authMsg');
  const submit = document.getElementById('authSubmit');

  if(!stored){
    title.textContent = 'Set admin password';
    setFields.classList.remove('hidden');
    enterFields.classList.add('hidden');
    submit.textContent = 'Set password';
  } else {
    title.textContent = 'Enter password';
    setFields.classList.add('hidden');
    enterFields.classList.remove('hidden');
    submit.textContent = 'Enter';
  }
  msg.classList.add('hidden');
  overlay.classList.remove('hidden');

  submit.onclick = function(){
    if(!localStorage.getItem(PWD_KEY)){
      const p1 = document.getElementById('authPwd1').value || '';
      const p2 = document.getElementById('authPwd2').value || '';
      if(!p1){ msg.textContent = 'Password required'; msg.classList.remove('hidden'); return; }
      if(p1 !== p2){ msg.textContent = 'Passwords do not match'; msg.classList.remove('hidden'); return; }
      localStorage.setItem(PWD_KEY, p1);
      hideAuthUI();
      initApp();
    } else {
      const p = document.getElementById('authPwd').value || '';
      if(p === localStorage.getItem(PWD_KEY)){
        hideAuthUI();
        initApp();
      } else { msg.textContent = 'Incorrect password'; msg.classList.remove('hidden'); }
    }
  };
}
function hideAuthUI(){ const o = authOverlayEl(); if(o) o.classList.add('hidden'); }

function initApp(){
  // start the app (render + periodic rollover)
  refreshAll();
  // apply saved appearance immediately
  if(store.settings && store.settings.appearance === 'dark') document.body.classList.add('dark-mode');
  lastDay = todayYMD();
  setInterval(()=>{
    const now = todayYMD();
    if(now !== lastDay){
      lastDay = now;
      store.messages.push({ id: uid(), type:'Day rollover', text: `New day ${now}`, date: new Date().toISOString(), level:'info' });
      saveStore(store);
      refreshAll();
    }
  }, 60_000);
}

/* -----------------------
   Admin password logic
   - First run: no password in storage -> settable at first login overlay
   - After set: must provide password to open app
   ----------------------- */

// Password feature removed — no first-run helper needed

// Login removed: app runs without password barrier

/* -----------------------
   UI & Navigation
   ----------------------- */
const pageEls = {
  dashboard: document.getElementById('page-dashboard'),
  members: document.getElementById('page-members'),
  savings: document.getElementById('page-savings'),
  messages: document.getElementById('page-messages'),
  statistics: document.getElementById('page-statistics'),
  invoices: document.getElementById('page-invoices'),
  todo: document.getElementById('page-todo'),
  finances: document.getElementById('page-finances'),
  help: document.getElementById('page-help'),
  settings: document.getElementById('page-settings')
};
const sidebarBtns = document.querySelectorAll('.sidebar-btn');
sidebarBtns.forEach(b=>{
  b.addEventListener('click', ()=> {
    sidebarBtns.forEach(x=> x.classList.remove('active'));
    b.classList.add('active');
    const p = b.getAttribute('data-page');
    Object.keys(pageEls).forEach(k=> pageEls[k].classList.add('hidden'));
    pageEls[p].classList.remove('hidden');
    // small refreshes for pages that need it
    if(p === 'dashboard') renderDashboard();
    if(p === 'members') renderMembers();
    if(p === 'savings') renderSavings();
    if(p === 'messages') renderMessages();
    if(p === 'statistics') renderStats();
    if(p === 'invoices') renderInvoices();
    if(p === 'todo') renderTodos();
    if(p === 'finances') renderFinances();
    if(p === 'settings') loadSettingsUI();
  });
});
document.getElementById('logoutBtn').addEventListener('click', ()=> {
  // show auth overlay to require re-authentication
  if(typeof showAuthUI === 'function') showAuthUI();
  else location.reload();
});

// Mobile sidebar toggle (off-canvas drawer)
const mobileMenuBtn = document.getElementById('mobileMenuBtn');
const sidebar = document.getElementById('sidebar');
const sidebarBackdrop = document.getElementById('sidebarBackdrop');
const sidebarCloseBtn = document.getElementById('sidebarCloseBtn');
function openSidebar(){
  sidebar.classList.remove('-translate-x-full');
  sidebar.setAttribute('aria-hidden', 'false');
  sidebarBackdrop.classList.remove('hidden');
  sidebarBackdrop.classList.add('block');
  // focus the first focusable item in sidebar
  const focusable = sidebar.querySelector('button, [href], input, select, textarea');
  if(focusable) focusable.focus();
}
function closeSidebar(){
  sidebar.classList.add('-translate-x-full');
  sidebar.setAttribute('aria-hidden', 'true');
  sidebarBackdrop.classList.add('hidden');
  sidebarBackdrop.classList.remove('block');
  // return focus to mobile menu button
  if(mobileMenuBtn) mobileMenuBtn.focus();
}

// Focus trap implementation for the drawer
let _sidebarKeyHandler = null;
function getFocusable(container){
  return Array.from(container.querySelectorAll('a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'))
    .filter(el => el.offsetParent !== null);
}
function enableFocusTrap(){
  _sidebarKeyHandler = function(e){
    if(e.key === 'Escape') { closeSidebar(); }
    if(e.key === 'Tab'){
      const focusable = getFocusable(sidebar);
      if(focusable.length === 0) { e.preventDefault(); return; }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if(e.shiftKey){ // backwards
        if(document.activeElement === first){ e.preventDefault(); last.focus(); }
      } else { // forwards
        if(document.activeElement === last){ e.preventDefault(); first.focus(); }
      }
    }
  };
  document.addEventListener('keydown', _sidebarKeyHandler);
}
function disableFocusTrap(){ if(_sidebarKeyHandler){ document.removeEventListener('keydown', _sidebarKeyHandler); _sidebarKeyHandler = null; } }
if(mobileMenuBtn){ mobileMenuBtn.addEventListener('click', ()=> { openSidebar(); }); }
if(sidebarBackdrop){ sidebarBackdrop.addEventListener('click', ()=> closeSidebar()); }
if(sidebarCloseBtn){ sidebarCloseBtn.addEventListener('click', ()=> closeSidebar()); }
// close sidebar after navigation on mobile
document.querySelectorAll('.sidebar-btn').forEach(b=> b.addEventListener('click', ()=> { if(window.innerWidth < 768) closeSidebar(); }));

// Enhance open/close to manage focus trap
const _origOpen = openSidebar; const _origClose = closeSidebar;
openSidebar = function(){ _origOpen(); enableFocusTrap(); };
closeSidebar = function(){ disableFocusTrap(); _origClose(); };

/* -----------------------
   Charts
   ----------------------- */
let donutChart = null;
let lineChart = null;

function buildDonut(){
  const ctx = document.getElementById('donut').getContext('2d');
  const totals = store.members.map(m=>{
    const total = store.transactions.filter(t=> t.memberId===m.id).reduce((s,t)=> t.type==='deposit'? s+t.amount : s - t.amount, 0);
    return { name: m.name || '—', total: Math.max(0, total) };
  }).filter(x=> x.total > 0);
  const labels = totals.map(x=> x.name);
  const data = totals.map(x=> x.total);
  const colors = labels.map((_,i)=> `hsl(${(i*52)%360} 75% 55%)`);
  if(donutChart) donutChart.destroy();
  donutChart = new Chart(ctx, {
    type:'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: colors }]},
    options: { plugins:{ legend:{ position:'right', labels:{ boxWidth:12 } } } }
  });
}

function buildLine(){
  const ctx = document.getElementById('line').getContext('2d');
  // last 14 days
  const days = [];
  for(let i=13;i>=0;i--){
    const d = new Date(); d.setDate(d.getDate()-i); d.setHours(0,0,0,0);
    days.push(d.toISOString().slice(0,10));
  }
  const data = days.map(day => store.transactions.filter(t=> t.date.slice(0,10)===day).reduce((s,t)=> t.type==='deposit'? s+t.amount : s - t.amount, 0));
  if(lineChart) lineChart.destroy();
  lineChart = new Chart(ctx, {
    type:'line',
    data: { labels: days.map(d=> new Date(d).toLocaleDateString()), datasets: [{ label:'Daily savings', data, fill:true, tension:0.3 }]},
    options: { scales:{ y:{ beginAtZero:true } } }
  });
}

/* -----------------------
   Rendering functions
   ----------------------- */
function refreshAll(){
  saveStore(store);
  document.getElementById('adminNameShort').textContent = store.admin.name || 'Admin';
  document.getElementById('currencyShort').textContent = store.settings.currency || 'KES';
  renderDashboard();
  renderMembers();
  renderSavings();
  renderMessages();
  renderStats();
  renderInvoices();
  renderTodos();
  renderFinances();
}

// Dashboard
function renderDashboard(){
  // KPIs
  const totalSaved = store.transactions.reduce((s,t)=> t.type==='deposit'? s+t.amount: s - t.amount, 0);
  document.getElementById('kpiMembers').textContent = store.members.length;
  document.getElementById('kpiSavings').textContent = fmtCurrency(totalSaved, store.settings.currency);
  document.getElementById('kpiRecent').textContent = (store.members.slice(-1)[0] || {}).name || '—';
  document.getElementById('kpiTarget').textContent = fmtCurrency(store.settings.target || 0, store.settings.currency);
  document.getElementById('kpiTargetSub').textContent = (store.settings.estTime||0) + ' days est.';

  // charts smaller intentionally to make recent transactions visible
  buildDonut();
  buildLine();

  // recent transactions
  const tbody = document.getElementById('recentTbody'); tbody.innerHTML = '';
  const recent = store.transactions.slice().reverse().slice(0,8);
  recent.forEach((t,i)=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td class="text-xs text-slate-500">${i+1}</td>
                    <td>${(store.members.find(m=>m.id===t.memberId)||{}).name || '—'}</td>
                    <td>${t.type}</td>
                    <td>${fmtCurrency(t.amount, store.settings.currency)}</td>
                    <td class="text-xs text-slate-400">${new Date(t.date).toLocaleString()}</td>
                    <td>${t.method || ''}</td>`;
    tbody.appendChild(tr);
  });
}

// Members
function renderMembers(){
  const tbody = document.getElementById('membersTbody'); tbody.innerHTML = '';

  const query = (document.getElementById('memberSearch') || {}).value?.toLowerCase?.() || '';
  const filtered = store.members.filter(m => {
    if(!query) return true;
    return (m.name || '').toLowerCase().includes(query) || (m.phone || '').toLowerCase().includes(query);
  });

  filtered.forEach((m, idx)=>{
    const saved = store.transactions.filter(t=> t.memberId===m.id).reduce((s,t)=> t.type==='deposit'? s+t.amount : s - t.amount, 0);
    // main row
    const tr = document.createElement('tr'); tr.className = 'member-row hover:bg-slate-50';
    tr.innerHTML = `<td class="p-3 text-xs text-slate-500"><input type="checkbox" class="member-select" data-id="${m.id}" /></td>
                    <td class="p-3 flex items-center gap-3"><div class="w-10 h-10 rounded-full overflow-hidden border-2 bg-slate-100"><img src="${m.avatar||'jlc.jpg'}" alt="avatar" class="w-full h-full object-cover"/></div><div><div class="font-semibold">${m.name || '—'}</div><div class="text-xs text-slate-400">ID: ${m.id.slice(-6)}</div></div></td>
                    <td class="p-3"><span class="badge ${saved>0? 'badge-completed':'badge-pending'}">${saved>0 ? 'Active' : 'New'}</span></td>
                    <td class="p-3 text-xs text-slate-400">${new Date(m.joined).toLocaleDateString()}</td>
                    <td class="p-3 text-xs">${m.phone || '—'}</td>
                    <td class="p-3 font-semibold">${fmtCurrency(saved, store.settings.currency)}</td>
                    <td class="p-3 text-xs">${m.preferredMethod || '—'}</td>
                    <td class="p-3"><button class="text-xs text-sky-600 openMemberBtn" data-id="${m.id}">Details</button></td>`;
    tbody.appendChild(tr);

    // detail row (hidden by default)
    const trd = document.createElement('tr'); trd.className = 'member-detail hidden';
    trd.innerHTML = `<td colspan="8" class="p-4 bg-slate-50">
        <div class="grid md:grid-cols-3 gap-4">
          <div>
            <div class="font-semibold">Member info</div>
            <div class="text-xs text-slate-500">${m.email || 'No email provided'}</div>
            <div class="text-xs mt-2">Joined: ${new Date(m.joined).toLocaleString()}</div>
          </div>
          <div>
            <div class="font-semibold">Recent activity</div>
            <div class="text-xs text-slate-500">${store.transactions.filter(t=> t.memberId===m.id).slice(-3).reverse().map(t=> `${t.type} ${fmtCurrency(t.amount, store.settings.currency)} (${new Date(t.date).toLocaleDateString()})`).join('<br/>') || 'No activity'}</div>
          </div>
          <div class="text-right">
            <div class="font-semibold">Balance</div>
            <div class="text-xl font-bold">${fmtCurrency(saved, store.settings.currency)}</div>
            <div class="mt-3"><button class="px-3 py-1 bg-emerald-600 text-white rounded depositQuick" data-id="${m.id}">Deposit</button> <button class="px-3 py-1 bg-rose-500 text-white rounded withdrawQuick" data-id="${m.id}">Withdraw</button></div>
          </div>
        </div>
      </td>`;
    tbody.appendChild(trd);
  });

  // actions: details toggle, edit & delete
  document.querySelectorAll('.openMemberBtn').forEach(b=> b.addEventListener('click', e=>{
    const id = e.target.dataset.id;
    // find the main row and the next detail row
    const btn = e.target;
    const row = btn.closest('tr');
    if(!row) return;
    const next = row.nextElementSibling;
    if(next && next.classList.contains('member-detail')) next.classList.toggle('hidden');
  }));

  // quick deposit/withdraw
  document.querySelectorAll('.depositQuick').forEach(b=> b.addEventListener('click', e=>{
    const id = e.target.dataset.id; document.getElementById('memberSelect').value = id; document.getElementById('depositBtn').click();
  }));
  document.querySelectorAll('.withdrawQuick').forEach(b=> b.addEventListener('click', e=>{
    const id = e.target.dataset.id; document.getElementById('memberSelect').value = id; document.getElementById('withdrawBtn').click();
  }));

  // select all
  const selectAll = document.getElementById('selectAllMembers');
  if(selectAll){ selectAll.checked = false; selectAll.addEventListener('change', ()=>{
    document.querySelectorAll('.member-select').forEach(cb=> cb.checked = selectAll.checked);
  }); }

  // wire search input (live filter)
  const search = document.getElementById('memberSearch');
  if(search){ search.addEventListener('input', ()=> { renderMembers(); }); }
}

// Savings page
function renderSavings(){
  const sel = document.getElementById('memberSelect'); sel.innerHTML = '<option value="">-- Select member --</option>';
  store.members.forEach(m=> {
    const o = document.createElement('option'); o.value = m.id; o.textContent = m.name; sel.appendChild(o);
  });

  // transactions table
  const tbody = document.getElementById('transactionsTbody'); tbody.innerHTML = '';
  store.transactions.slice().reverse().forEach((t, idx)=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td class="text-xs text-slate-500">${idx+1}</td>
                    <td>${(store.members.find(m=>m.id===t.memberId)||{}).name || '—'}</td>
                    <td>${t.type}</td>
                    <td>${fmtCurrency(t.amount, store.settings.currency)}</td>
                    <td class="text-xs text-slate-400">${new Date(t.date).toLocaleString()}</td>
                    <td>${t.method || ''}</td>
                    <td><button class="delTxBtn text-xs text-rose-600" data-id="${t.id}">Delete</button></td>`;
    tbody.appendChild(tr);
  });

  document.querySelectorAll('.delTxBtn').forEach(b=> b.addEventListener('click', e=>{
    const id = e.target.dataset.id;
    if(!confirm('Delete transaction?')) return;
    store.transactions = store.transactions.filter(tx => tx.id !== id);
    store.messages.push({ id: uid(), type:'Transaction deleted', text:'A transaction was deleted', date:new Date().toISOString(), level:'info' });
    refreshAll();
  }));

  // selected member balance
  document.getElementById('memberSelect').addEventListener('change', ()=>{
    const id = document.getElementById('memberSelect').value;
    if(!id) { document.getElementById('selectedBalance').textContent = fmtCurrency(0, store.settings.currency); return; }
    const bal = store.transactions.filter(t=> t.memberId===id).reduce((s,t)=> t.type==='deposit'? s+t.amount : s - t.amount, 0);
    document.getElementById('selectedBalance').textContent = fmtCurrency(bal, store.settings.currency);
  });
}

// Messages
function renderMessages(){
  const wrap = document.getElementById('messagesList'); wrap.innerHTML = '';
  const msgs = store.messages.slice().reverse();
  msgs.forEach(m=>{
    const el = document.createElement('div');
    el.className = 'p-3 border rounded flex items-start gap-3';
    const levelColor = m.level === 'danger' ? 'text-rose-600' : 'text-slate-600';
    el.innerHTML = `<div class="${levelColor}"><i class="fa-solid fa-circle-exclamation"></i></div>
                    <div class="flex-1"><div class="font-semibold">${m.type}</div><div class="text-xs text-slate-500">${m.text}</div></div>
                    <div class="text-xs text-slate-400">${new Date(m.date).toLocaleString()}</div>`;
    wrap.appendChild(el);
  });
  // show red dot if any danger messages
  const hasDanger = store.messages.some(m=> m.level==='danger');
  document.getElementById('msgDot').classList.toggle('hidden', !hasDanger);
}

// Stats
function renderStats(){
  const wrap = document.getElementById('statsList'); wrap.innerHTML = '';
  const totals = store.members.map(m=> {
    const t = store.transactions.filter(tx => tx.memberId===m.id).reduce((s,tx)=> tx.type==='deposit'? s+tx.amount : s - tx.amount, 0);
    return { name: m.name || '—', total: Math.max(0,t) };
  });
  const totalAll = totals.reduce((s,x)=> s+x.total, 0) || 1;
  totals.forEach(t=>{
    const pct = Math.round((t.total / totalAll) * 100);
    const el = document.createElement('div'); el.className = 'p-3 border rounded';
    el.innerHTML = `<div class="flex justify-between"><div class="font-semibold">${t.name}</div><div class="text-xs text-slate-500">${fmtCurrency(t.total, store.settings.currency)}</div></div><div class="text-xs text-slate-400">${pct}% of total</div>`;
    wrap.appendChild(el);
  });
}

// Invoices
function renderInvoices(){
  // Enhanced invoices rendering: summary cards + tabs + table
  const tbody = document.getElementById('invoicesTbody'); if(!tbody) return; tbody.innerHTML = '';
  const today = todayYMD();
  const dailyMin = Number(store.settings.dailyMin) || 0;

  // compute counts & values
  let paidCount = 0, unpaidCount = 0, overdueCount = 0, draftCount = 0;
  store.members.forEach(m=>{
    const savedToday = store.transactions.filter(t=> t.memberId===m.id && t.type==='deposit' && t.date.slice(0,10)===today).reduce((s,t)=> s+t.amount, 0);
    if(savedToday >= dailyMin && dailyMin > 0) paidCount++;
    else if(savedToday === 0) unpaidCount++;
    else if(savedToday > 0 && savedToday < dailyMin) overdueCount++;
    else draftCount++;
  });

  document.getElementById('paidCount').textContent = paidCount;
  document.getElementById('unpaidCount').textContent = unpaidCount;
  document.getElementById('overdueCount').textContent = overdueCount;
  document.getElementById('draftCount').textContent = draftCount;

  document.getElementById('paidValue').textContent = fmtCurrency(paidCount * dailyMin, store.settings.currency);
  document.getElementById('unpaidValue').textContent = fmtCurrency(unpaidCount * dailyMin, store.settings.currency);
  document.getElementById('overdueValue').textContent = fmtCurrency(overdueCount * dailyMin, store.settings.currency);
  document.getElementById('draftValue').textContent = fmtCurrency(draftCount * dailyMin, store.settings.currency);

  // decide filter from active tab
  const activeTab = document.querySelector('.invoices-tab.active');
  const filter = activeTab ? activeTab.getAttribute('data-filter') : 'all';

  // build list
  const list = store.members.map((m, idx)=>{
    const savedToday = store.transactions.filter(t=> t.memberId===m.id && t.type==='deposit' && t.date.slice(0,10)===today).reduce((s,t)=> s+t.amount, 0);
    let status = 'Draft';
    if(savedToday >= dailyMin && dailyMin > 0) status = 'Paid';
    else if(savedToday === 0) status = 'Unpaid';
    else if(savedToday > 0 && savedToday < dailyMin) status = 'Overdue';
    return { idx, m, savedToday, status };
  }).filter(item => {
    if(filter === 'all') return true;
    return item.status.toLowerCase() === filter;
  });

  // populate table
  list.forEach((item, i)=>{
    const m = item.m;
    const tr = document.createElement('tr');
    tr.innerHTML = `<td class="text-xs text-slate-500">${i+1}</td>
                    <td>${m.name}</td>
                    <td class="text-xs text-slate-400">${new Date(today).toLocaleDateString()}</td>
                    <td>${fmtCurrency(dailyMin || 0, store.settings.currency)}</td>
                    <td>${item.status}</td>
                    <td><button class="remindBtn text-xs text-sky-600" data-id="${m.id}">Remind</button></td>`;
    tbody.appendChild(tr);
  });

  document.getElementById('invoicesCount').textContent = list.length;

  // wire remind buttons
  document.querySelectorAll('.remindBtn').forEach(b=> b.addEventListener('click', e=>{
    const id = e.target.dataset.id; const member = store.members.find(m=> m.id===id);
    store.messages.push({ id: uid(), type:'Reminder', text: `${member.name} was reminded to deposit today.`, date: new Date().toISOString(), memberId: id, level: 'info' });
    refreshAll();
  }));
}

// wire invoices tabs & create button (init once)
;(function wireInvoiceControls(){
  // tabs
  document.querySelectorAll('.invoices-tab').forEach(btn=> btn.addEventListener('click', (e)=>{
    document.querySelectorAll('.invoices-tab').forEach(x=> x.classList.remove('active', 'bg-slate-100'));
    btn.classList.add('active', 'bg-slate-100');
    renderInvoices();
  }));

  // Create Invoice button (simple modal that records a message)
  const createBtn = document.getElementById('createInvoiceBtn');
  if(createBtn){ createBtn.addEventListener('click', ()=>{
    const membersOptions = store.members.map(m=> `<option value="${m.id}">${m.name}</option>`).join('');
    openModal('Create invoice', `<div class="space-y-2">
      <select id="invMember" class="w-full p-2 border rounded"><option value="">-- Select client --</option>${membersOptions}</select>
      <input id="invAmount" type="number" placeholder="Amount" class="w-full p-2 border rounded" />
      <select id="invStatus" class="w-full p-2 border rounded"><option value="Draft">Draft</option><option value="Unpaid">Unpaid</option><option value="Paid">Paid</option></select>
    </div>
    `, ()=>{
      const memberId = document.getElementById('invMember').value;
      const amount = Number(document.getElementById('invAmount').value) || 0;
      const status = document.getElementById('invStatus').value || 'Draft';
      const member = store.members.find(m=> m.id===memberId);
      store.messages.push({ id: uid(), type:'Invoice', text: `${member ? member.name : 'Unknown'} invoice ${fmtCurrency(amount, store.settings.currency)} (${status})`, date: new Date().toISOString(), memberId: memberId||null, level:'info' });
      refreshAll();
    }, 'Create');
  }); }

  // pagination controls - simple no-op placeholders (keeps UI consistent)
  document.getElementById('invPrev')?.addEventListener('click', ()=> alert('Previous page (not implemented)'));
  document.getElementById('invNext')?.addEventListener('click', ()=> alert('Next page (not implemented)'));
})();

// To-do
function renderTodos(){
  const wrap = document.getElementById('todoList'); wrap.innerHTML = '';
  store.todos.slice().reverse().forEach(t=>{
    const el = document.createElement('div');
    el.className = 'p-3 border rounded flex justify-between items-start';
    el.innerHTML = `<div><div class="font-semibold">${t.title} <span class="text-xs text-slate-500">(${t.type})</span></div><div class="text-xs text-slate-400">${t.body}</div></div>
                    <div class="text-xs"><div class="mb-2 text-slate-400">${t.date ? new Date(t.date).toLocaleString() : ''}</div><button class="delTodo text-xs text-rose-600" data-id="${t.id}">Delete</button></div>`;
    wrap.appendChild(el);
  });

  document.querySelectorAll('.delTodo').forEach(b=> b.addEventListener('click', e=>{
    const id = e.target.dataset.id; if(!confirm('Delete note?')) return;
    store.todos = store.todos.filter(x=> x.id !== id); refreshAll();
  }));
}

// Finances
function renderFinances(){
  const totalSaved = store.transactions.reduce((s,t)=> t.type==='deposit'? s+t.amount : s - t.amount, 0);
  const savedToday = store.transactions.filter(t=> t.type==='deposit' && t.date.slice(0,10)===todayYMD()).reduce((s,t)=> s+t.amount, 0);
  document.getElementById('finTarget').textContent = fmtCurrency(store.settings.target || 0, store.settings.currency);
  document.getElementById('finAchieved').textContent = fmtCurrency(totalSaved, store.settings.currency);
  document.getElementById('finToday').textContent = fmtCurrency(savedToday, store.settings.currency);
}

/* -----------------------
   Actions: Add member / Edit / Deposit / Withdraw
   ----------------------- */

// Add member:
document.getElementById('addMemberBtn').addEventListener('click', ()=>{
  openModal('Add member', `<div class="space-y-2">
    <input id="mName" placeholder="Full name" class="w-full p-2 border rounded" />
    <input id="mPhone" placeholder="Phone (optional)" class="w-full p-2 border rounded" />
  </div>`, ()=>{
    const name = document.getElementById('mName').value.trim();
    const phone = document.getElementById('mPhone').value.trim();
    if(!name) return alert('Name required.');
    const m = { id: uid(), name, phone, joined: new Date().toISOString() };
    store.members.push(m);
    store.messages.push({ id: uid(), type:'Member added', text: `${name} was added.`, date: new Date().toISOString(), memberId: m.id, level: 'info' });
    refreshAll();
  }, 'Add');

// Edit member:
});
function openEditMemberModal(id){
  const m = store.members.find(x=> x.id===id);
  if(!m) return alert('Member not found');
  openModal('Edit member', `<div class="space-y-2">
    <input id="mNameE" value="${m.name}" placeholder="Full name" class="w-full p-2 border rounded" />
    <input id="mPhoneE" value="${m.phone||''}" placeholder="Phone" class="w-full p-2 border rounded" />
  </div>`, ()=>{
    const name = document.getElementById('mNameE').value.trim();
    const phone = document.getElementById('mPhoneE').value.trim();
    if(!name) return alert('Name required.');
    m.name = name; m.phone = phone;
    store.messages.push({ id: uid(), type:'Member edited', text: `${m.name} updated.`, date: new Date().toISOString(), memberId: m.id, level:'info' });
    refreshAll();
  }, 'Save');
}

// Deposit flow:
document.getElementById('depositBtn').addEventListener('click', ()=> {
  const memberId = document.getElementById('memberSelect').value;
  if(!memberId) return alert('Select a member first.');
  // build payment method radio buttons from settings
  const methods = store.settings.methods || [];
  if(!methods.length) return alert('No payment methods enabled in Settings.');
  const methodsHtml = methods.map((m,i)=>{
    const label = m==='bank' ? 'Bank transfer' : m==='cash' ? 'Cash' : m==='card' ? 'Debit/Credit Card' : m==='paypal' ? 'PayPal' : 'E-mpesa';
    const cls = m==='bank'? 'pm-bank' : m==='cash' ? 'pm-cash' : m==='card' ? 'pm-card' : m==='paypal' ? 'pm-paypal' : 'pm-empesa';
    return `<label class="inline-flex items-center gap-2"><input type="radio" name="depMethod" value="${m}" ${i===0?'checked':''} /><span class="px-2 py-1 rounded ${cls} text-xs">${label}</span></label>`;
  }).join(' ');
  openModal('Deposit', `<div class="space-y-2">
    <input id="depAmount" type="number" placeholder="Amount" class="w-full p-2 border rounded" />
    <div class="text-xs text-slate-500">Method</div><div class="flex gap-2">${methodsHtml}</div>
    <textarea id="depNote" placeholder="Note (optional)" class="w-full p-2 border rounded"></textarea>
  </div>`, ()=>{
    const amount = Number(document.getElementById('depAmount').value) || 0;
    if(amount <= 0) return alert('Enter a valid amount.');
    const method = (document.querySelector('input[name="depMethod"]:checked') || {}).value || methods[0];
    const note = document.getElementById('depNote').value.trim();
    const tx = { id: uid(), memberId, type:'deposit', amount, date: new Date().toISOString(), method, note };
    store.transactions.push(tx);
    const member = store.members.find(m=> m.id===memberId);
    // messages and danger for below-daily-min
    const savedToday = store.transactions.filter(t=> t.memberId===memberId && t.type==='deposit' && t.date.slice(0,10)===todayYMD()).reduce((s,t)=> s+t.amount, 0);
    const level = savedToday < store.settings.dailyMin ? 'danger' : 'info';
    store.messages.push({ id: uid(), type:'Deposit', text: `${member.name} deposited ${fmtCurrency(amount, store.settings.currency)} via ${method}${note ? ' — '+note : ''}`, date: new Date().toISOString(), memberId, level });
    if(savedToday < store.settings.dailyMin) {
      store.messages.push({ id: uid(), type:'Below minimum', text: `${member.name} has not reached daily minimum (${fmtCurrency(store.settings.dailyMin, store.settings.currency)})`, date: new Date().toISOString(), memberId, level: 'danger' });
    }
    refreshAll();
  }, 'Confirm');
});

// Withdraw flow:
document.getElementById('withdrawBtn').addEventListener('click', ()=> {
  const memberId = document.getElementById('memberSelect').value;
  if(!memberId) return alert('Select a member first.');
  openModal('Withdraw', `<div class="space-y-2">
    <input id="withAmount" type="number" placeholder="Amount" class="w-full p-2 border rounded" />
    <textarea id="withNote" placeholder="Note (optional)" class="w-full p-2 border rounded"></textarea>
  </div>`, ()=>{
    const amount = Number(document.getElementById('withAmount').value) || 0;
    if(amount <= 0) return alert('Enter a valid amount.');
    const balance = store.transactions.filter(t=> t.memberId===memberId).reduce((s,t)=> t.type==='deposit'? s+t.amount : s - t.amount, 0);
    if(amount > balance) return alert('Insufficient funds.');
    const note = document.getElementById('withNote').value.trim();
    store.transactions.push({ id: uid(), memberId, type:'withdraw', amount, date: new Date().toISOString(), method: 'withdraw', note });
    const member = store.members.find(m=> m.id===memberId);
    store.messages.push({ id: uid(), type:'Withdraw', text: `${member.name} withdrew ${fmtCurrency(amount, store.settings.currency)}${note? ' — ' + note : ''}`, date: new Date().toISOString(), memberId, level:'info' });
    refreshAll();
  }, 'Confirm');
});

/* -----------------------
   Settings: save actions
   ----------------------- */
function loadSettingsUI(){
  document.getElementById('settingAdminName').value = store.admin.name || '';
  document.getElementById('settingAdminEmail').value = store.admin.email || '';
  document.getElementById('settingTarget').value = store.settings.target || 0;
  document.getElementById('settingEst').value = store.settings.estTime || 0;
  document.getElementById('settingDailyMin').value = store.settings.dailyMin || 0;
  document.getElementById('settingCurrency').value = store.settings.currency || 'KES';
  document.querySelectorAll('.pm-check').forEach(cb => cb.checked = (store.settings.methods || []).includes(cb.value));

  // profile picture
  const preview = document.getElementById('profilePreview');
  if(store.admin && store.admin.avatar){
    preview.innerHTML = `<img src="${store.admin.avatar}" alt="avatar" />`;
  } else {
    preview.innerHTML = `<img src="jlc.jpg" alt="avatar" />`;
  }

  // name/email preview in settings left column
  const namePreview = document.getElementById('profileNamePreview');
  const emailPreview = document.getElementById('profileEmailPreview');
  if(namePreview) namePreview.textContent = store.admin.name || 'Admin';
  if(emailPreview) emailPreview.textContent = store.admin.email || (store.admin.email === '' ? 'admin@example.com' : store.admin.email);

  // appearance
  const ap = store.settings.appearance || 'light';
  if(ap === 'dark') document.getElementById('appDark').checked = true; else document.getElementById('appLight').checked = true;
}

document.getElementById('saveAdminBtn').addEventListener('click', ()=>{
  const n = document.getElementById('settingAdminName').value.trim();
  const e = document.getElementById('settingAdminEmail').value.trim();
  if(!n) return alert('Admin name required');
  store.admin.name = n; store.admin.email = e;

  // if an avatar file was selected, read and store it
  const fileInput = document.getElementById('settingAvatarFile');
  if(fileInput && fileInput.files && fileInput.files[0]){
    const f = fileInput.files[0];
    const reader = new FileReader();
    reader.onload = function(ev){
      store.admin.avatar = ev.target.result;
      saveStore(store);
      store.messages.push({ id: uid(), type:'Settings', text: 'Admin profile updated.', date: new Date().toISOString(), level: 'info' });
      refreshAll();
      // update left-column preview texts
      const namePreview = document.getElementById('profileNamePreview');
      const emailPreview = document.getElementById('profileEmailPreview');
      if(namePreview) namePreview.textContent = store.admin.name || 'Admin';
      if(emailPreview) emailPreview.textContent = store.admin.email || (store.admin.email === '' ? 'admin@example.com' : store.admin.email);
    };
    reader.readAsDataURL(f);
    return; // wait for reader to finish
  }
  // update left-column preview texts
  const namePreview = document.getElementById('profileNamePreview');
  const emailPreview = document.getElementById('profileEmailPreview');
  if(namePreview) namePreview.textContent = store.admin.name || 'Admin';
  if(emailPreview) emailPreview.textContent = store.admin.email || (store.admin.email === '' ? 'admin@example.com' : store.admin.email);
  
  store.messages.push({ id: uid(), type:'Settings', text: 'Admin profile updated.', date: new Date().toISOString(), level: 'info' });
  refreshAll();
});
document.getElementById('saveTargetBtn').addEventListener('click', ()=>{
  store.settings.target = Number(document.getElementById('settingTarget').value) || 0;
  store.settings.estTime = Number(document.getElementById('settingEst').value) || 0;
  store.messages.push({ id: uid(), type:'Settings', text: 'Target updated.', date: new Date().toISOString(), level: 'info' });
  refreshAll();
});
document.getElementById('saveRulesBtn').addEventListener('click', ()=>{
  store.settings.dailyMin = Number(document.getElementById('settingDailyMin').value) || 0;
  store.settings.currency = document.getElementById('settingCurrency').value;
  store.messages.push({ id: uid(), type:'Settings', text: 'Daily rules updated.', date: new Date().toISOString(), level: 'info' });
  refreshAll();
});
document.getElementById('savePaymentsBtn').addEventListener('click', ()=>{
  const checked = Array.from(document.querySelectorAll('.pm-check')).filter(cb=> cb.checked).map(cb=> cb.value);
  store.settings.methods = checked;
  store.messages.push({ id: uid(), type:'Settings', text: 'Payment methods updated.', date: new Date().toISOString(), level: 'info' });
  refreshAll();
});
// apply appearance
document.getElementById('applyAppearanceBtn')?.addEventListener('click', ()=>{
  const val = document.querySelector('input[name="appearance"]:checked')?.value || 'light';
  store.settings.appearance = val;
  // apply immediately
  if(val === 'dark') document.body.classList.add('dark-mode'); else document.body.classList.remove('dark-mode');
  store.messages.push({ id: uid(), type:'Settings', text: 'Appearance updated.', date: new Date().toISOString(), level: 'info' });
  saveStore(store); refreshAll();
});

// logout from settings
document.getElementById('logoutBtnSettings')?.addEventListener('click', ()=>{
  if(typeof showAuthUI === 'function') showAuthUI(); else location.reload();
});
document.getElementById('savePwdBtn').addEventListener('click', ()=>{
  // Password management removed in this build — clear inputs and show a message.
  document.getElementById('settingPwd1').value = ''; document.getElementById('settingPwd2').value = '';
  alert('Password feature is disabled in this build.');
});

// wire avatar file preview (show selected image before save)
const avatarFileInput = document.getElementById('settingAvatarFile');
if(avatarFileInput){
  avatarFileInput.addEventListener('change', (e)=>{
    const f = e.target.files && e.target.files[0];
    if(!f) return;
    const reader = new FileReader();
    reader.onload = function(ev){
      const preview = document.getElementById('profilePreview');
      if(preview) preview.innerHTML = `<img src="${ev.target.result}" alt="avatar" />`;
    };
    reader.readAsDataURL(f);
  });
}

// Payment methods dropdown behaviour
const pmToggleBtn = document.getElementById('pmToggleBtn');
const pmDropdown = document.getElementById('pmDropdown');
function updatePmLabel(){
  if(!pmToggleBtn) return;
  const span = pmToggleBtn.querySelector('span');
  const checked = Array.from(document.querySelectorAll('.pm-check')).filter(cb=> cb.checked).map(cb=> cb.value);
  if(checked.length === 0) span.textContent = 'Select payment methods';
  else if(checked.length <= 3) span.textContent = checked.map(s=> s.charAt(0).toUpperCase()+s.slice(1)).join(', ');
  else span.textContent = `${checked.length} selected`;
}

if(pmToggleBtn && pmDropdown){
  pmToggleBtn.addEventListener('click', (e)=>{
    e.stopPropagation();
    pmDropdown.classList.toggle('hidden');
    updatePmLabel();
  });

  // close when clicking outside
  document.addEventListener('click', (e)=>{
    if(!pmDropdown.classList.contains('hidden')){
      if(!pmDropdown.contains(e.target) && !pmToggleBtn.contains(e.target)) pmDropdown.classList.add('hidden');
    }
  });

  // close on Escape
  document.addEventListener('keydown', (e)=>{ if(e.key === 'Escape'){ if(!pmDropdown.classList.contains('hidden')) pmDropdown.classList.add('hidden'); } });

  // update label on checkbox change
  document.querySelectorAll('.pm-check').forEach(cb=> cb.addEventListener('change', updatePmLabel));
  // initial label
  updatePmLabel();
}

/* -----------------------
   To Do add
   ----------------------- */
document.getElementById('addTodoBtn').addEventListener('click', ()=> {
  openModal('Add note / event / minutes', `<div class="space-y-2">
    <input id="todoTitle" placeholder="Title" class="w-full p-2 border rounded" />
    <select id="todoType" class="w-full p-2 border rounded"><option value="note">Note</option><option value="event">Event</option><option value="minutes">Minutes</option></select>
    <input id="todoDate" type="datetime-local" class="w-full p-2 border rounded" />
    <textarea id="todoBody" placeholder="Details" class="w-full p-2 border rounded"></textarea>
  </div>`, ()=>{
    const title = document.getElementById('todoTitle').value.trim();
    if(!title) return alert('Title required.');
    const type = document.getElementById('todoType').value;
    const date = document.getElementById('todoDate').value || new Date().toISOString();
    const body = document.getElementById('todoBody').value.trim();
    store.todos.push({ id: uid(), title, type, date, body });
    store.messages.push({ id: uid(), type:'Note', text: `New ${type}: ${title}`, date: new Date().toISOString(), level:'info' });
    refreshAll();
  }, 'Add');
});

/* -----------------------
   Modal helper
   ----------------------- */
function openModal(title, htmlContent, onOk, okText='OK'){
  const root = document.getElementById('modalRoot');
  root.innerHTML = `<div class="fixed inset-0 flex items-center justify-center modal-backdrop" style="z-index:70">
    <div class="bg-white rounded p-6 w-96 shadow">
      <h3 class="text-lg font-semibold mb-3">${title}</h3>
      <div id="modalBody">${htmlContent}</div>
      <div class="flex justify-end gap-2 mt-4">
        <button id="modalCancel" class="px-3 py-1 rounded border">Cancel</button>
        <button id="modalOk" class="px-3 py-1 rounded bg-sky-600 text-white">${okText}</button>
      </div>
    </div>
  </div>`;
  document.getElementById('modalCancel').addEventListener('click', ()=> root.innerHTML = '');
  document.getElementById('modalOk').addEventListener('click', ()=>{
    try { onOk(); } catch(e){ console.error(e); alert('Error: '+e.message); }
    root.innerHTML = '';
  });
}

/* -----------------------
   Other small actions
   ----------------------- */
document.getElementById('clearMessages').addEventListener('click', ()=> {
  if(!confirm('Clear all messages?')) return;
  store.messages = []; refreshAll();
});
document.getElementById('filterMsgs').addEventListener('click', ()=> alert('Filter placeholder: future filter UI can be added.'));

/* -----------------------
   Initialisation is gated by authentication
   Show password overlay (or initialize immediately if no overlay present)
   ----------------------- */
initApp();

/* -----------------------
   Expose some helpers for debugging in console
   ----------------------- */
window._trustvault = {
  store, save: ()=> { saveStore(store); refreshAll(); }, reset: ()=> { if(confirm('Reset all data?')) { localStorage.removeItem(STORE_KEY); localStorage.removeItem(PWD_KEY); location.reload(); } }
};
