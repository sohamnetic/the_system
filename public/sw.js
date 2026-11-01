/* Makes the app open offline and shows reminders. Pages come from the network first, so updates arrive right away. */
const CACHE = 'the-system-v1';
const SHELL = ['/', '/index.html', '/styles.css', '/config.js', '/store.js', '/app.js', '/account.js', '/vendor/supabase.js', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request).then(hit => hit || (e.request.mode === 'navigate' ? caches.match('/') : Response.error())))
  );
});
self.addEventListener('push', e => {
  let msg = {};
  try { msg = e.data.json(); } catch { msg = { title: 'The System', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(msg.title || 'The System', {
    body: msg.body || '', icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', tag: msg.tag || 'system', data: { url: msg.url || '/' }
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = e.notification.data?.url || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const open = list.find(c => c.url.startsWith(self.location.origin));
    return open ? open.focus() : self.clients.openWindow(target);
  }));
});
