const CACHE='score-v2';
const ASSETS=[
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/main.js',
  '/site.webmanifest',
  '/icons-score.svg',
  '/assets/logo-score.webp',
  '/data/catalog.json'
];

self.addEventListener('install', e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));
});

self.addEventListener('activate', e=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))
  );
});

self.addEventListener('fetch', e=>{
  const req=e.request;
  // network-first for HTML & JSON
  const url=new URL(req.url);
  if(url.pathname.endsWith('.html') || url.pathname.endsWith('.json')){
    e.respondWith(fetch(req).then(res=>{
      const copy=res.clone();
      caches.open(CACHE).then(c=>c.put(req,copy));
      return res;
    }).catch(()=>caches.match(req)));
    return;
  }
  // cache-first for rest
  e.respondWith(caches.match(req).then(cached=>cached||fetch(req)));
});