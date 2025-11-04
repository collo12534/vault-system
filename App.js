// Simple local prototype: storage helpers, UI, notifications & flows
const STORAGE_KEYS = {
  USERS: 'isp_users_v1',
  VOUCHERS: 'isp_vouchers_v1',
  LEDGER: 'isp_ledger_v1',
  NOTIFS: 'isp_notifs_v1'
};

function read(key){ try { return JSON.parse(localStorage.getItem(key)||'[]'); } catch(e){ return []; } }
function write(key, data){ localStorage.setItem(key, JSON.stringify(data)); }

// Utility
function uid(prefix='id'){ return prefix + '_' + Math.random().toString(36).slice(2,9); }
function now(){ return new Date().toISOString(); }

// Toast
const toastEl = document.getElementById('toast');
function showToast(msg, timeout=3000){
  toastEl.textContent = msg;
  toastEl.classList.remove('hidden');
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(()=> toastEl.classList.add('hidden'), timeout);
}

// In-app notifications list
function pushNotif(text, type='info'){
  const list = read(STORAGE_KEYS.NOTIFS);
  list.unshift({id: uid('n'), text, type, ts: now()});
  write(STORAGE_KEYS.NOTIFS, list);
  renderNotifications();
}

// Initialize data if empty
if(!localStorage.getItem(STORAGE_KEYS.USERS)) write(STORAGE_KEYS.USERS, [
  {id: uid('u'), identity: 'testuser@example.com', credits: 0, connected: false, created: now()}
]);
if(!localStorage.getItem(STORAGE_KEYS.VOUCHERS)) write(STORAGE_KEYS.VOUCHERS, []);
if(!localStorage.getItem(STORAGE_KEYS.LEDGER)) write(STORAGE_KEYS.LEDGER, []);
if(!localStorage.getItem(STORAGE_KEYS.NOTIFS)) write(STORAGE_KEYS.NOTIFS, []);

// UI references
const modal = document.getElementById('admin-modal');
const openAdminBtn = document.getElementById('open-admin');
const closeAdminBtn = document.getElementById('close-admin');
const portalMessage = document.getElementById('portal-message');

openAdminBtn.addEventListener('click', ()=> modal.classList.remove('hidden'));
closeAdminBtn.addEventListener('click', ()=> modal.classList.add('hidden'));

// Portal interactions
document.getElementById('btn-login').addEventListener('click', handleLogin);
document.getElementById('btn-redeem').addEventListener('click', handleRedeem);

function handleLogin(){
  const identity = document.getElementById('login-identity').value.trim();
  if(!identity){ portalMessage.textContent = 'Enter phone or email.'; return; }
  let users = read(STORAGE_KEYS.USERS);
  let user = users.find(u => u.identity === identity);
  if(!user){
    user = { id: uid('u'), identity, credits: 0, connected: true, created: now() };
    users.push(user);
    write(STORAGE_KEYS.USERS, users);
    pushNotif(`New subscriber created: ${identity}`);
  } else {
    user.connected = true;
    write(STORAGE_KEYS.USERS, users);
  }
  portalMessage.textContent = `Welcome, ${identity}. Credits: ${user.credits}`;
  showToast('Logged in (simulated captive portal).');
  renderAll();
}

function handleRedeem(){
  const code = document.getElementById('voucher-code').value.trim();
  if(!code){ portalMessage.textContent = 'Enter voucher code.'; return; }
  const vouchers = read(STORAGE_KEYS.VOUCHERS);
  const v = vouchers.find(x => x.code === code && !x.redeemed);
  if(!v){ portalMessage.textContent = 'Invalid or used voucher.'; pushNotif(`Failed voucher attempt: ${code}`, 'fail'); return; }

  // apply voucher to most recent user that is connected
  let users = read(STORAGE_KEYS.USERS);
  const user = users.slice().reverse().find(u=>u.connected) || users[0];
  if(!user){ portalMessage.textContent = 'No connected user found.'; return; }

  v.redeemed = true; v.redeemedBy = user.id; v.redeemedAt = now();
  user.credits = (user.credits || 0) + (v.value || 0);
  write(STORAGE_KEYS.VOUCHERS, vouchers);
  write(STORAGE_KEYS.USERS, users);
  portalMessage.textContent = `Voucher redeemed. ${v.value} credits applied to ${user.identity}.`;
  pushNotif(`${v.value} applied to ${user.identity}`, 'ok');
  renderAll();
}

// Admin: Create voucher
document.getElementById('create-voucher').addEventListener('click', ()=>{
  const raw = document.getElementById('voucher-value').value.trim();
  if(!raw){ showToast('Enter voucher value'); return; }
  // Parse value: accept "60m" or "50" (treat numeric as credits)
  let value = parseInt(raw, 10);
  let valueLabel = isNaN(value) ? raw : value;
  const vouchers = read(STORAGE_KEYS.VOUCHERS);
  const code = (Math.random().toString(36).slice(2,8)).toUpperCase();
  const v = { id: uid('v'), code, value: isNaN(value)?1:value, label: valueLabel, created: now(), redeemed:false };
  vouchers.unshift(v); write(STORAGE_KEYS.VOUCHERS, vouchers);
  document.getElementById('last-voucher').textContent = `Created ${code} (${valueLabel})`;
  pushNotif(`Voucher ${code} created`);
  renderAll();
});

