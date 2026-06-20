// v6 — force-reload on new deploy
const CACHE_VERSION = 'vm-v6';

self.addEventListener('install', e => {
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(key => {
        if (key !== CACHE_VERSION) return caches.delete(key);
      }))
    ).then(() => self.clients.claim())
     .then(() => {
       // Tell all open tabs to reload after SW takes over
       return self.clients.matchAll({ type: 'window' }).then(list => {
         for (const c of list) c.navigate(c.url);
       });
     })
  );
});

self.addEventListener('push', e => {
  const data = e.data?.json() ?? {};
  e.waitUntil(
    self.registration.showNotification(data.title || 'Void Mafia', {
      body: data.body || '',
      icon: data.icon || '/icon-192.png',
      badge: '/icon-192.png',
      vibrate: [150, 80, 150],
      data: { url: '/' },
    })
  );
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.includes(self.location.origin) && 'focus' in c) return c.focus();
      }
      return clients.openWindow(e.notification.data?.url || '/');
    })
  );
});
