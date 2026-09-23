/* ============================================================
   Calcoli di carriera.
   Una regola sola, applicata ovunque: le idoneità portano CFU
   ma non entrano in media, e la lode vale quanto dice
   impostazioni.valoreLode (a Sapienza di norma 30).
   ============================================================ */

import type { Stato, Insegnamento, Esame, Impostazioni } from './types'
import { giorniTra, oggi, type ISO } from './date'
import { esameDi } from './query'

export interface VoceCarriera {
  ins: Insegnamento
  esame: Esame
}

/** Il voto che entra in media per un esame superato. */
export function votoEffettivo(e: Esame, imp: Impostazioni): number | null {
  if (e.stato !== 'superato' || e.voto == null) return null
  if (e.escludiDaMedia) return null
  return e.lode ? imp.valoreLode : e.voto
}

/** Un esame porta CFU se superato o riconosciuto idoneo. */
export function portaCfu(e: Esame): boolean {
  return e.stato === 'superato' || e.stato === 'idoneo'
}

export interface Riepilogo {
  cfuAcquisiti: number
  cfuTotali: number
  cfuRimanenti: number
  percentuale: number          // 0–1
  esamiSuperati: number
  esamiTotali: number
  esamiRimanenti: number
  mediaAritmetica: number | null
  mediaPonderata: number | null
  votoPartenza: number | null   // base 110
  proiezioneLaurea: number | null
  lodi: number
  votoMax: number | null
  votoMin: number | null
  /** CFU che contano in media (esclude idoneità e convalide) */
  cfuInMedia: number
}

export function riepilogo(s: Stato): Riepilogo {
  const imp = s.impostazioni
  let cfuAcquisiti = 0, esamiSuperati = 0, lodi = 0
  let sommaPesata = 0, cfuInMedia = 0
  let sommaSemplice = 0, contaSemplice = 0
  let votoMax: number | null = null, votoMin: number | null = null

  for (const ins of s.insegnamenti) {
    const e = esameDi(s, ins.id)
    if (portaCfu(e)) {
      cfuAcquisiti += ins.cfu
      esamiSuperati++
    }
    const v = votoEffettivo(e, imp)
    if (v != null) {
      sommaPesata += v * ins.cfu
      cfuInMedia += ins.cfu
      sommaSemplice += v
      contaSemplice++
      if (e.lode) lodi++
      const grezzo = e.voto!
      votoMax = votoMax == null ? grezzo : Math.max(votoMax, grezzo)
      votoMin = votoMin == null ? grezzo : Math.min(votoMin, grezzo)
    }
  }

  const mediaPonderata = cfuInMedia > 0 ? sommaPesata / cfuInMedia : null
  const mediaAritmetica = contaSemplice > 0 ? sommaSemplice / contaSemplice : null
  const votoPartenza = mediaPonderata != null ? (mediaPonderata * 110) / 30 : null
  const cfuTotali = s.profilo.cfuTotali

  return {
    cfuAcquisiti,
    cfuTotali,
    cfuRimanenti: Math.max(0, cfuTotali - cfuAcquisiti),
    percentuale: cfuTotali > 0 ? Math.min(1, cfuAcquisiti / cfuTotali) : 0,
    esamiSuperati,
    esamiTotali: s.insegnamenti.length,
    esamiRimanenti: Math.max(0, s.insegnamenti.length - esamiSuperati),
    mediaAritmetica,
    mediaPonderata,
    votoPartenza,
    proiezioneLaurea:
      votoPartenza != null ? Math.min(110, votoPartenza + imp.puntiTesi) : null,
    lodi,
    votoMax,
    votoMin,
    cfuInMedia,
  }
}

/* ---------------- Andamento nel tempo ---------------- */

export interface PuntoAndamento {
  data: ISO
  media: number       // ponderata cumulativa dopo questo esame
  voto: number
  cfu: number
  nome: string
  lode: boolean
}

/** Media ponderata ricalcolata dopo ogni esame, in ordine di data.
 *  È il grafico che dice se stai salendo o scendendo. */
export function andamento(s: Stato): PuntoAndamento[] {
  const voci: { data: ISO; voto: number; cfu: number; nome: string; lode: boolean }[] = []
  for (const ins of s.insegnamenti) {
    const e = esameDi(s, ins.id)
    const v = votoEffettivo(e, s.impostazioni)
    if (v == null || !e.data) continue
    voci.push({ data: e.data, voto: v, cfu: ins.cfu, nome: ins.nome, lode: !!e.lode })
  }
  voci.sort((a, b) => a.data.localeCompare(b.data))

  let pesata = 0, crediti = 0
  return voci.map(v => {
    pesata += v.voto * v.cfu
    crediti += v.cfu
    return { ...v, media: pesata / crediti }
  })
}

/* ---------------- Distribuzione ---------------- */

