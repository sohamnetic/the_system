/* Login, notifications, installing, importing and startup. */
let installEvent = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvent = e; if (S && tab === 'quests') render(); offerInstall(); });
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
/* Asks once per device on the first visit. The Quests tab keeps the option after that. */
const INSTALL_ASKED = 'system.installAsked';
function installAsked() { try { return !!localStorage.getItem(INSTALL_ASKED); } catch { return false; } }
function offerInstall() {
  if (isStandalone() || installAsked() || (!installEvent && !isIOS())) return;
  if (!$('#modal').hidden) { setTimeout(offerInstall, 2000); return; }
  try { localStorage.setItem(INSTALL_ASKED, '1'); } catch {}
  const head = `<h2 class="win-title"><i>!</i>Notification</h2><p class="sys-line">[Would you like to add The System as an app on your home screen?]</p>`;
  if (installEvent) openModal(`${head}<div class="two"><button class="btn primary" data-act="install-yes">Add to home screen</button><button class="btn quiet" data-act="install-no">Not now</button></div>`);
  else openModal(`${head}<p class="sys-line">In Safari, tap Share, then Add to Home Screen.</p><button class="btn primary wide" data-act="install-no">Got it</button>`);
}
const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/* ---------- Login ---------- */
let authMode = 'in';
function renderLogin(message = '') {
  $('#nav').hidden = true;
  const up = authMode === 'up';
  $('#app').innerHTML = `<section class="win"><h1 class="win-title"><i>!</i>The System</h1>
    <p class="lead">[${up ? 'You have acquired the qualifications to be a Player.' : 'Welcome back, Player.'}]</p>
    ${Store.cfg.googleEnabled ? `<button class="btn primary wide" data-act="auth-google">Continue with Google</button><hr class="rule">` : ''}
    <form id="auth-form" class="stack" novalidate>
      <label class="field">Email<input type="text" id="auth-email" inputmode="email" autocomplete="email" autocapitalize="none"></label>
      <label class="field">Password${up ? ' (at least 8 characters)' : ''}<input type="password" id="auth-pass" autocomplete="${up ? 'new-password' : 'current-password'}"></label>
      <p class="err" id="pf-err" role="alert" ${message ? '' : 'hidden'}>${esc(message)}</p>
      <button class="btn primary wide" id="auth-go" type="submit">${up ? 'Create account' : 'Sign in'}</button>
    </form>
    <div class="row between">
      <button class="btn quiet tiny" data-act="auth-switch">${up ? 'I already have an account' : 'Create an account'}</button>
      ${Store.cfg.emailEnabled ? '<button class="btn quiet tiny" data-act="auth-magic">Email me a sign-in link</button>' : ''}
    </div>
  </section>`;
}
function authNote(text) { const e = $('#pf-err'); e.textContent = text; e.hidden = false; e.style.color = 'var(--good)'; }
function authError(text) { const e = $('#pf-err'); e.textContent = text; e.hidden = false; e.style.color = ''; }
const emailOk = v => /^\S+@\S+\.\S+$/.test(v);
document.addEventListener('submit', async e => {
  if (e.target.id !== 'auth-form') return;
  e.preventDefault();
  const email = $('#auth-email').value.trim(), password = $('#auth-pass').value;
  if (!emailOk(email)) return authError('Enter a valid email address.');
  if (authMode === 'up' && password.length < 8) return authError('Use at least 8 characters for your password.');
  if (!password) return authError('Enter your password.');
  const btn = $('#auth-go'); btn.disabled = true;
  const res = authMode === 'up'
    ? await Store.sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin } })
    : await Store.sb.auth.signInWithPassword({ email, password });
  btn.disabled = false;
  if (res.error) return authError(authMode === 'up' ? res.error.message : 'That email and password do not match. Try again.');
  if (!res.data.session) return authNote('Check your email and tap the link to confirm your account.');
  location.reload();
});
Object.assign(actions, {
  'auth-switch': () => { authMode = authMode === 'up' ? 'in' : 'up'; renderLogin(); },
  'auth-google': async () => {
    const { error } = await Store.sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin } });
    if (error) authError('Google sign-in did not start. Try again, or use your email.');
  },
  'auth-magic': async () => {
    const email = $('#auth-email').value.trim();
    if (!emailOk(email)) return authError('Enter your email first, then tap this again.');
    const { error } = await Store.sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin } });
    if (error) authError('The email could not be sent. Wait a minute and try again.');
    else authNote('Check your email and tap the link to sign in.');
  },
  'sign-out': async () => {
    await Store.flush();
    await Store.sb.auth.signOut();
    location.reload();
  },

  /* ---------- Installing and importing ---------- */
  install: async () => {
    if (!installEvent) return;
    installEvent.prompt();
    await installEvent.userChoice;
    installEvent = null; if (S) render();
  },
  'install-yes': async () => { closeModal(); await actions.install(); drainNotes(); },
  'install-no': () => { closeModal(); drainNotes(); },
  'import-yes': async () => {
    const data = PF?.imported; if (!data) return;
    S = normalizeState(data.state);
    Store.write('state', S);
    for (const [k, v] of Object.entries(data.log || {})) if (/^log-\d{4}-\d{2}$/.test(k) && v?.days) { LOG[k] = v; Store.write(k, v); }
    await Store.flush();
    location.reload();
  },

  /* ---------- Notifications ---------- */
  'notify-on': async () => {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { toast('[Notifications are blocked. Allow them in your browser settings to turn them on.]', 5000); return; }
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(Store.cfg.vapidPublicKey) });
      const j = sub.toJSON();
      const { error } = await Store.sb.from('push_subscriptions').upsert({ user_id: Store.id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth }, { onConflict: 'endpoint' });
      if (error) throw error;
      S.notify.on = true; saveState(); await savePrefs(); render();
      toast('[Notifications are on.]');
    } catch { toast('[Notifications could not be turned on. Check your connection and try again.]', 5000); }
  },
  'notify-off': async () => {
    S.notify.on = false; saveState();
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) { await Store.sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint); await sub.unsubscribe(); }
    } catch { /* The server drops dead subscriptions on its next send. */ }
    await savePrefs(); render();
  },
  'notify-save': async () => {
    S.notify.morning = $('#n-morning').value || '08:00';
    S.notify.evening = $('#n-evening').value || '21:00';
    saveState(); await savePrefs(); toast('[Reminder times saved.]');
  }
});
function b64ToBytes(b64) {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(b64.length / 4) * 4, '='));
  return Uint8Array.from(s, c => c.charCodeAt(0));
}
function daySummary() {
  const today = ymd();
  const e = peek(today);
  return { day: today, left: requiredOn(today).filter(q => !e?.c?.[q.id]).length, rest: !!e?.rest, seed: S.createdOn, lastOfferOn: S.lastOfferOn };
}
async function savePrefs() {
  if (Store.mode !== 'cloud') return;
  await Store.sb.from('notification_prefs').upsert({
    user_id: Store.id, enabled: !!S.notify.on, morning: S.notify.morning, evening: S.notify.evening,
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone, summary: daySummary()
  });
}
/* Keeps the server's copy of "quests left today" fresh, so the evening warning stays quiet once you are done. */
let lastSummary = '';
function syncSummary() {
  if (Store.mode !== 'cloud' || !S?.notify?.on) return;
  const text = JSON.stringify(daySummary());
  if (text === lastSummary) return;
  lastSummary = text;
  savePrefs().catch(() => { lastSummary = ''; });
}
function accountWindows() {
  const n = S.notify;
  const account = Store.mode === 'cloud'
    ? `<p class="sys-line">${esc(Store.user.email || 'Signed in')}</p><button class="btn quiet" data-act="sign-out">Sign out</button>`
    : `<p class="small dim" style="text-align:center">Guest mode: progress is saved in this browser only, and login is not set up yet.</p>`;
  let push;
  if (Store.mode !== 'cloud' || !Store.cfg.vapidPublicKey) push = `<p class="small dim" style="text-align:center">Notifications turn on after login and reminders are set up.</p>`;
  else if (!pushSupported()) push = `<p class="small dim" style="text-align:center">${isIOS() ? 'On iPhone, add this app to your Home Screen first, then open it from there to turn on notifications.' : 'This browser does not support notifications.'}</p>`;
  else if (n.on) push = `<div class="two"><label class="field">Morning quest reminder<input type="time" id="n-morning" value="${esc(n.morning)}"></label><label class="field">Evening warning<input type="time" id="n-evening" value="${esc(n.evening)}"></label></div>
      <p class="small dim">The evening warning only arrives if required quests are still unfinished.</p>
      <div class="two"><button class="btn primary" data-act="notify-save">Save times</button><button class="btn quiet" data-act="notify-off">Turn off</button></div>`;
  else push = `<p class="small dim" style="text-align:center">Get your Daily Quest each morning, a warning before midnight, and word of new Special Quests.</p><button class="btn primary" data-act="notify-on">Turn on notifications</button>`;
  const install = isStandalone() ? '' : installEvent
    ? `<button class="btn" data-act="install">Install the app</button>`
    : isIOS() ? `<p class="small dim" style="text-align:center">To install on iPhone: tap Share in Safari, then Add to Home Screen.</p>` : '';
  return `<section class="win"><h2 class="win-title">Account</h2>${account}${install}</section>
    <section class="win"><h2 class="win-title"><i>!</i>Notifications</h2>${push}</section>`;
}
document.addEventListener('change', async e => {
  if (e.target.id !== 'import-file' || !e.target.files[0]) return;
  try {
    const data = JSON.parse(await e.target.files[0].text());
    if (!data?.state?.v || !Array.isArray(data.state.quests)) throw new Error('bad file');
    PF = { imported: data };
    openModal(`<h2 class="win-title"><i>!</i>Import progress</h2><p class="sys-line">Level ${esc(data.state.level)}, ${esc(data.state.quests.length)} quests, from "${esc(data.state.name)}".</p><p class="small dim">This replaces your progress on this account. Proof photos from the earlier version do not carry over.</p><div class="two"><button class="btn bad" data-act="import-yes">Replace my progress</button><button class="btn quiet" data-act="close">Cancel</button></div>`, 'danger');
  } catch { toast('[That file is not a System export. Export your data from the earlier version and try again.]', 5000); }
});

