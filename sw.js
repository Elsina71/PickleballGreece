// Copia dell'app sul telefono: così si apre anche senza internet (es. lo scoresheet a bordo campo).
// I file dell'app si prendono sempre prima dalla rete (versione aggiornata) e, se manca la connessione, dalla copia salvata.
// Le librerie esterne (Firebase, icone, caratteri, PDF) hanno la versione fissa: si usa la copia salvata e la si rinnova.
const CACHE = 'pbm-app-v1';
const CORE = ['./', 'index.html', 'manifest.webmanifest', 'css/style.css', 'css/temi.css',
  'js/i18n.js', 'js/temi.js', 'js/logic.js', 'js/store.js', 'js/premi.js', 'js/demo.js', 'js/score.js', 'js/referto.js', 'js/app.js', 'js/cloud.js', 'js/firebase-config.js',
  'img/logo.png', 'img/favicon-64.png', 'img/apple-touch-icon.png', 'img/icon-192.png',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js', 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js', 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js',
  'https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.19.0/dist/tabler-icons.min.css'];
const CDN = /^https:\/\/(www\.gstatic\.com\/firebasejs|cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)\//;

self.addEventListener('install', e => {
  // un file che non si scarica non blocca il resto
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(CORE.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

const keep = (req, res) => { if (res && (res.ok || res.type === 'opaque')) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)); } return res; };
// con una connessione lenta a bordo campo non si aspetta più di 5 secondi
const timeout = (p, ms) => new Promise((ok, ko) => { const t = setTimeout(() => ko(new Error('timeout')), ms); p.then(r => { clearTimeout(t); ok(r); }, e => { clearTimeout(t); ko(e); }); });

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    e.respondWith(timeout(fetch(req), 5000).then(res => keep(req, res)).catch(() =>
      caches.match(req, { ignoreSearch: true }).then(m => m || (req.mode === 'navigate' ? caches.match('index.html') : caches.match(url.pathname.replace(/^\//, ''))))
        .then(m => m || Response.error())));
    return;
  }
  if (CDN.test(req.url)) {
    e.respondWith(caches.match(req).then(m => {
      const net = fetch(req).then(res => keep(req, res)).catch(() => m || Response.error());
      return m || net;
    }));
  }
  // tutto il resto (database, accesso) passa direttamente dalla rete
});
