/* ============================================================
   Service worker.
   Gli asset di Vite hanno il nome con l'hash, quindi non si può
   precaricare una lista fissa: si mette in cache quello che passa.
   Dopo la prima visita online l'app parte anche senza rete.
   ============================================================ */

const CACHE = 'libretto-v2'

// Al primo avvio il service worker non controlla ancora le richieste
// già partite, quindi i bundle non finirebbero in cache: l'app
// aggiunta alla Home e messa subito offline non partirebbe.
// Rimedio: in fase di installazione leggo index.html e precarico
// gli asset che referenzia (hanno l'hash nel nome, quindi la lista
// è sempre quella giusta senza generarla a build time).
self.addEventListener('install', e => {
  self.skipWaiting()
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE)
    try {
      const res = await fetch('./index.html', { cache: 'reload' })
      await cache.put('./index.html', res.clone())
      const html = await res.text()
      const asset = [...html.matchAll(/(?:src|href)="(\.\/[^"]+)"/g)].map(m => m[1])
      await cache.addAll(['./', ...new Set(asset)])
    } catch {
      // Nessuna rete durante l'installazione: la cache si riempirà
      // strada facendo, al primo caricamento utile.
    }
  })())
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(chiavi => Promise.all(chiavi.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', e => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return

  // Navigazioni: prima la rete (per prendere gli aggiornamenti),
  // con la pagina in cache come rete di sicurezza offline.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(res => {
          const copia = res.clone()
          caches.open(CACHE).then(c => c.put('./index.html', copia))
          return res
        })
        .catch(() => caches.match('./index.html').then(r => r ?? Response.error())),
    )
    return
  }

  // Asset con hash nel nome: se ce l'ho è già quello giusto.
  e.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached
      return fetch(req).then(res => {
        if (res.ok && res.type === 'basic') {
          const copia = res.clone()
          caches.open(CACHE).then(c => c.put(req, copia))
        }
        return res
      })
    }),
  )
})
