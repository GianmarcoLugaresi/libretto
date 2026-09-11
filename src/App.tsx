import { useCallback, useEffect, useRef, useState } from 'react'
import { useApp } from './lib/store'
import { Icona, type NomeIcona } from './components/Icona'
import { Lente } from './components/Lente'
import { Oggi } from './screens/Oggi'
import { Libretto } from './screens/Libretto'
import { Esami } from './screens/Esami'
import { Orario } from './screens/Orario'
import { Statistiche } from './screens/Statistiche'
import { Impostazioni } from './screens/Impostazioni'
import { Esplora } from './screens/Esplora'
import { Onboarding } from './screens/Onboarding'
import { giorniTra, oggi as dataOggi } from './lib/date'

export type Vista = 'oggi' | 'libretto' | 'esami' | 'orario' | 'statistiche'
export type Pila = 'impostazioni' | 'esplora' | null

const TAB: { v: Vista; l: string; i: NomeIcona }[] = [
  { v: 'oggi', l: 'Oggi', i: 'casa' },
  { v: 'libretto', l: 'Libretto', i: 'libro' },
  { v: 'esami', l: 'Esami', i: 'calendario' },
  { v: 'orario', l: 'Orario', i: 'orologio' },
  { v: 'statistiche', l: 'Statistiche', i: 'grafico' },
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
          {vista === 'statistiche' && <Statistiche />}
        </>
      )}
      {pila === 'impostazioni' && <Impostazioni chiudi={chiudiPila} apriEsplora={() => apri('esplora')} />}
      {pila === 'esplora' && <Esplora chiudi={chiudiPila} />}

      {/* Capsula di navigazione: verticale, sul bordo destro, dove
          arriva il pollice. L'etichetta resta per gli screen reader. */}
      {pila === null && (
        <Lente
          as="nav" className="capsule" role="tablist" aria-label="Sezioni"
          fonte=".app > .scroll" raggio={26} chiave={vista}
          ottica={{ forza: 32, labbro: 18, curva: 1.5, gelo: 3, dispersione: 0.1, saturazione: 1.6 }}
          flessione={liquido ? 1 : 0}
        >
          <span
            className={`capsule-thumb${liquido ? ' is-liquido' : ''}`}
            style={{ ['--i' as string]: TAB.findIndex(t => t.v === vista) }}
            aria-hidden="true"
          />
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
        </Lente>
      )}

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
