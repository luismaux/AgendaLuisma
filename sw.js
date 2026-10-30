const CACHE="mis-anotaciones-cache-v5";
const FILES=["./","./index.html","./styles.css?v=5","./app.js?v=5","./manifest.webmanifest","./icons/icon-192.png","./icons/icon-512.png"];
self.addEventListener("install",e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)));});
self.addEventListener("activate",e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",e=>{if(e.request.method!=="GET"||!e.request.url.startsWith(self.location.origin))return;e.respondWith(fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r;}).catch(()=>caches.match(e.request,{ignoreSearch:true}).then(c=>c||caches.match("./index.html"))));});
self.addEventListener("notificationclick",e=>{e.notification.close();e.waitUntil(clients.matchAll({type:"window",includeUncontrolled:true}).then(list=>{for(const c of list){if("focus" in c)return c.focus();}return clients.openWindow("./");}));});
