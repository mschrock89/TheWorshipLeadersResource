// Service Worker for Push Notifications

self.addEventListener('push', function(event) {
  console.log('[SW] Push event received:', event);
  
  if (!event.data) {
    console.log('[SW] No data in push event');
    return;
  }

  let data;
  try {
    data = event.data.json();
    console.log('[SW] Push data:', data);
  } catch (e) {
    console.error('[SW] Error parsing push data:', e);
    data = { title: 'New Notification', body: event.data.text() };
  }
  
  // Handle both 'body' and 'message' fields for compatibility
  const notificationBody = data.body || data.message || 'You have a new notification';
  const notificationTitle = data.title || 'Experience Worship';
  
  const options = {
    body: notificationBody,
    icon: data.icon || '/app-icon-512.png',
    badge: data.badge || '/app-icon-512.png',
    vibrate: [100, 50, 100],
    data: {
      url: data.data?.url || data.url || '/',
      notificationId: data.id
    },
    actions: data.actions || [],
    tag: data.tag || 'default',
    renotify: true
  };

  console.log('[SW] Showing notification:', notificationTitle, options);

  event.waitUntil(
    self.registration.showNotification(notificationTitle, options)
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  const url = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      // Check if there's already a window open
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          client.navigate(url);
          return;
        }
      }
      // Open new window if none exists
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});

self.addEventListener('install', function(event) {
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(clients.claim());
});
