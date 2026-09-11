import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from './lib/store'
import { App } from './App'
import './styles/tokens.css'
import './styles/base.css'
import './styles/components.css'
import './styles/schermi.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider>
      <App />
    </Provider>
  </StrictMode>,
)

// Altezza dell'app: misurata dalla finestra visibile reale, non da
// 100dvh. Su iOS, al ritorno in primo piano o dopo una rotazione, i
// valori CSS restano per un po' quelli vecchi e in basso resta una
// fascia scoperta; il numero misurato invece è quello vero, e lo
// rimisuriamo appena cambia qualcosa (con due ripetizioni ritardate,
// perché iOS aggiorna la finestra con un po' di ritardo).
function misuraAltezza() {
  const h = Math.round(window.visualViewport?.height ?? window.innerHeight)
  if (h > 0) document.documentElement.style.setProperty('--altezza', `${h}px`)
}
function rimisura() {
  misuraAltezza()
  window.setTimeout(misuraAltezza, 120)
  window.setTimeout(misuraAltezza, 600)
}
misuraAltezza()
for (const ev of ['resize', 'orientationchange', 'pageshow', 'focus']) window.addEventListener(ev, rimisura)
document.addEventListener('visibilitychange', rimisura)
window.visualViewport?.addEventListener('resize', misuraAltezza)

// Service worker: serve solo in produzione, e solo per far
// funzionare l'app offline dopo l'aggiunta alla Home.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {})
  })
}