/* Private proof photos load through short-lived signed links. */
const signedUrls = new Map();
async function hydrateProofs() {
  const imgs = [...document.querySelectorAll('img[data-asset]')];
  if (!imgs.length || Store.mode !== 'cloud') { imgs.forEach(i => { i.hidden = true; }); return; }
  const need = [...new Set(imgs.map(i => i.dataset.asset))].filter(p => !signedUrls.has(p));
  if (need.length) {
    const { data } = await Store.sb.storage.from('proofs').createSignedUrls(need, 3600);
    (data || []).forEach(d => { if (d.signedUrl) signedUrls.set(d.path, d.signedUrl); });
  }
  imgs.forEach(i => { const u = signedUrls.get(i.dataset.asset); if (u) i.src = u; else i.hidden = true; });
}

/* ---------- Startup ---------- */
async function boot() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  offerInstall();
  try {
    await Store.init();
    if (Store.needsLogin) { renderLogin(); return; }
    await loadAll();
  } catch {
    $('#app').innerHTML = `<section class="win danger"><h1 class="win-title"><i>!</i>Connection lost</h1><p class="sys-line">The System could not reach your saved progress. Nothing was changed.</p><button class="btn bad" data-act="retry">Try again</button></section>`;
    return;
  }
  if (!S) { renderOnboard(); return; }
  evaluate(); render(); drainNotes();
}
actions.retry = () => location.reload();
boot();
