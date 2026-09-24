/* ============================================================
   Stato applicativo.
   Tutto vive in localStorage sul dispositivo: nessun server,
   nessun account, niente che esca dal telefono.
   ============================================================ */

import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type {
  Stato, Profilo, Impostazioni, Insegnamento, Esame, Appello, Lezione, StatoSync, StatoInfostud,
} from './types'
import { collega, togliUfficiale } from './infostud/unisci'
import { depositoCarriera, VERSIONE_SCHEMA } from './deposito'
import { migra } from './migrazione'
import { NOME_APP } from './app'
import { applicaTema } from './aspetto'

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
  /** Il risultato di una sincronizzazione Infostud: tocca solo l'area
   *  infostud e la data dell'ultima sincronizzazione */
  | { t: 'infostud.sync'; infostud: StatoInfostud; quando: string }
  | { t: 'infostud.collega'; codice: string; insegnamentoId: string }
  | { t: 'infostud.nuovo'; codice: string; ins: Insegnamento }
  | { t: 'infostud.tieni'; insegnamentoId: string }
  | { t: 'infostud.togli'; insegnamentoId: string }
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
      const ufficiali = { ...s.infostud.esami }
      delete ufficiali[a.id]
      return {
        ...s,
        infostud: { ...s.infostud, esami: ufficiali },
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

    case 'infostud.sync':
      return { ...s, infostud: a.infostud, sync: { ...s.sync, infostudIl: a.quando } }

    case 'infostud.collega':
      return collega(s, a.codice, a.insegnamentoId)

    case 'infostud.nuovo': {
      if (s.insegnamenti.some(i => i.id === a.ins.id)) return collega(s, a.codice, a.ins.id)
      const conIns = { ...s, insegnamenti: [...s.insegnamenti, a.ins], esami: { ...s.esami, [a.ins.id]: esameBase(a.ins.id) } }
      return collega(conIns, a.codice, a.ins.id)
    }

    case 'infostud.tieni': {
      const r = s.infostud.esami[a.insegnamentoId]
      if (!r) return s
      const { nonPiuPresente: _, ...resto } = r
      return { ...s, infostud: { ...s.infostud, esami: { ...s.infostud.esami, [a.insegnamentoId]: resto } } }
    }

    case 'infostud.togli':
      return togliUfficiale(s, a.insegnamentoId)

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

  // Il tema segue le impostazioni; in automatico, il telefono. Prima
  // del disegno, perché la pagina non parta scura per un istante.
  useLayoutEffect(() => applicaTema(s.impostazioni.tema), [s.impostazioni.tema])

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
    throw new Error(`Il file non sembra un backup di ${NOME_APP}.`)
  }
  // Un backup può venire da una versione precedente: passa dalla
  // stessa migrazione dei dati su disco.
  return migra(dati, nuovoId).carriera
}

export function cancellaTutto() {
  deposito.cancella()
}
