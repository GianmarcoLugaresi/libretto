import { useCallback, useEffect, useRef, useState } from 'react'
import { useApp } from './lib/store'
import { Icona, type NomeIcona } from './components/Icona'
import { Vetro } from './components/Vetro'
import { Oggi } from './screens/Oggi'
import { Libretto } from './screens/Libretto'
import { Esami } from './screens/Esami'
import { Orario } from './screens/Orario'
import { Statistiche } from './screens/Statistiche'
import { Impostazioni } from './screens/Impostazioni'
import { Esplora } from './screens/Esplora'
import { Onboarding } from './screens/Onboarding'
import { giorniTra, oggi as dataOggi } from './lib/date'
import { NATIVO, NOTIFICHE_DEFAULT, pianificaNotifiche } from './lib/notifiche'
import { NOME_APP } from './lib/app'

export type Vista = 'oggi' | 'libretto' | 'esami' | 'orario'
export type Pila = 'impostazioni' | 'esplora' | 'statistiche' | null

const TAB: { v: Vista; l: string; i: NomeIcona }[] = [
  { v: 'oggi', l: 'Oggi', i: 'casa' },
  { v: 'libretto', l: 'Libretto', i: 'libro' },
  { v: 'esami', l: 'Esami', i: 'calendario' },
  { v: 'orario', l: 'Orario', i: 'orologio' },
]

