/* ============================================================
   Il catalogo pubblico dentro l'app.

   Apre il deposito locale, legge quello che c'è e poi, senza far
   aspettare nessuno, controlla se ci sono novità: al massimo una
   volta ogni sei ore, e di nuovo quando l'app torna in primo piano.
   La UI non aspetta mai la rete: mostra quello che ha, e si
   aggiorna da sola quando arriva qualcosa di nuovo.
   ============================================================ */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { apriCatalogo } from './deposito'
import {
  codiceDellaCoorte, serveControllare,
  type Appelli, type Corso, type Indice, type Orario, type Piano,
} from './dati'
import type { CatalogoRemoto } from './catalogoRemoto'
import { useApp } from './store'

export type StatoCatalogo = 'avvio' | 'pronto' | 'vuoto'

interface Ctx {
  cat: CatalogoRemoto | null
  indice: Indice | undefined
  /** avvio: sto leggendo il telefono; vuoto: non ho mai scaricato niente */
  stato: StatoCatalogo
  aggiornatoIl?: string
  aggiornando: boolean
  /** L'ultimo tentativo non è arrivato alla rete */
  offline: boolean
  /** Cresce a ogni file nuovo: chi legge dal deposito si rilegge */
  versione: number
  aggiorna: (forza?: boolean) => Promise<void>
  /** Scarica i file di una coorte se mancano o sono cambiati */
  prepara: (corso: Corso, coorte: number) => Promise<void>
}

const CatalogoCtx = createContext<Ctx | null>(null)

export function CatalogoProvider({ children }: { children: ReactNode }) {
  const { s } = useApp()
  const [cat, setCat] = useState<CatalogoRemoto | null>(null)
  const [indice, setIndice] = useState<Indice | undefined>()
  const [stato, setStato] = useState<StatoCatalogo>('avvio')
  const [aggiornatoIl, setAggiornatoIl] = useState<string | undefined>()
  const [aggiornando, setAggiornando] = useState(false)
  const [offline, setOffline] = useState(false)
  const [versione, setVersione] = useState(0)
  const inCorso = useRef<Promise<void> | null>(null)

  // Il corso dello studente: i suoi file si tengono sempre aggiornati.
  const mio = useRef<{ codice: string; coorte: number } | null>(null)
  mio.current = s.profilo.codiceCorso
    ? { codice: s.profilo.codiceCorso, coorte: s.profilo.immatricolazione }
    : null

  useEffect(() => {
    let vivo = true
    // Il client (con zod) arriva dopo il primo disegno: l'avvio
    // dell'app non aspetta la validazione dei dati pubblici.
    Promise.all([apriCatalogo(), import('./catalogoRemoto')])
      .then(async ([dep, { CatalogoRemoto }]) => {
        const c = new CatalogoRemoto(dep)
        const [ind, quando] = await Promise.all([c.indice(), c.aggiornatoIl()])
        if (!vivo) return
        setCat(c); setIndice(ind); setAggiornatoIl(quando)
        setStato(ind ? 'pronto' : 'vuoto')
      })
      .catch(() => {
        // Niente IndexedDB (navigazione privata su vecchi browser):
        // l'app resta usabile a mano, senza catalogo.
        if (vivo) setStato('vuoto')
      })
    return () => { vivo = false }
  }, [])

  const rileggi = useCallback(async (c: CatalogoRemoto) => {
    const [ind, quando] = await Promise.all([c.indice(), c.aggiornatoIl()])
    setIndice(ind); setAggiornatoIl(quando)
    setStato(ind ? 'pronto' : 'vuoto')
    setVersione(v => v + 1)
  }, [])

  const aggiorna = useCallback(async (forza = false) => {
    if (!cat) return
    if (!forza && !serveControllare(aggiornatoIl, new Date())) return
    // Una sola sincronizzazione alla volta: chi arriva dopo aspetta
    // quella in corso invece di partirne un'altra.
    if (inCorso.current) return inCorso.current
    const giro = (async () => {
      setAggiornando(true)
      try {
        const e = await cat.aggiornaIndice()
        setOffline(e === 'offline')
        const m = mio.current
        const ind = await cat.indice()
        const corso = m && ind?.corsi.find(c => c.codice === m.codice)
        if (m && corso) await cat.aggiornaCorso(codiceDellaCoorte(corso, m.coorte), m.coorte, corso.codice)
        await rileggi(cat)
      } finally {
        setAggiornando(false)
        inCorso.current = null
      }
    })()
    inCorso.current = giro
    return giro
  }, [cat, aggiornatoIl, rileggi])

  const prepara = useCallback(async (corso: Corso, coorte: number) => {
    if (!cat) return
    if (!(await cat.indice())) {
      const e = await cat.aggiornaIndice()
      setOffline(e === 'offline')
    }
    const esiti = await cat.aggiornaCorso(codiceDellaCoorte(corso, coorte), coorte, corso.codice)
    if (Object.values(esiti).some(e => e === 'aggiornato')) await rileggi(cat)
    else if (Object.values(esiti).every(e => e === 'offline')) setOffline(true)
  }, [cat, rileggi])

  // Al primo avvio con il deposito aperto, e a ogni ritorno in primo
  // piano: il controllo decide da sé se sono passate sei ore.
  useEffect(() => {
    if (!cat) return
    aggiorna().catch(() => {})
    const torna = () => { if (document.visibilityState === 'visible') aggiorna().catch(() => {}) }
    document.addEventListener('visibilitychange', torna)
    return () => document.removeEventListener('visibilitychange', torna)
  }, [cat])   // eslint-disable-line react-hooks/exhaustive-deps

  const valore = useMemo<Ctx>(() => ({
    cat, indice, stato, aggiornatoIl, aggiornando, offline, versione, aggiorna, prepara,
  }), [cat, indice, stato, aggiornatoIl, aggiornando, offline, versione, aggiorna, prepara])

  return <CatalogoCtx.Provider value={valore}>{children}</CatalogoCtx.Provider>
}

