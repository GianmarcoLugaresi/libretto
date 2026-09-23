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

export default defineConfig({
  plugins: [react(), datiLocali()],
  base: './',
  build: { target: 'es2020', outDir: 'dist' },
})
