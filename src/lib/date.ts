/* ============================================================
   Date — tutto in locale, mai UTC.
   Le date sono stringhe "yyyy-mm-dd": parsarle con new Date(iso)
   le interpreta come UTC e a Roma slittano di un giorno.
   ============================================================ */

export type ISO = string   // yyyy-mm-dd

export function daISO(iso: ISO): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function aISO(d: Date): ISO {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function oggi(): ISO {
  return aISO(new Date())
}

export function addGiorni(iso: ISO, n: number): ISO {
  const d = daISO(iso)
  d.setDate(d.getDate() + n)
  return aISO(d)
}

/** Differenza in giorni di calendario (b − a). */
export function giorniTra(a: ISO, b: ISO): number {
  const ms = daISO(b).getTime() - daISO(a).getTime()
  return Math.round(ms / 86_400_000)
}

/** Giorno ISO della settimana: 1 = lunedì … 7 = domenica */
export function giornoSettimana(iso: ISO): number {
  const g = daISO(iso).getDay()
  return g === 0 ? 7 : g
}

/** Lunedì della settimana che contiene `iso`. */
export function lunediDi(iso: ISO): ISO {
  return addGiorni(iso, -(giornoSettimana(iso) - 1))
}

const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno',
  'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre']
const MESI_BREVI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu',
  'lug', 'ago', 'set', 'ott', 'nov', 'dic']
const GG = ['', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica']

export function fmtData(iso: ISO, stile: 'lungo' | 'medio' | 'breve' | 'giorno' = 'medio'): string {
  const d = daISO(iso)
  const g = d.getDate()
  switch (stile) {
    case 'lungo':  return `${g} ${MESI[d.getMonth()]} ${d.getFullYear()}`
    case 'medio':  return `${g} ${MESI_BREVI[d.getMonth()]} ${d.getFullYear()}`
    case 'breve':  return `${g} ${MESI_BREVI[d.getMonth()]}`
    case 'giorno': return `${GG[giornoSettimana(iso)]} ${g} ${MESI_BREVI[d.getMonth()]}`
  }
}

export function mese(iso: ISO): string {
  return MESI[daISO(iso).getMonth()]
}

export function meseAnno(iso: ISO): string {
  const d = daISO(iso)
  return `${MESI[d.getMonth()]} ${d.getFullYear()}`
}

/** "oggi", "domani", "fra 5 giorni", "3 giorni fa" — il modo in cui
 *  uno pensa davvero a una scadenza. */
export function quando(iso: ISO, rif: ISO = oggi()): string {
  const n = giorniTra(rif, iso)
  if (n === 0) return 'oggi'
  if (n === 1) return 'domani'
  if (n === 2) return 'dopodomani'
  if (n === -1) return 'ieri'
  if (n > 0 && n < 7) return `fra ${n} giorni`
  if (n >= 7 && n < 14) return 'fra una settimana'
  if (n >= 14 && n < 60) return `fra ${Math.round(n / 7)} settimane`
  if (n < 0) return `${Math.abs(n)} giorni fa`
  return fmtData(iso, 'breve')
}

/** Minuti dall'inizio del giorno per "HH:MM". */
export function minuti(ora: string): number {
  const [h, m] = ora.split(':').map(Number)
  return h * 60 + (m || 0)
}

export function oraOra(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function durata(inizio: string, fine: string): string {
  const m = minuti(fine) - minuti(inizio)
  const h = Math.floor(m / 60), r = m % 60
  if (h && r) return `${h}h ${r}m`
  if (h) return `${h}h`
  return `${r}m`
}

/** Anno accademico di una data: da settembre parte quello nuovo.
 *  "2025/26" */
export function annoAccademico(iso: ISO = oggi()): string {
  const d = daISO(iso)
  const y = d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1
  return `${y}/${String((y + 1) % 100).padStart(2, '0')}`
}

/** La sessione d'esami in cui cade una data, con le finestre
 *  tipiche di Sapienza. */
export function sessione(iso: ISO): { nome: string; chiave: string } {
  const m = daISO(iso).getMonth() + 1
  if (m === 1 || m === 2) return { nome: 'Sessione invernale', chiave: 'invernale' }
  if (m >= 5 && m <= 7) return { nome: 'Sessione estiva', chiave: 'estiva' }
  if (m >= 8 && m <= 10) return { nome: 'Sessione autunnale', chiave: 'autunnale' }
  if (m === 3 || m === 4) return { nome: 'Sessione straordinaria', chiave: 'straordinaria' }
  return { nome: 'Sessione invernale', chiave: 'invernale' }
}

/** Il semestre in corso a una certa data (0 = fuori lezione). */
export function semestreCorrente(iso: ISO = oggi()): 1 | 2 | 0 {
  const m = daISO(iso).getMonth() + 1
  if (m >= 9 && m <= 12) return 1
  if (m >= 2 && m <= 6) return 2
  return 0
}

/** Le 7 date della settimana che contiene `iso`. */
export function settimana(iso: ISO): ISO[] {
  const lun = lunediDi(iso)
  return Array.from({ length: 7 }, (_, i) => addGiorni(lun, i))
}

/** Griglia di 6×7 date per il calendario mensile, lunedì primo. */
export function grigliaMese(anno: number, meseIdx: number): ISO[] {
  const primo = new Date(anno, meseIdx, 1)
  const offset = (primo.getDay() === 0 ? 7 : primo.getDay()) - 1
  const start = addGiorni(aISO(primo), -offset)
  return Array.from({ length: 42 }, (_, i) => addGiorni(start, i))
}