export function useCatalogo(): Ctx {
  const c = useContext(CatalogoCtx)
  if (!c) throw new Error('useCatalogo fuori dal CatalogoProvider')
  return c
}

/* ---------------- Il proprio corso ---------------- */

/** Il corso dello studente nel catalogo, con i file della sua coorte. */
export function useMioCorso(): FileCorso & { corso?: Corso; codiceCoorte?: string } {
  const { s } = useApp()
  const { indice } = useCatalogo()
  const corso = indice?.corsi.find(c => c.codice === s.profilo.codiceCorso)
  const f = useFileCorso(corso, corso ? s.profilo.immatricolazione : undefined)
  return { ...f, corso, codiceCoorte: corso ? codiceDellaCoorte(corso, s.profilo.immatricolazione) : undefined }
}

/* ---------------- File di un corso ---------------- */

export interface FileCorso {
  piano?: Piano
  appelli?: Appelli
  orario?: Orario
  /** Sto leggendo o scaricando */
  caricamento: boolean
}

/** Piano, appelli e orario di un corso e di una coorte. Legge dal
 *  telefono; se manca qualcosa prova a scaricarlo, senza bloccare. */
export function useFileCorso(corso: Corso | undefined, coorte: number | undefined): FileCorso {
  const { cat, versione, prepara } = useCatalogo()
  const [f, setF] = useState<FileCorso>({ caricamento: true })
  const codice = corso && coorte != null ? codiceDellaCoorte(corso, coorte) : undefined
  const tentato = useRef<string | null>(null)

  useEffect(() => {
    if (!cat || !corso || !codice || coorte == null) { setF({ caricamento: false }); return }
    let vivo = true
    ;(async () => {
      const leggi = () => Promise.all([cat.piano(codice, coorte), cat.appelli(corso.codice), cat.orario(codice, coorte)])
      let [piano, appelli, orario] = await leggi()
      if (!vivo) return
      setF({ piano, appelli, orario, caricamento: false })
      // Un tentativo di rete per corso e coorte, non uno a ogni render.
      const chiave = `${codice}/${coorte}`
      if (tentato.current !== chiave) {
        tentato.current = chiave
        setF(p => ({ ...p, caricamento: true }))
        await prepara(corso, coorte).catch(() => {})
        ;[piano, appelli, orario] = await leggi()
        if (vivo) setF({ piano, appelli, orario, caricamento: false })
      }
    })().catch(() => { if (vivo) setF(p => ({ ...p, caricamento: false })) })
    return () => { vivo = false }
  }, [cat, corso, codice, coorte, versione, prepara])

  return f
}