// Deposit (billing) + EmailJS integration
document.getElementById('make-deposit').addEventListener('click', ()=>{
  const userId = document.getElementById('deposit-user').value;
  const amt = parseFloat(document.getElementById('deposit-amount').value);
  if(!userId || isNaN(amt) || amt <= 0){ showToast('Select user and enter valid amount'); return; }

  // Simulate payment: 80% succeed, 20% fail
  const succeed = Math.random() > 0.2;
  const ledger = read(STORAGE_KEYS.LEDGER);
  const entry = { id: uid('l'), userId, amount: amt, ts: now(), status: succeed ? 'success' : 'failed' };
  ledger.unshift(entry); write(STORAGE_KEYS.LEDGER, ledger);

  // Update user credits on success
  const users = read(STORAGE_KEYS.USERS);
  const user = users.find(u => u.id === userId);

  if(succeed){
    user.credits = (user.credits || 0) + amt;
    pushNotif(`Deposit successful for ${user.identity}: KES ${amt}`, 'ok');
    showToast('Deposit successful — congratulations!');

    // >>> EMAILJS ALERT (Success)
    emailjs.send("YOUR_SERVICE_ID", "YOUR_TEMPLATE_ID", {
      name: user.identity,
      amount: amt + " KES",
      date: new Date().toLocaleString(),
      type: "Deposit (Success)"
    })
    .then(res => console.log("Email sent:", res))
    .catch(err => console.error("Email error:", err));

  } else {
    pushNotif(`Deposit failed for ${user.identity}: KES ${amt}`, 'fail');
    showToast('Deposit failed.');

    // >>> EMAILJS ALERT (Failure)
    emailjs.send("YOUR_SERVICE_ID", "YOUR_TEMPLATE_ID", {
      name: user.identity,
      amount: amt + " KES",
      date: new Date().toLocaleString(),
      type: "Deposit (Failed)"
    })
    .then(res => console.log("Email sent:", res))
    .catch(err => console.error("Email error:", err));
  }

  write(STORAGE_KEYS.USERS, users);
  renderAll();
});

// Renderers
function renderAll(){ renderUsers(); renderVouchers(); renderLedger(); renderNotifications(); populateDepositSelect(); }

function renderUsers(){
  const list = document.getElementById('user-list');
  list.innerHTML = '';
  const users = read(STORAGE_KEYS.USERS);
  users.forEach(u=>{
    const el = document.createElement('div');
    el.className = 'list-item';
    el.innerHTML = `<div><strong>${u.identity}</strong><div class="muted">Credits: ${u.credits || 0} • Connected: ${u.connected ? 'yes' : 'no'}</div></div>
    <div><button data-id="${u.id}" class="disconnect">Disconnect</button></div>`;
    list.appendChild(el);
  });
  list.querySelectorAll('.disconnect').forEach(btn=>{
    btn.addEventListener('click', e=>{
      const id = btn.dataset.id;
      const users = read(STORAGE_KEYS.USERS);
      const user = users.find(x=>x.id===id);
      if(user){ user.connected=false; write(STORAGE_KEYS.USERS, users); pushNotif(`User disconnected: ${user.identity}`); renderAll(); }
    });
  });
}

function renderVouchers(){
  const el = document.getElementById('last-voucher');
  const vouchers = read(STORAGE_KEYS.VOUCHERS);
  el.textContent = vouchers.length ? `Latest: ${vouchers[0].code} (${vouchers[0].label})` : 'No vouchers yet';
}

function renderLedger(){
  const el = document.getElementById('ledger');
  el.innerHTML = '';
  const ledger = read(STORAGE_KEYS.LEDGER);
  ledger.forEach(l=>{
    const users = read(STORAGE_KEYS.USERS);
    const user = users.find(u=>u.id===l.userId);
    const item = document.createElement('div');
    item.className = 'list-item';
    const badge = l.status === 'success'? `<span class="badge ok">OK</span>` : `<span class="badge fail">FAIL</span>`;
    item.innerHTML = `<div>${user ? user.identity : 'unknown'} <div class="muted">${new Date(l.ts).toLocaleString()}</div></div><div>${l.amount} KES ${badge}</div>`;
    el.appendChild(item);
  });
}

function renderNotifications(){
  const el = document.getElementById('notifications');
  el.innerHTML = '';
  const notifs = read(STORAGE_KEYS.NOTIFS);
  notifs.slice(0,30).forEach(n=>{
    const e = document.createElement('div'); e.className = 'list-item small';
    e.innerHTML = `<div>${n.text}<div class="muted">${new Date(n.ts).toLocaleString()}</div></div><div>${n.type === 'fail' ? '<span class="badge fail">ERR</span>' : '<span class="badge ok">OK</span>'}</div>`;
    el.appendChild(e);
  });
}

function populateDepositSelect(){
  const sel = document.getElementById('deposit-user');
  sel.innerHTML = '';
  const users = read(STORAGE_KEYS.USERS);
  users.forEach(u=>{
    const opt = document.createElement('option'); opt.value = u.id; opt.textContent = u.identity;
    sel.appendChild(opt);
  });
}

// Reminder scheduler (simple)
function scheduleReminders(){
  const users = read(STORAGE_KEYS.USERS);
  users.forEach(u=>{
    if((u.credits||0) <= 0){
      const remKey = `rem_sent_${u.id}`;
      if(!localStorage.getItem(remKey)){
        pushNotif(`Reminder: ${u.identity} has low credits.`, 'fail');
        localStorage.setItem(remKey, '1');
      }
    }
  });
}

// periodic tasks (simulated)
setInterval(scheduleReminders, 1000 * 30); // every 30s

// initial render
renderAll();
