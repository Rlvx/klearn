// Bump on every deploy that changes any file, or phones keep the old version.
const CACHE = 'klearn-v1';
const ASSETS = [
  './', 'index.html', 'style.css', 'app.js', 'srs.js', 'game.js', 'exercises.js', 'session.js', 'store.js',
  'manifest.webmanifest', 'content/hangul.json', 'content/phrases.json', 'content/vocab.json',
  'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', e => {
  // cache: 'reload' skips the HTTP cache so a new version never precaches stale files.
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' })))));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('klearn-') && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request)));
});
