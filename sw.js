/*
 * Mizkar — offline support.
 * The page opens straight from the cache (fast, also offline) while the network copy is fetched in the
 * background; when it differs, open tabs are told so they can offer a reload. Icons and the manifest are cache-first.
 * The one POST it answers is Android's «share» sheet: the text is parked in IndexedDB for the page to pick up.
 */
var CACHE = 'mizkar-v3';
var ASSETS = ['./', 'index.html', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'];
var SHARE_DB = 'mizkar', SHARE_STORE = 'meta', SHARE_KEY = 'inbox-share';

self.addEventListener('install', function(event){
  event.waitUntil(caches.open(CACHE).then(function(cache){ return cache.addAll(ASSETS); }).then(function(){ return self.skipWaiting(); }));
});

self.addEventListener('activate', function(event){
  event.waitUntil(caches.keys().then(function(keys){
    // the cache storage is shared by every site on this origin: only drop this app's older versions
    return Promise.all(keys.filter(function(k){ return /^mizkar-/.test(k) && k !== CACHE; }).map(function(k){ return caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});

/* --- «share» from the phone: park the text, then land on the app --- */
function shareStore(item){
  return new Promise(function(resolve){
    var rq = indexedDB.open(SHARE_DB, 2);
    rq.onupgradeneeded = function(){
      // the same stores the page makes: whoever creates the database first, the other must still find its stores
      ['kv', 'notes', 'queue', 'search', 'meta'].forEach(function(n){ if (!rq.result.objectStoreNames.contains(n)) rq.result.createObjectStore(n); });
    };
    rq.onerror = function(){ resolve(false); };
    rq.onsuccess = function(){
      var db = rq.result;
      try {
        var tx = db.transaction(SHARE_STORE, 'readwrite');
        tx.objectStore(SHARE_STORE).put(item, SHARE_KEY);
        tx.oncomplete = function(){ resolve(true); };
        tx.onerror = function(){ resolve(false); };
      } catch(e){ resolve(false); }
    };
  });
}

self.addEventListener('fetch', function(event){
  var request = event.request;
  if (request.method === 'POST' && /\/share$/i.test(new URL(request.url).pathname)){
    event.respondWith(request.formData().then(function(form){
      var item = {
        at: Date.now(),
        title: (form.get('title') || '').toString().slice(0, 200),
        text: [(form.get('text') || '').toString(), (form.get('url') || '').toString()].filter(Boolean).join('\n').slice(0, 20000)
      };
      return shareStore(item);
    }).catch(function(){ return false; }).then(function(){
      return Response.redirect(new URL('./', request.url).href, 303);
    }));
    return;
  }
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  // the betas (/beta/, /beta2/) have their own workers and caches: never answer for them from here
  if (/\/beta2?\//.test(new URL(request.url).pathname) && !/\/beta2?\//.test(self.location.pathname)) return;
  // the update check must always see the live version
  if (/\/version\.json$/.test(new URL(request.url).pathname)) return;
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
