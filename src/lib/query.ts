/* ============================================================
   Selettori derivati: le domande che l'interfaccia fa davvero
   allo stato ("cosa ho oggi?", "qual è il prossimo appello?").
   ============================================================ */

import type { Stato, Insegnamento, Lezione, Appello, Esame } from './types'
import { giorniTra, giornoSettimana, minuti, oggi, oraOra, type ISO } from './date'

export function insegnamento(s: Stato, id: string): Insegnamento | undefined {
  return s.insegnamenti.find(i => i.id === id)
}

/** L'esito di un insegnamento come lo vede l'app: quello registrato su
 *  Infostud se c'è, altrimenti quello scritto a mano. Tutte le
 *  statistiche passano da qui, così il record ufficiale vince ovunque
 *  senza toccare l'inserimento manuale, che resta com'era.
 *  Un record che Infostud non elenca più continua a valere finché lo
 *  studente non decide: cambiare la media in silenzio sarebbe peggio. */
export function esameDi(s: Stato, id: string): Esame {
  const manuale = s.esami[id] ?? { insegnamentoId: id, stato: 'da_sostenere' as const }
  const u = s.infostud?.esami[id]
  if (!u) return manuale
  return {
    ...manuale,
    stato: u.idoneita ? 'idoneo' : 'superato',
    voto: u.idoneita ? undefined : u.voto,
    lode: u.lode,
    data: u.data ?? manuale.data,
    appelloId: undefined,
    ufficiale: true,
  }
}

export interface LezioneRisolta {
  lezione: Lezione
  ins: Insegnamento
}

/** Le lezioni di una data, in ordine di orario.
 *  Rispetta il periodo di validità e le date annullate: un corso
 *  del primo semestre non deve comparire a maggio. */
/** Una lezione di un giorno solo: il periodo comincia e finisce nella
 *  stessa data. */
export function eUnaVolta(l: Lezione): boolean {
  return !!l.dal && l.dal === l.al
}

export function lezioniDel(s: Stato, data: ISO): LezioneRisolta[] {
  const g = giornoSettimana(data)
  const out: LezioneRisolta[] = []
  for (const l of s.lezioni) {
    if (l.giorno !== g) continue
    if (l.dal && data < l.dal) continue
    if (l.al && data > l.al) continue
    if (l.saltate?.includes(data)) continue
    const ins = insegnamento(s, l.insegnamentoId)
    if (!ins) continue
    out.push({ lezione: l, ins })
  }
  return out.sort((a, b) => minuti(a.lezione.inizio) - minuti(b.lezione.inizio))
}

/** La lezione in corso adesso, se ce n'è una. */
export function lezioneInCorso(s: Stato): LezioneRisolta | null {
  const ora = minuti(oraOra())
  return lezioniDel(s, oggi()).find(
    r => minuti(r.lezione.inizio) <= ora && ora < minuti(r.lezione.fine),
  ) ?? null
}

/** La prossima lezione entro i prossimi 7 giorni. */
export function prossimaLezione(s: Stato): { r: LezioneRisolta; data: ISO } | null {
  const ora = minuti(oraOra())
  for (let i = 0; i < 8; i++) {
    const data = i === 0 ? oggi() : addISO(oggi(), i)
    for (const r of lezioniDel(s, data)) {
      if (i === 0 && minuti(r.lezione.inizio) <= ora) continue
      return { r, data }
    }
  }
  return null
}

function addISO(iso: ISO, n: number): ISO {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d + n)
  const p = (x: number) => String(x).padStart(2, '0')
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`
}

export interface AppelloRisolto {
  appello: Appello
  ins: Insegnamento
  prenotato: boolean
  giorni: number
}

/** Appelli futuri, i più vicini per primi. */
export function appelliFuturi(s: Stato, limite?: number): AppelloRisolto[] {
  const o = oggi()
  const out: AppelloRisolto[] = []
  for (const a of s.appelli) {
    if (a.data < o) continue
    const ins = insegnamento(s, a.insegnamentoId)
    if (!ins) continue
    const e = esameDi(s, ins.id)
    out.push({
      appello: a, ins,
      prenotato: e.stato === 'prenotato' && e.appelloId === a.id,
      giorni: giorniTra(o, a.data),
    })
  }
  out.sort((a, b) =>
    a.appello.data.localeCompare(b.appello.data) ||
    (a.appello.ora ?? '').localeCompare(b.appello.ora ?? ''))
  return limite ? out.slice(0, limite) : out
}

/** Solo quelli per cui sei effettivamente prenotato. */
export function prenotazioni(s: Stato): AppelloRisolto[] {
  return appelliFuturi(s).filter(a => a.prenotato)
}

/** Appelli passati per cui eri prenotato ma non hai registrato
 *  l'esito: è la cosa che l'app deve ricordarti di chiudere. */
export function daRegistrare(s: Stato): AppelloRisolto[] {
  const o = oggi()
  const out: AppelloRisolto[] = []
  for (const a of s.appelli) {
    if (a.data >= o) continue
    const ins = insegnamento(s, a.insegnamentoId)
    if (!ins) continue
    const e = esameDi(s, ins.id)
    if (e.stato !== 'prenotato' || e.appelloId !== a.id) continue
    out.push({ appello: a, ins, prenotato: true, giorni: giorniTra(o, a.data) })
  }
  return out.sort((x, y) => y.appello.data.localeCompare(x.appello.data))
}

/** Insegnamenti raggruppati per anno, ordinati per semestre e nome. */
export function perAnno(ins: Insegnamento[]): { anno: number; voci: Insegnamento[] }[] {
  const m = new Map<number, Insegnamento[]>()
  for (const i of ins) {
    const a = m.get(i.anno) ?? []
    a.push(i)
    m.set(i.anno, a)
  }
  return Array.from(m.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([anno, voci]) => ({
      anno,
      voci: voci.sort((a, b) =>
        (a.semestre || 3) - (b.semestre || 3) || a.nome.localeCompare(b.nome, 'it')),
    }))
}

export const ORDINE_STATO: Record<Esame['stato'], number> = {
  prenotato: 0, da_sostenere: 1, respinto: 2, superato: 3, idoneo: 4,
}
