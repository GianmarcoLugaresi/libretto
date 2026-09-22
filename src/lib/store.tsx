/* ============================================================
   Stato applicativo.
   Tutto vive in localStorage sul dispositivo: nessun server,
   nessun account, niente che esca dal telefono.
   ============================================================ */

import { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type {
  Stato, Profilo, Impostazioni, Insegnamento, Esame, Appello, Lezione, StatoSync,
} from './types'
import { depositoCarriera, VERSIONE_SCHEMA } from './deposito'
import { migra } from './migrazione'

export const VERSIONE = VERSIONE_SCHEMA
const deposito = depositoCarriera()

export function nuovoId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

/* ---------------- Azioni ---------------- */

type Azione =
  | { t: 'carica'; stato: Stato }
  | { t: 'profilo'; v: Partial<Profilo> }
  | { t: 'impostazioni'; v: Partial<Impostazioni> }
  | { t: 'ins.add'; v: Insegnamento }
  | { t: 'ins.set'; id: string; v: Partial<Insegnamento> }
  | { t: 'ins.del'; id: string }
  | { t: 'esame.set'; id: string; v: Partial<Esame> }
  | { t: 'esame.reset'; id: string }
  | { t: 'appello.add'; v: Appello }
  | { t: 'appello.set'; id: string; v: Partial<Appello> }
  | { t: 'appello.del'; id: string }
  | { t: 'lezione.add'; v: Lezione }
  | { t: 'lezione.set'; id: string; v: Partial<Lezione> }
  | { t: 'lezione.del'; id: string }
  | { t: 'sync'; v: Partial<StatoSync> }
  | { t: 'onboarding.fine' }

function esameBase(id: string): Esame {
  return { insegnamentoId: id, stato: 'da_sostenere' }
}

function riduci(s: Stato, a: Azione): Stato {
  switch (a.t) {
    case 'carica':
      return a.stato

    case 'profilo':
      return { ...s, profilo: { ...s.profilo, ...a.v } }

    case 'impostazioni':
      return { ...s, impostazioni: { ...s.impostazioni, ...a.v } }

    case 'ins.add':
      return {
        ...s,
        insegnamenti: [...s.insegnamenti, a.v],
        esami: { ...s.esami, [a.v.id]: esameBase(a.v.id) },
      }

    case 'ins.set':
      return {
        ...s,
        insegnamenti: s.insegnamenti.map(i => (i.id === a.id ? { ...i, ...a.v } : i)),
      }

    case 'ins.del': {
      const esami = { ...s.esami }
      delete esami[a.id]
      return {
        ...s,
        insegnamenti: s.insegnamenti.filter(i => i.id !== a.id),
        esami,
        // Un insegnamento cancellato si porta via appelli e lezioni,
        // altrimenti restano righe orfane nel calendario.
        appelli: s.appelli.filter(x => x.insegnamentoId !== a.id),
        lezioni: s.lezioni.filter(x => x.insegnamentoId !== a.id),
      }
    }

    case 'esame.set': {
      const prec = s.esami[a.id] ?? esameBase(a.id)
      return { ...s, esami: { ...s.esami, [a.id]: { ...prec, ...a.v } } }
    }

    case 'esame.reset':
      return { ...s, esami: { ...s.esami, [a.id]: esameBase(a.id) } }

    case 'appello.add':
      return { ...s, appelli: [...s.appelli, a.v] }

    case 'appello.set':
      return { ...s, appelli: s.appelli.map(x => (x.id === a.id ? { ...x, ...a.v } : x)) }

    case 'appello.del': {
      // Se eri prenotato proprio a questo appello, la prenotazione
      // decade insieme alla data.
      const esami = { ...s.esami }
      for (const k of Object.keys(esami)) {
        if (esami[k].appelloId === a.id) {
          esami[k] = { ...esami[k], appelloId: undefined, stato: esami[k].stato === 'prenotato' ? 'da_sostenere' : esami[k].stato }
        }
      }
      return { ...s, appelli: s.appelli.filter(x => x.id !== a.id), esami }
    }

    case 'lezione.add':
      return { ...s, lezioni: [...s.lezioni, a.v] }

    case 'lezione.set':
      return { ...s, lezioni: s.lezioni.map(x => (x.id === a.id ? { ...x, ...a.v } : x)) }

    case 'lezione.del':
      return { ...s, lezioni: s.lezioni.filter(x => x.id !== a.id) }

    case 'sync':
      return { ...s, sync: { ...s.sync, ...a.v } }

    case 'onboarding.fine':
      return { ...s, onboarding: false }
  }
}

/* ---------------- Persistenza ---------------- */

/** Legge quel che c'è su disco e lo porta allo schema corrente.
 *  Le note della migrazione finiscono in console: servono a capire
 *  cos'è successo ai dati, non all'utente. */
function leggi(): Stato {
  const { carriera, passaggi, note } = migra(deposito.leggiGrezzo(), nuovoId)
  if (passaggi > 0 && note.length) console.info('[dati]', note.join(' '))
  return carriera
}

function scrivi(s: Stato) {
  deposito.scrivi(s)
}

/* ---------------- Contesto ---------------- */

interface Ctx {
  s: Stato
  d: (a: Azione) => void
  /** Messaggio effimero in fondo allo schermo */
  avviso: (testo: string) => void
  avvisoCorrente: string | null
}

const AppCtx = createContext<Ctx | null>(null)

export function Provider({ children }: { children: ReactNode }) {
  const [s, d] = useReducer(riduci, null, leggi)
  const [avvisoCorrente, setAvviso] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const primo = useRef(true)

  // Salva a ogni cambiamento, saltando il primo render.
  useEffect(() => {
    if (primo.current) { primo.current = false; return }
    scrivi(s)
  }, [s])

  // Il tema segue le impostazioni, non solo il sistema.
  useEffect(() => {
    // Il design è nato scuro: 'chiaro' è l'unica variante esplicita,
    // tutto il resto (compreso il vecchio 'auto') cade sullo scuro.
    const root = document.documentElement
    if (s.impostazioni.tema === 'chiaro') root.setAttribute('data-theme', 'light')
    else root.removeAttribute('data-theme')
  }, [s.impostazioni.tema])

  const valore = useMemo<Ctx>(() => ({
    s, d,
    avvisoCorrente,
    avviso: (testo: string) => {
      setAvviso(testo)
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setAvviso(null), 2200)
    },
  }), [s, avvisoCorrente])

  return <AppCtx.Provider value={valore}>{children}</AppCtx.Provider>
}

export function useApp(): Ctx {
  const c = useContext(AppCtx)
  if (!c) throw new Error('useApp fuori dal Provider')
  return c
}

/* ---------------- Import / export ---------------- */

export function esporta(s: Stato): string {
  return JSON.stringify(s, null, 2)
}

export function importa(testo: string): Stato {
  const dati = JSON.parse(testo)
  if (!dati || !Array.isArray(dati.insegnamenti) || !dati.profilo) {
    throw new Error('Il file non sembra un backup di MySapienza.')
  }
  // Un backup può venire da una versione precedente: passa dalla
  // stessa migrazione dei dati su disco.
  return migra(dati, nuovoId).carriera
}

export function cancellaTutto() {
  deposito.cancella()
}
