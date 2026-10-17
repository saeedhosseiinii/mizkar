/*
 * Mizkar — offline support.
 * The page opens straight from the cache (fast, also offline) while the network copy is fetched in the
 * background; when it differs, open tabs are told so they can offer a reload. Icons and the manifest are cache-first.
 */
var CACHE = 'mizkar-v1';
var ASSETS = ['./', 'index.html', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'];

self.addEventListener('install', function(event){
  event.waitUntil(caches.open(CACHE).then(function(cache){ return cache.addAll(ASSETS); }).then(function(){ return self.skipWaiting(); }));
});

self.addEventListener('activate', function(event){
  event.waitUntil(caches.keys().then(function(keys){
    // the cache storage is shared by every site on this github.io origin: only drop this app's older versions
    return Promise.all(keys.filter(function(k){ return /^mizkar-/.test(k) && k !== CACHE; }).map(function(k){ return caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});

function versionOf(response){
  return response ? (response.headers.get('etag') || response.headers.get('last-modified') || response.headers.get('content-length') || '') : '';
}

function refreshPage(cache, cached){
  return fetch('index.html', { cache: 'no-cache' }).then(function(fresh){
    if (!fresh || !fresh.ok) return fresh;
    var changed = cached && versionOf(cached) !== versionOf(fresh);
    return cache.put('index.html', fresh.clone()).then(function(){
      if (changed){
        self.clients.matchAll({ type: 'window' }).then(function(list){
          list.forEach(function(c){ c.postMessage({ type: 'fs-update' }); });
        });
      }
      return fresh;
    });
  });
}

self.addEventListener('fetch', function(event){
  var request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  if (request.mode === 'navigate'){
    event.respondWith(caches.open(CACHE).then(function(cache){
      return cache.match('index.html').then(function(cached){
        var update = refreshPage(cache, cached).catch(function(){ return null; });
        if (cached){ event.waitUntil(update); return cached; }
        return update.then(function(fresh){ return fresh || Response.error(); });
      });
    }));
    return;
  }
  event.respondWith(caches.match(request).then(function(hit){
    return hit || fetch(request).then(function(response){
      if (response && response.ok){
        var copy = response.clone();
        caches.open(CACHE).then(function(cache){ cache.put(request, copy); });
      }
      return response;
    });
  }));
});
