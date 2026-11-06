// EPT CONTROL OPERATIVO · permite instalar la app y abrirla rápido.
// Solo guarda los archivos del programa; los datos SIEMPRE vienen del servidor (nunca se guardan aquí).
const VERSION = 'ept-2026-11-06-2';
const ARCHIVOS = ['./', './index.html', './estilos.css', './comun.js', './taller.js', './servicios.js', './repuestos.js',
  './catalogo.js', './almacen.js', './caja.js', './reportes.js', './integracion.js', './admin.js', './lib/supabase-2.45.4.js', './lib/xlsx-0.18.5.min.js', './manifest.json', './icono-192.png', './icono-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Archivos del programa: primero la red (para tener siempre lo último), si no hay internet, la copia.
// Lo que va al servidor de datos (supabase.co) no se toca.
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => {
    const copia = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copia)); return r;
  }).catch(() => caches.match(e.request)));
});
