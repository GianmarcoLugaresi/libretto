import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from './lib/store'
import { CatalogoProvider } from './lib/catalogoContesto'
import { App } from './App'
import './styles/tokens.css'
import './styles/base.css'
import './styles/components.css'
import './styles/schermi.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider>
      <CatalogoProvider>
        <App />
      </CatalogoProvider>
    </Provider>
  </StrictMode>,
)

// Service worker: serve solo in produzione, e solo per far
// funzionare l'app offline dopo l'aggiunta alla Home.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {})
  })
}
