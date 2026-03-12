const CACHE = 'agent-fit-v1';
const SHELL = ['/', '/index.html'];

// Cache app shell on install
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Serve from cache, fallback to network
self.addEventListener('fetch', e => {
  // Never intercept API calls
  if (e.request.url.includes('/api/')) return;
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});

// ── Notifications from the main thread ──────────────────────────────────────
self.addEventListener('message', e => {
  if (e.data?.type === 'MISSION_COMPLETE') {
    self.registration.showNotification('Mission Complete ✅', {
      body: e.data.title || 'Your agent finished the mission.',
      icon: '/icon.svg',
      badge: '/icon.svg',
      vibrate: [200, 100, 200, 100, 200],
      tag: `mission-${e.data.missionId}`,
      renotify: true,
      data: { url: `/mission/${e.data.missionId}` }
    });
  }

  if (e.data?.type === 'MISSION_PROGRESS') {
    self.registration.showNotification('Agent Update 🤖', {
      body: e.data.message,
      icon: '/icon.svg',
      badge: '/icon.svg',
      vibrate: [100],
      tag: `progress-${e.data.missionId}`,
      renotify: true,
      silent: true,
      data: { url: `/mission/${e.data.missionId}` }
    });
  }
});

// Tap notification → open app at mission page
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const target = e.notification.data?.url || '/';
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clients => {
      const existing = clients.find(c => c.url.includes(self.location.origin));
      if (existing) return existing.focus().then(c => c.navigate(target));
      return self.clients.openWindow(target);
    })
  );
});
