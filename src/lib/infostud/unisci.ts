/* ============================================================
   Merge della sincronizzazione Infostud.

   Regole (PROMPT_MYSAPIENZA.md, «Regole di merge»):
   - si scrive solo nell'area `infostud`: esami, voti, note, appelli e
     prenotazioni scritti a mano non si toccano;
   - un esame ufficiale si aggancia al libretto per codice (con gli
     alias), poi per nome e CFU; se resta ambiguo non si sceglie, lo
     collega lo studente;
   - un esame ufficiale che Infostud non elenca più non si cancella: si
     segna «non più presente» e decide lo studente.
   Una sincronizzazione ripetuta con gli stessi dati non cambia niente.
   ============================================================ */

import { abbina, normalizza } from '../chiavi'
import type { PrenotazioneUfficiale, RecordUfficiale, Stato, StatoInfostud } from '../types'

export interface Riepilogo {
  /** Nomi degli esami ufficiali comparsi per la prima volta */
  nuovi: string[]
  /** Nomi di quelli che hanno cambiato voto, data o CFU */
  aggiornati: string[]
  invariati: number
  /** Esami ufficiali da collegare a mano */
  daCollegare: number
  /** Nomi di quelli che Infostud non elenca più */
  nonPiuPresenti: string[]
  prenotazioni: number
}

/** Stessi dati, a parte il momento in cui li abbiamo presi. */
function uguali(a: RecordUfficiale, b: RecordUfficiale): boolean {
  const { fetchedAt: _a, nonPiuPresente: _na, ...x } = a
  const { fetchedAt: _b, nonPiuPresente: _nb, ...y } = b
  return JSON.stringify(x, Object.keys(x).sort()) === JSON.stringify(y, Object.keys(y).sort())
}

export function unisci(
  s: Stato,
  esami: RecordUfficiale[],
  prenotazioni: PrenotazioneUfficiale[],
  alias: Record<string, string> = {},
): { stato: Stato; riepilogo: Riepilogo } {
  const canonico = (c: string) => alias[c] ?? c
  const prima = s.infostud
  const voci = s.insegnamenti.map(i => ({ chiave: i.id, nome: i.nome, cfu: i.cfu, codice: i.codice }))

  // Dove stava già ogni codice: un collegamento fatto una volta (anche
  // a mano) resta, senza rifare l'abbinamento a ogni sincronizzazione.
  const dovEra = new Map<string, string>()
  for (const [id, r] of Object.entries(prima.esami)) dovEra.set(canonico(r.codice), id)
  const esiste = new Set(s.insegnamenti.map(i => i.id))

  const nuoviEsami: StatoInfostud['esami'] = {}
  const daCollegare: StatoInfostud['daCollegare'] = []
  const r: Riepilogo = { nuovi: [], aggiornati: [], invariati: 0, daCollegare: 0, nonPiuPresenti: [], prenotazioni: 0 }

  for (const rec of esami) {
    let id = dovEra.get(canonico(rec.codice))
    if (!id || !esiste.has(id)) {
      const a = abbina({ nome: rec.nome, cfu: rec.cfu, codice: rec.codice }, voci, alias)
      if (a.esito === 'codice') id = a.voce.chiave
      // Per nome serve che tornino anche i CFU: un omonimo con CFU
      // diversi non è lo stesso esame.
      else if (a.esito === 'nome_cfu' && a.voce.cfu === rec.cfu) id = a.voce.chiave
      else {
        daCollegare.push({ record: rec, candidati: a.esito === 'ambiguo' ? a.candidati.map(c => c.chiave) : [] })
        continue
      }
    }
    // Due esami ufficiali sullo stesso insegnamento: il secondo non
    // sovrascrive il primo, si collega a mano.
    if (nuoviEsami[id]) { daCollegare.push({ record: rec, candidati: [id] }); continue }

    const vecchio = prima.esami[id]
    nuoviEsami[id] = rec
    if (!vecchio) r.nuovi.push(rec.nome)
    else if (!uguali(vecchio, rec)) r.aggiornati.push(rec.nome)
    else r.invariati++
  }

  // Chi c'era e ora manca resta, segnato: non si cancella da solo.
  for (const [id, vecchio] of Object.entries(prima.esami)) {
    if (nuoviEsami[id] || !esiste.has(id)) continue
    if (!vecchio.nonPiuPresente) r.nonPiuPresenti.push(vecchio.nome)
    nuoviEsami[id] = { ...vecchio, nonPiuPresente: true }
  }

  // Le prenotazioni sono una fotografia: si sostituiscono. Si aggancia
  // l'insegnamento solo per nome esatto, ed è solo un'indicazione.
  const perNome = new Map<string, string[]>()
  for (const i of s.insegnamenti) {
    const k = normalizza(i.nome)
    perNome.set(k, [...(perNome.get(k) ?? []), i.id])
  }
  const nuovePrenotazioni = prenotazioni.map(p => {
    const trovati = perNome.get(normalizza(p.nome)) ?? []
    return trovati.length === 1 ? { ...p, insegnamentoId: trovati[0] } : p
  })

  r.daCollegare = daCollegare.length
  r.prenotazioni = nuovePrenotazioni.length
  return {
    stato: { ...s, infostud: { esami: nuoviEsami, daCollegare, prenotazioni: nuovePrenotazioni } },
    riepilogo: r,
  }
}

/** Lo studente collega a mano un esame ufficiale a un insegnamento. */
export function collega(s: Stato, codice: string, insegnamentoId: string): Stato {
  const i = s.infostud.daCollegare.findIndex(x => x.record.codice === codice)
  if (i < 0 || s.infostud.esami[insegnamentoId]) return s
  const { record } = s.infostud.daCollegare[i]
  return {
    ...s,
    infostud: {
      ...s.infostud,
      esami: { ...s.infostud.esami, [insegnamentoId]: record },
      daCollegare: s.infostud.daCollegare.filter((_, n) => n !== i),
    },
  }
}

/** Lo studente decide di togliere un esame che Infostud non elenca
 *  più. Resta solo quello che aveva scritto a mano, se c'era. */
export function togliUfficiale(s: Stato, insegnamentoId: string): Stato {
  const esami = { ...s.infostud.esami }
  delete esami[insegnamentoId]
  return { ...s, infostud: { ...s.infostud, esami } }
}

export function testoRiepilogo(r: Riepilogo): string {
  const parti: string[] = []
  const n = (k: number, uno: string, tanti: string) => `${k} ${k === 1 ? uno : tanti}`
  if (r.nuovi.length) parti.push(n(r.nuovi.length, 'nuovo esame', 'nuovi esami'))
  if (r.aggiornati.length) parti.push(n(r.aggiornati.length, 'esame aggiornato', 'esami aggiornati'))
  if (r.daCollegare) parti.push(n(r.daCollegare, 'da collegare', 'da collegare'))
  if (r.nonPiuPresenti.length) parti.push(n(r.nonPiuPresenti.length, 'non più su Infostud', 'non più su Infostud'))
  if (r.prenotazioni) parti.push(n(r.prenotazioni, 'prenotazione', 'prenotazioni'))
  return parti.length ? parti.join(', ') : 'Nessuna novità'
}
