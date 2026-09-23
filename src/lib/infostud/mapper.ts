/* ============================================================
   Dalle risposte di Infostud ai modelli dell'app.

   Le forme vengono da due fonti: la busta l'abbiamo vista sulle
   risposte vere; i campi di un esame e di una prenotazione vengono
   da ioStudKit e openstud_driver, che non concordano su tutto (cfu
   intero o decimale, annoAcca numero o stringa). Vedi
   docs/INFOSTUD.md, «Cosa sappiamo già».

   Due regole:
   - si accettano le varianti note, e basta;
   - davanti a qualcosa che non torna si lancia FormatoCambiato e
     non si tocca niente: meglio una sincronizzazione mancata che un
     voto letto male.
   ============================================================ */

import type { PrenotazioneUfficiale, RecordUfficiale } from '../types'

/** La risposta non ha la forma attesa: Infostud è cambiato. */
export class FormatoCambiato extends Error {
  constructor(dove: string) {
    super(`Formato di Infostud non riconosciuto: ${dove}`)
    this.name = 'FormatoCambiato'
  }
}

/** Infostud ha risposto, ma dicendo che qualcosa è andato storto. */
export class EsitoNegativo extends Error {
  constructor(readonly nota: string) {
    super(nota || 'Infostud ha risposto con un errore')
    this.name = 'EsitoNegativo'
  }
}

type Grezzo = Record<string, unknown>
const oggetto = (x: unknown): x is Grezzo => !!x && typeof x === 'object' && !Array.isArray(x)

/** Apre la busta comune { esito, ritorno } e restituisce l'elenco che
 *  sta sotto `ritorno[chiave]`. `null` e `[]` valgono uguale: la stessa
 *  risposta li usa entrambi per dire «niente». */
export function apriBusta(x: unknown, chiave: string): unknown[] {
  if (!oggetto(x)) throw new FormatoCambiato('risposta vuota o non JSON')
  const esito = x.esito
  if (!oggetto(esito) || typeof esito.flagEsito !== 'number') throw new FormatoCambiato('manca esito.flagEsito')
  // Che 0 sia il successo lo dice il fatto che le risposte riuscite
  // lo portano («Prenotazioni recuperate con successo»); un errore vero
  // non l'abbiamo ancora visto.
  if (esito.flagEsito !== 0) throw new EsitoNegativo(typeof esito.nota === 'string' ? esito.nota : '')
  const ritorno = x.ritorno
  if (!oggetto(ritorno)) throw new FormatoCambiato('manca ritorno')
  const v = ritorno[chiave]
  if (v == null) return []
  if (!Array.isArray(v)) throw new FormatoCambiato(`ritorno.${chiave} non è un elenco`)
  return v
}

/* ---------------- Campi ---------------- */

function testo(r: Grezzo, k: string, obbligatorio = true): string | undefined {
  const v = r[k]
  if (typeof v === 'string' && v.trim()) return v.trim()
  if (typeof v === 'number') return String(v)
  if (obbligatorio) throw new FormatoCambiato(`campo «${k}» mancante`)
  return undefined
}

/** cfu: 6 per openstud, 6.0 per ioStudKit, magari «6» come testo. */
function numero(r: Grezzo, k: string): number {
  const v = r[k]
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(',', '.')) : NaN
  if (!Number.isFinite(n)) throw new FormatoCambiato(`campo «${k}» non numerico`)
  return n
}

/** «20/01/2027» → «2027-01-20». Vuota o null: nessuna data. Una data
 *  scritta in un altro modo è un formato che non conosciamo. */
export function dataInfostud(v: unknown): string | undefined {
  if (v == null || v === '') return undefined
  if (typeof v !== 'string') throw new FormatoCambiato('data non testuale')
  const s = v.trim()
  const it = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s)
  if (it) return `${it[3]}-${it[2].padStart(2, '0')}-${it[1].padStart(2, '0')}`
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10)
  throw new FormatoCambiato(`data «${s}» in un formato sconosciuto`)
}

/* ---------------- Esami ---------------- */

/**
 * Un esame di `esamiall`. Restituisce null se Infostud dice
 * esplicitamente che non è superato (campo di openstud).
 *
 * Il voto: `valoreNonNominale` è il numero, `null` per le idoneità
 * (lo dichiara ioStudKit). Come si scriva la lode nessuna fonte lo
 * dice. Si riconosce solo la parola «lode» nel testo del voto; un
 * numero fuori da 18-30 non si interpreta (potrebbe essere la lode
 * scritta come 31, o altro): il record passa con il testo originale
 * e senza voto, e l'app chiede di controllare.
 * TODO: verificare sul primo 30 e lode vero.
 */
export function mappaEsame(x: unknown, fetchedAt: string): RecordUfficiale | null {
  if (!oggetto(x)) throw new FormatoCambiato('esame non è un oggetto')
  if (x.superamento === false) return null

  const esito = x.esito
  if (!oggetto(esito)) throw new FormatoCambiato('esame senza esito')
  const valore = esito.valoreNonNominale
  const nominale = typeof esito.valoreNominale === 'string' ? esito.valoreNominale.trim() : ''

  const base = {
    codice: testo(x, 'codiceInsegnamento')!,
    nome: testo(x, 'descrizione')!,
    cfu: numero(x, 'cfu'),
    data: dataInfostud(x.data),
    annoAccademico: testo(x, 'annoAcca', false),
    fetchedAt,
  }

  if (valore == null) {
    return { ...base, idoneita: true, lode: false, votoTesto: nominale || undefined }
  }
  if (typeof valore !== 'number') throw new FormatoCambiato('voto non numerico')
  if (Number.isInteger(valore) && valore >= 18 && valore <= 30) {
    return { ...base, idoneita: false, voto: valore, lode: /\blode\b/i.test(nominale) }
  }
  return { ...base, idoneita: false, lode: false, votoTesto: nominale || String(valore) }
}

export function mappaEsami(risposta: unknown, fetchedAt: string): RecordUfficiale[] {
  return apriBusta(risposta, 'esami')
    .map(e => mappaEsame(e, fetchedAt))
    .filter((e): e is RecordUfficiale => e !== null)
}

/* ---------------- Prenotazioni ---------------- */

/** Una prenotazione di `prenotazioni`. I campi sono quelli di
 *  ioStudKit; il nome è l'unico che serve davvero. */
export function mappaPrenotazione(x: unknown, fetchedAt: string): PrenotazioneUfficiale {
  if (!oggetto(x)) throw new FormatoCambiato('prenotazione non è un oggetto')
  const numeroGrezzo = x.numeroPrenotazione
  return {
    nome: testo(x, 'descrizione')!,
    data: dataInfostud(x.dataAppe),
    docente: testo(x, 'docente', false),
    numero: typeof numeroGrezzo === 'number' ? numeroGrezzo : undefined,
    fetchedAt,
  }
}

export function mappaPrenotazioni(risposta: unknown, fetchedAt: string): PrenotazioneUfficiale[] {
  return apriBusta(risposta, 'appelli').map(p => mappaPrenotazione(p, fetchedAt))
}
