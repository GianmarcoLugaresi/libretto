import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

/** In sviluppo, `DATI_LOCALI=<cartella>` serve i file prodotti dalla
 *  pipeline sotto /dati-locali/, così l'app si prova sui dati veri
 *  senza aspettare il giro notturno. Non entra mai nella build. */
function datiLocali(): Plugin {
  const cartella = process.env.DATI_LOCALI ? resolve(process.env.DATI_LOCALI) : null
  return {
    name: 'dati-locali',
    apply: 'serve',
    configureServer(server) {
      if (!cartella) return
      server.middlewares.use('/dati-locali', (req, res) => {
        const percorso = join(cartella, decodeURIComponent((req.url ?? '/').split('?')[0]))
        if (!percorso.startsWith(cartella)) { res.statusCode = 403; res.end(); return }
        try {
          const corpo = readFileSync(percorso)
          res.setHeader('content-type', 'application/json')
          res.end(corpo)
        } catch {
          res.statusCode = 404
          res.end()
        }
      })
    },
  }
}

/** In sviluppo, un Infostud finto per provare la sincronizzazione vera
 *  (WebView, script, merge) sul simulatore senza toccare Infostud.
 *  Il «fornitore SPID» sta su 127.0.0.1, un host diverso: lì lo script
 *  dell'app non deve girare. Le risposte sono quelle finte di
 *  src/lib/infostud/fixture.ts. Non entra mai nella build. */
function infostudFinto(): Plugin {
  const SESSIONE = '00000000-0000-4000-8000-00000000f1e7'
  const pagina = (titolo: string, corpo: string) =>
    `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<title>${titolo}</title><style>body{font:17px -apple-system,system-ui;margin:32px 20px;color:#222}` +
    `a.b,button{display:block;padding:14px;border-radius:10px;background:#83082a;color:#fff;text-align:center;text-decoration:none;border:0;width:100%;font:inherit}` +
    `.n{color:#777;font-size:14px}</style></head><body>${corpo}</body></html>`
  return {
    name: 'infostud-finto',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/infostud-finto', async (req, res) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        const porta = (req.headers.host ?? 'localhost:5174').split(':')[1] ?? '5174'
        const html = (h: string) => { res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(h) }
        const json = (j: unknown) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(j)) }
        const { esamiFinti, prenotazioniFinte } = await import('./src/lib/infostud/fixture')

        if (url.pathname === '/' || url.pathname === '') {
          return html(pagina('Infostud finto', `<h2>Infostud (finto)</h2><p class="n">Pagina di prova del server di sviluppo.</p>` +
            `<a class="b" href="http://127.0.0.1:${porta}/infostud-finto/spid">Entra con SPID</a>`))
        }
        if (url.pathname === '/spid') {
          res.setHeader('set-cookie', 'spidFinto=utente-di-prova; Path=/; HttpOnly')
          return html(pagina('SPID finto', `<h2>Fornitore SPID (finto)</h2><p class="n">Qui lo script dell'app non deve girare.</p>` +
            `<label>Utente<input style="display:block;width:100%;font:inherit;margin:6px 0 16px" value="prova"></label>` +
            `<a class="b" href="http://localhost:${porta}/infostud-finto/home">Autorizza</a>`))
        }
        if (url.pathname === '/home') {
          // Come la pagina vera: dopo l'accesso chiede da sé i suoi dati.
          // Lascia anche cookie e storage di sessione, per poter
          // verificare che a fine sincronizzazione non ne resti traccia.
          res.setHeader('set-cookie', [
            `sessioneFinta=${SESSIONE}; Path=/; HttpOnly`,
            'preferenzaFinta=1; Path=/; Max-Age=31536000',
          ])
          return html(pagina('Infostud finto', `<h2>Benvenuto (finto)</h2><p class="n">La pagina ha chiesto i suoi dati.</p>` +
            `<script>localStorage.setItem('tracciaFinta','da-non-ritrovare');setTimeout(function(){var x=new XMLHttpRequest();x.open('GET','/infostud-finto/phoenixws/studente/1234567/insegnamentisostenibili?cacheBuster='+Date.now()+'&ingresso=${SESSIONE}');x.send()},600)</script>`))
        }
        const m = /^\/phoenixws\/studente\/\d+\/([a-z]+)$/.exec(url.pathname)
        if (m) {
          if (url.searchParams.get('ingresso') !== SESSIONE) { res.statusCode = 401; return json({ esito: { flagEsito: 1, nota: 'Sessione non valida' } }) }
          if (m[1] === 'esamiall') return json(esamiFinti)
          if (m[1] === 'prenotazioni') return json(prenotazioniFinte)
          return json({ esito: { flagEsito: 0, id: 0, nota: '', ritorno: null }, output: SESSIONE, ritorno: { esami: [] } })
        }
        res.statusCode = 404
        res.end()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), datiLocali(), infostudFinto()],
  base: './',
  build: { target: 'es2020', outDir: 'dist' },
})
