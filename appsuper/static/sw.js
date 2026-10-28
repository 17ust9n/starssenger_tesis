/* Service Worker para Notificaciones Push en Starssenger */
self.addEventListener('push', function(event) {
  if (!event.data) return;
  
  let data = {};
  try {
    data = event.data.json();
  } catch(e) {
    data = { title: 'Starssenger', body: event.data.text() };
  }

  const options = {
    body: data.body || 'Nuevo mensaje cifrado',
    icon: '/static/icons/icon-192.png',
    badge: '/static/icons/icon-192.png',
    tag: data.tag || 'sp-msg',
    renotify: true,
    vibrate: [200, 100, 200]
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Starssenger', options)
  );
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      for (let i = 0; i < clientList.length; i++) {
        let client = clientList[i];
        if (client.url && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});