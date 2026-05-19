// ==================== 预约咨询管理平台 - Service Worker ====================
// 作用：缓存静态资源，实现离线访问和数据持久化

const CACHE_NAME = 'yygl-v1.0.0';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json'
];

// 安装：预缓存核心文件
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      console.log('[SW] 正在缓存核心文件...');
      return cache.addAll(STATIC_ASSETS);
    }).then(function() {
      console.log('[SW] 核心文件缓存完成');
      return self.skipWaiting(); // 立即激活新版本
    }).catch(function(err) {
      console.error('[SW] 缓存失败:', err);
    })
  );
});

// 激活：清理旧版本缓存
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cacheName) {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] 删除旧缓存:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(function() {
      console.log('[SW] Service Worker 激活成功');
      return self.clients.claim(); // 立即接管所有页面
    })
  );
});

// 请求拦截：缓存优先策略
self.addEventListener('fetch', function(event) {
  // 仅处理同源请求
  if (!event.request.url.startsWith(self.location.origin)) return;

  var request = event.request;

  // API 请求（跨域或含 api/ 路径）：网络优先，失败用缓存
  if (request.url.includes('/api') || request.method !== 'GET') {
    event.respondWith(
      fetch(request).catch(function() {
        return caches.match(request).then(function(response) {
          if (response) return response;
          // 离线且无缓存时返回提示
          return new Response(
            JSON.stringify({ error: '离线状态，该请求无法缓存' }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
          );
        });
      })
    );
    return;
  }

  // 静态资源（HTML/CSS/JS/字体等）：缓存优先，网络备用
  event.respondWith(
    caches.match(request).then(function(cachedResponse) {
      if (cachedResponse) {
        // 命中缓存，同时在后台更新缓存（stale-while-revalidate）
        var fetchPromise = fetch(request).then(function(networkResponse) {
          if (networkResponse && networkResponse.status === 200) {
            var responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then(function(cache) {
              cache.put(request, responseClone);
            });
          }
          return networkResponse;
        }).catch(function() {
          // 网络失败，忽略即可（已从缓存返回）
        });
        return cachedResponse;
      }

      // 未命中缓存，尝试网络请求
      return fetch(request).then(function(networkResponse) {
        if (networkResponse && networkResponse.status === 200) {
          var responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(request, responseClone);
          });
        }
        return networkResponse;
      }).catch(function(err) {
        console.warn('[SW] 网络请求失败，且无缓存:', request.url);
      });
    })
  );
});

// 推送通知（预留）
self.addEventListener('push', function(event) {
  if (!event.data) return;
  var data = event.data.json();
  var options = {
    body: data.body || '您有新的提醒',
    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">🔔</text></svg>',
    badge: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">📋</text></svg>',
    vibrate: [200, 100, 200],
    tag: data.tag || 'yygl-reminder',
    renotify: true,
    requireInteraction: false
  };
  event.waitUntil(
    self.registration.showNotification(data.title || '预约管理平台', options)
  );
});

// 通知点击
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      if (clientList.length > 0) {
        return clientList[0].focus();
      }
      return clients.openWindow('./index.html');
    })
  );
});
