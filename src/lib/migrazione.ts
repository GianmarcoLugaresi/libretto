/* ============================================================
   Migrazione dello schema locale.

   Vale una regola sola: nessun dato dello studente va perso.
   Un voto registrato a mano tre mesi fa deve sopravvivere a
   qualunque cambio di struttura; se qualcosa non si capisce, si
   conserva invece di buttarlo.

   v1 → v2: gli insegnamenti avevano id casuali, nati all'onboarding.
   In v2 l'id è derivato dal dato (vedi chiavi.ts), così il catalogo
   può aggiornare il piano e gli esami di Infostud trovano dove
   agganciarsi. La migrazione riscrive gli id e tutti i riferimenti.
   ============================================================ */

import type { Carriera, StatoSync } from './deposito'
import { VERSIONE_SCHEMA } from './deposito'
import type { Appello, Esame, Impostazioni, Insegnamento, Lezione, Profilo } from './types'
import { chiaveDaPiano, chiaveManuale } from './chiavi'
import { statoIniziale } from './seed'

export interface EsitoMigrazione {
  carriera: Carriera
  /** Quante versioni ha attraversato: 0 se era già aggiornata */
  passaggi: number
  /** Cose da far sapere: id rimappati, voci recuperate a fatica */
  note: string[]
}

/** Porta qualunque cosa trovata su disco allo schema corrente. */
export function migra(grezzo: unknown, casuale: () => string): EsitoMigrazione {
  const note: string[] = []
  let passaggi = 0

  if (!grezzo || typeof grezzo !== 'object' || Array.isArray(grezzo)) {
    return { carriera: carrieraVuota(), passaggi: 0, note: ['Nessun dato precedente: si parte puliti.'] }
  }
  let d = grezzo as Record<string, unknown>
  const versione = typeof d.versione === 'number' ? d.versione : 1

  if (versione < 2) {
    d = da1a2(d, casuale, note) as unknown as Record<string, unknown>
    passaggi++
  }

  return { carriera: completa(d, note), passaggi, note }
}

/* ---------------- v1 → v2 ---------------- */

function da1a2(v1: Record<string, unknown>, casuale: () => string, note: string[]): Record<string, unknown> {
  const insegnamenti = Array.isArray(v1.insegnamenti) ? (v1.insegnamenti as Insegnamento[]) : []
  const esami = (v1.esami ?? {}) as Record<string, Esame>
  const appelli = Array.isArray(v1.appelli) ? (v1.appelli as Appello[]) : []
  const lezioni = Array.isArray(v1.lezioni) ? (v1.lezioni as Lezione[]) : []
  const profilo = (v1.profilo ?? {}) as Partial<Profilo>
  const corsoId = typeof profilo.catalogoId === 'string' ? profilo.catalogoId : null

  // Vecchio id casuale → nuova chiave stabile.
  const mappa = new Map<string, string>()
  const usate = new Set<string>()

  for (const ins of insegnamenti) {
    if (!ins || typeof ins.id !== 'string' || typeof ins.nome !== 'string') continue
    const nome = ins.nome
    // Con un corso del catalogo la chiave viene dal piano: da lì in
    // poi gli aggiornamenti pubblici sanno dove atterrare. Senza,
    // resta un inserimento personale e il catalogo non lo tocca.
    let nuova = corsoId && nome ? chiaveDaPiano(corsoId, nome) : chiaveManuale(nome || 'esame', casuale)
    if (usate.has(nuova)) {
      // Due voci con lo stesso nome: la seconda resta personale,
      // invece di fondersi con la prima e perdere un voto.
      nuova = chiaveManuale(nome || 'esame', casuale)
      note.push(`«${nome}» compare più volte: la copia in più è stata tenuta come voce personale.`)
    }
    usate.add(nuova)
    mappa.set(ins.id, nuova)
  }

  const rimappa = (id: unknown): string | null =>
    (typeof id === 'string' ? mappa.get(id) ?? null : null)

  const leggibili = insegnamenti.filter(i => i && typeof i.id === 'string' && typeof i.nome === 'string')
  if (leggibili.length !== insegnamenti.length) {
    note.push(`${insegnamenti.length - leggibili.length} insegnamenti illeggibili sono stati scartati.`)
  }
  const nuoviInsegnamenti = leggibili.map(i => ({ ...i, id: mappa.get(i.id)! }))

  const nuoviEsami: Record<string, Esame> = {}
  let orfani = 0
  for (const [vecchioId, esame] of Object.entries(esami)) {
    const nuovo = rimappa(vecchioId)
    if (!nuovo) { orfani++; continue }
    nuoviEsami[nuovo] = { ...esame, insegnamentoId: nuovo }
  }
  if (orfani) note.push(`${orfani} esami erano legati a insegnamenti non più nel piano e sono stati lasciati fuori.`)

  const nuoviAppelli = appelli
    .map(a => { const n = rimappa(a?.insegnamentoId); return n ? { ...a, insegnamentoId: n } : null })
    .filter((a): a is Appello => a !== null)

  const nuoveLezioni = lezioni
    .map(l => { const n = rimappa(l?.insegnamentoId); return n ? { ...l, insegnamentoId: n } : null })
    .filter((l): l is Lezione => l !== null)

  if (mappa.size) note.push(`${mappa.size} insegnamenti hanno ora una chiave stabile.`)

  return {
    ...v1,
    versione: 2,
    insegnamenti: nuoviInsegnamenti,
    esami: nuoviEsami,
    appelli: nuoviAppelli,
    lezioni: nuoveLezioni,
    sync: (v1.sync as StatoSync) ?? {},
  }
}

/* ---------------- Completamento e difese ---------------- */

export function carrieraVuota(): Carriera {
  return { ...statoIniziale(), versione: VERSIONE_SCHEMA }
}

/** Riempie i campi mancanti e scarta quelli irrecuperabili, senza
 *  mai cancellare in silenzio ciò che si può salvare. */
function completa(d: Record<string, unknown>, note: string[]): Carriera {
  const vuota = carrieraVuota()
  const insegnamenti = Array.isArray(d.insegnamenti)
    ? (d.insegnamenti as Insegnamento[]).filter(i => i && typeof i.id === 'string' && typeof i.nome === 'string')
    : []
  if (Array.isArray(d.insegnamenti) && insegnamenti.length !== d.insegnamenti.length) {
    note.push(`${d.insegnamenti.length - insegnamenti.length} insegnamenti illeggibili sono stati scartati.`)
  }
  const noti = new Set(insegnamenti.map(i => i.id))

  const esami: Record<string, Esame> = {}
  for (const [k, v] of Object.entries((d.esami ?? {}) as Record<string, Esame>)) {
    if (v && noti.has(k)) esami[k] = { ...v, insegnamentoId: k }
  }

  return {
    versione: VERSIONE_SCHEMA,
    profilo: { ...vuota.profilo, ...(d.profilo as Profilo | undefined) },
    impostazioni: { ...vuota.impostazioni, ...(d.impostazioni as Impostazioni | undefined) },
    insegnamenti,
    esami,
    appelli: (Array.isArray(d.appelli) ? (d.appelli as Appello[]) : []).filter(a => a && noti.has(a.insegnamentoId)),
    lezioni: (Array.isArray(d.lezioni) ? (d.lezioni as Lezione[]) : []).filter(l => l && noti.has(l.insegnamentoId)),
    sync: (d.sync as StatoSync) ?? {},
    onboarding: d.onboarding === true,
  }
}
