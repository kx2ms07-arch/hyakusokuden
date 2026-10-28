// 百足伝学習アプリ Service Worker
// 更新したら CACHE の版を上げる
const CACHE = 'hyakusokuden-v4';
const FILES = ['./','./index.html','./app.js','./data/poems.json','./data/titles.json','./manifest.webmanifest','./icons/icon-180.png','./icons/icon-192.png','./icons/icon-512.png','./icons/icon-b.svg'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
// 端末の控えをすぐ返し、裏で最新版を取りに行く（次に開いたときに反映）
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(e.request, {ignoreSearch: true});
    const net = fetch(e.request).then(r => { if (r && r.ok) c.put(e.request, r.clone()); return r; }).catch(() => null);
    return hit || (await net) || new Response('オフラインです', {status: 503, headers: {'Content-Type': 'text/plain; charset=utf-8'}});
  }));
});