export function App() {
  const { s, avvisoCorrente } = useApp()
  const [vista, setVista] = useState<Vista>('oggi')
  const [pila, setPila] = useState<Pila>(null)

  // Il tasto "indietro" di iOS/Android chiude la schermata in pila
  // invece di uscire dall'app.
  useEffect(() => {
    // Da Esplora (aperto dal profilo) si torna al profilo, non alla home.
    const onPop = (e: PopStateEvent) => setPila((e.state?.pila as Pila) ?? null)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const apri = useCallback((p: Exclude<Pila, null>) => {
    history.pushState({ pila: p }, '')
    setPila(p)
  }, [])

  const chiudiPila = useCallback(() => {
    if (history.state?.pila) history.back()
    else setPila(null)
  }, [])

  // Il disco della capsula si allunga mentre cambia posto: parte
  // l'animazione a ogni cambio di scheda e si spegne a fine corsa.
  const [liquido, setLiquido] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  const cambiaVista = useCallback((v: Vista) => {
    setVista(prec => {
      if (prec !== v) {
        setLiquido(true)
        window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => setLiquido(false), 540)
      }
      return v
    })
  }, [])

  // Il disco segue il dito lungo la capsula e al rilascio scatta sulla
  // scheda più vicina, come la barra di iOS 26. Un tocco secco resta
  // un tocco: giù e su sulla stessa scheda la seleziona.
  const capsula = useRef<HTMLElement>(null)
  const [trascina, setTrascina] = useState<number | null>(null)   // indice frazionario
  const PASSO = 60, PAD = 6, SLOT = 48, N = TAB.length
  const indiceDa = (clientX: number) => {
    const r = capsula.current!.getBoundingClientRect()
    const x = clientX - r.left - PAD - SLOT / 2
    return Math.max(0, Math.min(N - 1, x / PASSO))
  }
  const giu = (e: React.PointerEvent<HTMLElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    // La cattura tiene il gesto sulla capsula anche se il dito esce;
    // può fallire se il puntatore non è più attivo: non è un errore.
    try { capsula.current?.setPointerCapture(e.pointerId) } catch { /* ignora */ }
    setTrascina(indiceDa(e.clientX))
  }
  const muovi = (e: React.PointerEvent<HTMLElement>) => {
    if (trascina === null) return
    setTrascina(indiceDa(e.clientX))
  }
  const su = (e: React.PointerEvent<HTMLElement>) => {
    if (trascina === null) return
    const i = Math.round(indiceDa(e.clientX))
    setTrascina(null)
    cambiaVista(TAB[i].v)
  }

  // Barra di stato: se l'app gira da Home ma il contenuto NON passa
  // sotto la barra (installata quando lo stile era ancora "default"),
  // la barra è opaca e nera: allora il poster sfuma a nero pieno in
  // cima, così non c'è una giuntura secca. Si misura env() con una
  // sonda, perché da JS non si legge altrimenti.
  useEffect(() => {
    const standalone = (navigator as unknown as { standalone?: boolean }).standalone === true
      || window.matchMedia('(display-mode: standalone)').matches
    if (!standalone) return
    const sonda = document.createElement('div')
    sonda.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;padding-top:env(safe-area-inset-top,0px);visibility:hidden;pointer-events:none'
    document.body.appendChild(sonda)
    const alto = parseFloat(getComputedStyle(sonda).paddingTop) || 0
    sonda.remove()
    if (alto === 0) document.documentElement.dataset.barra = 'opaca'
  }, [])

  // Notifiche (solo app nativa): si riprogrammano quando cambiano
  // lezioni, appelli o esiti, e quando l'app torna in primo piano.
  useEffect(() => {
    if (!NATIVO || s.onboarding) return
    const o = { ...NOTIFICHE_DEFAULT, ...s.impostazioni.notifiche }
    const id = window.setTimeout(() => { pianificaNotifiche(s, o).catch(() => {}) }, 800)
    return () => window.clearTimeout(id)
  }, [s.lezioni, s.appelli, s.esami, s.impostazioni.notifiche, s.onboarding])   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!NATIVO) return
    let togli: (() => void) | undefined
    import('@capacitor/app').then(({ App: CapApp }) => {
      CapApp.addListener('appStateChange', ({ isActive }) => {
        if (isActive && !s.onboarding) {
          const o = { ...NOTIFICHE_DEFAULT, ...s.impostazioni.notifiche }
          pianificaNotifiche(s, o).catch(() => {})
        }
      }).then(h => { togli = () => h.remove() })
    })
    return () => togli?.()
  }, [s])

  if (s.onboarding) return <Onboarding />

  // Pallino sulla tab Esami quando c'è una prenotazione entro
  // la finestra di preavviso.
  const imminente = s.appelli.some(a => {
    const e = Object.values(s.esami).find(x => x.appelloId === a.id)
    if (!e || e.stato !== 'prenotato') return false
    const g = giorniTra(dataOggi(), a.data)
    return g >= 0 && g <= s.impostazioni.preavvisoGiorni
  })

  return (
    <div className="app">
      {pila === null && (
        <>
          {vista === 'oggi' && <Oggi vai={cambiaVista} apri={apri} />}
          {vista === 'libretto' && <Libretto />}
          {vista === 'esami' && <Esami />}
          {vista === 'orario' && <Orario />}
        </>
      )}
      {pila === 'impostazioni' && <Impostazioni chiudi={chiudiPila} apriEsplora={() => apri('esplora')} />}
      {pila === 'esplora' && <Esplora chiudi={chiudiPila} />}
      {pila === 'statistiche' && <Statistiche chiudi={chiudiPila} />}

      {/* Capsula di navigazione: verticale, sul bordo destro, dove
          arriva il pollice. L'etichetta resta per gli screen reader. */}
      {pila === null && (
        <Vetro
          as="nav" className="capsule" role="tablist" aria-label="Sezioni"
          raggio={26} sfoco={18} forza={44}
          ref={capsula}
          style={{ ['--i' as string]: trascina ?? TAB.findIndex(t => t.v === vista) }}
          data-trascina={trascina !== null ? '' : undefined}
          onPointerDown={giu} onPointerMove={muovi} onPointerUp={su} onPointerCancel={() => setTrascina(null)}
        >
          <span className="capsule-riflesso" aria-hidden="true" />
          <span className={`capsule-thumb${liquido ? ' is-liquido' : ''}`} aria-hidden="true" />
          {TAB.map(t => (
            <button
              key={t.v} role="tab" className="tab"
              aria-selected={vista === t.v}
              aria-label={t.l}
              onClick={() => cambiaVista(t.v)}
            >
              <span className="tab-ico">
                <Icona nome={t.i} size={21} peso={vista === t.v ? 2.3 : 1.9} />
              </span>
              {t.v === 'esami' && imminente && <span className="tab-dot" />}
              <span className="tab-label">{t.l}</span>
            </button>
          ))}
        </Vetro>
      )}

      {/* iOS non lascia bloccare l'orientamento a una web app: in
          paesaggio si copre tutto e si chiede di girare il telefono. */}
      <div className="gira" role="status" aria-live="polite">
        <span className="gira-icona"><Icona nome="tocco" size={26} peso={2} /></span>
        <span className="headline">Gira il telefono</span>
        <span className="sub dim">{NOME_APP} è pensata in verticale.</span>
      </div>

      {avvisoCorrente && (
        <div className="toast-wrap">
          <div className="toast">
            <Icona nome="check" size={15} peso={2.4} />
            <span>{avvisoCorrente}</span>
          </div>
        </div>
      )}
    </div>
  )
}
