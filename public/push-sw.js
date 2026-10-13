// Web Push for the service worker (imported by the generated sw.js; see vite.config.ts). Pushes carry no
// payload: the phone asks the Worker what to show, so the message is in the farmer's language and up to date.
// If that fails (no signal), it shows the text the app saved in the farmer's language when alerts were turned on.
;(function () {
  var FALLBACK = '/push-fallback'

  function fallbackMessage() {
    return caches
      .open('bhoopal-push')
      .then(function (cache) {
        return cache.match(FALLBACK)
      })
      .then(function (res) {
        return res ? res.json() : null
      })
      .catch(function () {
        return null
      })
      .then(function (saved) {
        return saved || { title: 'BhooPal', body: 'Tap to see today’s weather.', tag: 'morning', url: '/#/weather' }
      })
  }

  function currentMessage() {
    return self.registration.pushManager
      .getSubscription()
      .then(function (sub) {
        if (!sub) return null
        return fetch('/api/push/message', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).then(function (res) {
          return res.status === 200 ? res.json() : null
        })
      })
      .catch(function () {
        return null
      })
  }

  self.addEventListener('push', function (event) {
    event.waitUntil(
      currentMessage()
        .then(function (message) {
          return message || fallbackMessage()
        })
        .then(function (m) {
          // Phones must show something for every push, or the browser shows its own notice.
          return self.registration.showNotification(m.title, {
            body: m.body,
            tag: m.tag,
            lang: m.lang,
            icon: '/pwa-192x192.png',
            badge: '/pwa-64x64.png',
            data: { url: m.url || '/#/weather' },
          })
        }),
    )
  })

  self.addEventListener('notificationclick', function (event) {
    event.notification.close()
    var url = (event.notification.data && event.notification.data.url) || '/'
    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (windows) {
        for (var i = 0; i < windows.length; i++) {
          if ('focus' in windows[i]) {
            var w = windows[i]
            return w.focus().then(function () {
              return 'navigate' in w ? w.navigate(url) : w
            })
          }
        }
        return self.clients.openWindow(url)
      }),
    )
  })
})()