export function distribuzione(s: Stato): { voto: number; conta: number }[] {
  const mappa = new Map<number, number>()
  for (const ins of s.insegnamenti) {
    const e = esameDi(s, ins.id)
    if (e.stato !== 'superato' || e.voto == null || e.escludiDaMedia) continue
    mappa.set(e.voto, (mappa.get(e.voto) ?? 0) + 1)
  }
  return Array.from({ length: 13 }, (_, i) => 18 + i)
    .map(voto => ({ voto, conta: mappa.get(voto) ?? 0 }))
}

/* ---------------- CFU per anno di corso ---------------- */

export function cfuPerAnno(s: Stato): { anno: number; fatti: number; totali: number }[] {
  const mappa = new Map<number, { fatti: number; totali: number }>()
  for (const ins of s.insegnamenti) {
    const r = mappa.get(ins.anno) ?? { fatti: 0, totali: 0 }
    r.totali += ins.cfu
    const e = esameDi(s, ins.id)
    if (portaCfu(e)) r.fatti += ins.cfu
    mappa.set(ins.anno, r)
  }
  return Array.from(mappa.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([anno, r]) => ({ anno, ...r }))
}

/* ---------------- Simulatore ---------------- */

/** Che media servirebbe sui CFU restanti per chiudere a `obiettivo`.
 *  Restituisce null se non ci sono CFU restanti che contano. */
export function mediaNecessaria(s: Stato, obiettivo: number): number | null {
  const r = riepilogo(s)
  const restanti = cfuResiduiInMedia(s)
  if (restanti <= 0) return null
  const pesataAttuale = (r.mediaPonderata ?? 0) * r.cfuInMedia
  return (obiettivo * (r.cfuInMedia + restanti) - pesataAttuale) / restanti
}

/** CFU non ancora sostenuti che finiranno in media (esclude
 *  idoneità, tirocinio e prova finale: non hanno voto). */
export function cfuResiduiInMedia(s: Stato): number {
  let n = 0
  for (const ins of s.insegnamenti) {
    if (ins.tipo === 'tirocinio' || ins.tipo === 'prova_finale' || ins.tipo === 'lingua' || ins.tipo === 'idoneita') continue
    const e = esameDi(s, ins.id)
    if (e.stato === 'superato' || e.stato === 'idoneo') continue
    n += ins.cfu
  }
  return n
}

/** Come si muove la media se prendi `voto` in un esame da `cfu`.
 *  Serve a rispondere alla domanda vera: "mi conviene rifiutarlo?" */
export function impatto(s: Stato, cfu: number, voto: number): {
  nuova: number
  delta: number
} {
  const r = riepilogo(s)
  const attuale = r.mediaPonderata ?? 0
  const pesata = attuale * r.cfuInMedia + voto * cfu
  const nuova = pesata / (r.cfuInMedia + cfu)
  return { nuova, delta: nuova - attuale }
}

/** Voto in centodecimi a partire da una media in trentesimi. */
export function inCentodecimi(media: number): number {
  return (media * 110) / 30
}

/* ---------------- Ritmo e previsione ---------------- */

export interface Ritmo {
  cfuPerMese: number | null
  meseStimatoFine: string | null
  inPari: boolean | null
  /** CFU che *dovresti* avere a questo punto del percorso */
  cfuAttesi: number
}

/** Confronta i CFU fatti con quelli attesi secondo il piano
 *  (60 CFU per anno accademico dall'immatricolazione). */
export function ritmo(s: Stato): Ritmo {
  const r = riepilogo(s)
  const inizio: ISO = `${s.profilo.immatricolazione}-10-01`
  const mesiTrascorsi = Math.max(1, giorniTra(inizio, oggi()) / 30.44)
  const cfuPerMese = r.cfuAcquisiti > 0 ? r.cfuAcquisiti / mesiTrascorsi : null

  // 60 CFU l'anno è il passo nominale; l'anno accademico dura 12 mesi
  const cfuAttesi = Math.min(r.cfuTotali, Math.round((mesiTrascorsi / 12) * 60))

  let meseStimatoFine: string | null = null
  if (cfuPerMese && cfuPerMese > 0 && r.cfuRimanenti > 0) {
    const mesi = r.cfuRimanenti / cfuPerMese
    const d = new Date()
    d.setMonth(d.getMonth() + Math.round(mesi))
    meseStimatoFine = d.toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })
  }

  return {
    cfuPerMese,
    meseStimatoFine,
    inPari: r.cfuAcquisiti >= cfuAttesi,
    cfuAttesi,
  }
}

/* ---------------- Formattazione ---------------- */

export function fmtMedia(n: number | null, dec = 2): string {
  return n == null ? '—' : n.toFixed(dec).replace('.', ',')
}

export function fmtVoto(e: Esame | undefined): string {
  if (!e) return '—'
  if (e.stato === 'idoneo') return 'ID'
  if (e.voto == null) return '—'
  return e.lode ? '30L' : String(e.voto)
}

export function fmt110(n: number | null): string {
  return n == null ? '—' : Math.round(n).toString()
}
