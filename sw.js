/*
 * Mizkar — offline support.
 * The page opens straight from the cache (fast, also offline) while the network copy is fetched in the
 * background; when it differs, open tabs are told so they can offer a reload. Icons and the manifest are cache-first.
 * The one POST it answers is Android's «share» sheet: the text is parked in IndexedDB for the page to pick up.
 */
var CACHE = 'mizkar-1.52';
var ASSETS = ['./', 'index.html', 'app.js', 'vendor/mermaid.min.js', 'vendor/katex.min.js', 'vendor/katex.min.css', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'];
var SHARE_DB = 'mizkar', SHARE_STORE = 'meta', SHARE_KEY = 'inbox-share';

self.addEventListener('install', function(event){
  event.waitUntil(caches.open(CACHE).then(function(cache){ return cache.addAll(ASSETS); }).then(function(){ return self.skipWaiting(); }));
});

self.addEventListener('activate', function(event){
  event.waitUntil(caches.keys().then(function(keys){
    // drop older mizkar / leftover beta caches on this origin
    return Promise.all(keys.filter(function(k){
      return k !== CACHE && (/^mizkar-/.test(k) || /^mzbeta2?-/.test(k));
    }).map(function(k){ return caches.delete(k); }));
  }).then(function(){ return self.clients.claim(); }));
});

/* --- «share» from the phone: park the text, then land on the app --- */
function shareStore(item){
  return new Promise(function(resolve){
    var rq = indexedDB.open(SHARE_DB, 2);
    rq.onupgradeneeded = function(){
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
  // the update check must always see the live version
  if (/\/version\.json$/.test(new URL(request.url).pathname)) return;
  if (request.mode === 'navigate'){
    event.respondWith(navigationPage());
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

/** Tell open tabs a newer shell arrived (the page listens for `fs-update`). */
function notifyFsUpdate(){
  return self.clients.matchAll({ type: 'window' }).then(function(list){
    list.forEach(function(c){ try { c.postMessage({ type: 'fs-update' }); } catch(e){} });
  });
}

/** The newest index.html, or the saved one when the network is slow/offline. */
function navigationPage(){
  return caches.open(CACHE).then(function(cache){
    return cache.match('index.html').then(function(cached){
      var net = fetch('index.html', { cache: 'no-cache' })
        .then(function(fresh){ return fresh && fresh.ok ? fresh : null; })
        .catch(function(){ return null; });
      var inTime = Promise.race([net, new Promise(function(r){ setTimeout(function(){ r(null); }, 3000); })]);
      return inTime.then(function(fresh){
        if (!fresh) return cached || net.then(function(late){ return late || Response.error(); });
        if (!cached){ cache.put('index.html', fresh.clone()); return fresh; }
        return Promise.all([cached.clone().text(), fresh.clone().text()]).then(function(pair){
          cache.put('index.html', fresh.clone());
          if (pair[0] !== pair[1]) notifyFsUpdate();
          return fresh;
        }).catch(function(){ cache.put('index.html', fresh.clone()); return fresh; });
      });
    });
  });
}
