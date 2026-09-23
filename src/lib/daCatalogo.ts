/* ============================================================
   Dal catalogo al libretto.

   Il catalogo parla la lingua della pipeline (codici, moduli,
   gruppi opzionali, nomi in maiuscolo); il libretto quella dell'app.
   Qui si traduce, e basta: niente di quello che la fonte non dice
   viene aggiunto.
   ============================================================ */

import { appelliDellaCoorte, type Appelli, type Orario, type Piano } from './dati'
import type { OrarioUfficiale, SlotOrario, VarianteOrario } from './catalogo'
import { abbina, chiaveDaCodice, chiaveManuale, eProvvisoria, normalizza } from './chiavi'
import {
  TINTE, type AnnoCorso, type Appello, type Esame, type Giorno, type Insegnamento, type Lezione, type Semestre,
  type Stato, type TipoCorsoLaurea, type TipoInsegnamento,
} from './types'

type InsegnamentoCatalogo = Piano['insegnamenti'][number]

/* ---------------- Nomi ---------------- */

const ROMANI = /^(i|ii|iii|iv|v|vi|vii|viii|ix|x)$/i

/** Il catalogo scrive i nomi in maiuscolo, con l'apostrofo al posto
 *  dell'accento («SOSTENIBILITA'»). Nel libretto diventano frasi:
 *  prima lettera maiuscola, numeri romani finali in maiuscolo, accenti
 *  sulle vocali finali dove c'era l'apostrofo. La «e'» resta com'è:
 *  potrebbe essere «è» o «é», e non si sceglie a caso. */
export function nomeLeggibile(nome: string): string {
  const pulito = nome.trim().replace(/\s+/g, ' ')
  // Già scritto a mano con le minuscole: si rispetta com'è.
  if (pulito !== pulito.toUpperCase()) return pulito
  const accenti: Record<string, string> = { a: 'à', i: 'ì', o: 'ò', u: 'ù' }
  const parole = pulito.toLowerCase()
    .replace(/([aiou])'(?=\s|$|[),.;:/])/g, (_, v: string) => accenti[v])
    .split(' ')
  const ultima = parole.length - 1
  if (ultima > 0 && ROMANI.test(parole[ultima])) parole[ultima] = parole[ultima].toUpperCase()
  const frase = parole.join(' ')
  return frase.charAt(0).toUpperCase() + frase.slice(1)
}

/* ---------------- Insegnamenti ---------------- */

/** Il tipo nel libretto. Solo ciò che il catalogo dichiara: un
 *  gruppo opzionale è una scelta, un'attività senza voto è
 *  un'idoneità, e il nome dice se è la prova finale o un tirocinio.
 *  Base, caratterizzante o affine il catalogo non lo dice: tutto
 *  ciò che non sta in un gruppo è obbligatorio, e basta. */
export function tipoDa(ins: InsegnamentoCatalogo): TipoInsegnamento {
  if (ins.gruppo || ins.tipo === 'other') return 'a_scelta'
  if (ins.tipo === 'pass_fail') {
    if (/prova finale/i.test(ins.nome)) return 'prova_finale'
    if (/tirocini/i.test(ins.nome)) return 'tirocinio'
    if (/^lingua\b/i.test(ins.nome)) return 'lingua'
    return 'idoneita'
  }
  return 'obbligatorio'
}

export function insegnamentoDaCatalogo(ins: InsegnamentoCatalogo, tinta: number): Insegnamento {
  return {
    id: chiaveDaCodice(ins.codice),
    codice: ins.codice,
    nome: nomeLeggibile(ins.nome),
    cfu: ins.cfu,
    anno: Math.min(6, Math.max(1, ins.anno)) as AnnoCorso,
    semestre: ins.semestre as Semestre,
    tipo: tipoDa(ins),
    ssd: ins.ssd,
    tinta: tinta % TINTE.length,
  }
}

/** Gli insegnamenti da mettere nel libretto all'inizio: tutti quelli
 *  fuori dai gruppi opzionali. Dentro un gruppo lo studente sceglie
 *  (Design: uno fra tre laboratori), e aggiungerli tutti gonfierebbe
 *  i CFU del piano. */
export function insegnamentiIniziali(piano: Piano, tintaDa = 0): Insegnamento[] {
  return piano.insegnamenti
    .filter(i => !i.gruppo)
    .map((i, n) => insegnamentoDaCatalogo(i, tintaDa + n))
}

/** CFU che un gruppo opzionale porta davvero. Di solito quelli che
 *  dichiara; ma se dichiara meno di quanto vale il suo esame più
 *  piccolo (Design 2024: «6 CFU» fra esami da 12), scegliendone uno
 *  se ne prendono comunque 12. Il dato della fonte resta com'è: cambia
 *  solo il conto. */
export function cfuDelGruppo(piano: Piano, g: Piano['gruppi'][number]): number {
  const opzioni = piano.insegnamenti.filter(i => i.gruppo === g.nome).map(i => i.cfu)
  const minimo = opzioni.length ? Math.min(...opzioni) : 0
  return Math.max(g.cfuRichiesti ?? 0, minimo)
}

/** CFU per laurearsi secondo il piano: gli insegnamenti fuori dai
 *  gruppi, più ciò che porta ogni gruppo (una scelta, non tutte). */
export function cfuDelPiano(piano: Piano): number {
  const fuori = piano.insegnamenti.filter(i => !i.gruppo).reduce((n, i) => n + i.cfu, 0)
  return fuori + piano.gruppi.reduce((n, g) => n + cfuDelGruppo(piano, g), 0)
}

export function anniDelPiano(piano: Piano): number {
  return Math.max(1, ...piano.insegnamenti.map(i => i.anno))
}

/** Triennale, magistrale o ciclo unico, da ciò che si sa: la classe
 *  L- è una triennale; un piano di cinque o sei anni è a ciclo unico
 *  (Medicina è LM-41, ma dura sei anni). */
export function tipoCorso(classe: string | undefined, anni: number): TipoCorsoLaurea {
  if (anni >= 5) return 'ciclo_unico'
  if (classe && /^L-/i.test(classe)) return 'triennale'
  if (classe && /^LM/i.test(classe)) return 'magistrale'
  return anni <= 2 ? 'magistrale' : 'triennale'
}

/** I CFU totali: quelli del piano se tornano, altrimenti il valore
 *  tipico del tipo di corso. Un piano che somma 40 CFU è un piano
 *  letto male o incompleto, non una laurea da 40. */
export function cfuTotali(piano: Piano | undefined, tipo: TipoCorsoLaurea, anni: number): number {
  const dalPiano = piano ? cfuDelPiano(piano) : 0
  if (dalPiano >= 60 && dalPiano <= 400) return dalPiano
  if (tipo === 'triennale') return 180
  if (tipo === 'magistrale') return 120
  return anni >= 6 ? 360 : 300
}

/* ---------------- Ricollegare un libretto al catalogo ---------------- */

export interface Ricollegamento {
  stato: Stato
  /** Insegnamenti che ora hanno il codice ufficiale */
  collegati: number
  /** Chiavi provvisorie senza corrispondenza: diventano personali */
  personali: string[]
  /** Più candidati possibili: restano com'erano, e lo si dice */
  ambigui: string[]
}

/** Aggancia gli insegnamenti nati dal vecchio piano statico
 *  (chiavi `piano:`) al piano vero della pipeline, per nome e CFU.
 *  Chi trova il suo codice diventa `cat:`; chi non lo trova resta
 *  com'è ma diventa personale (`man:`), così un aggiornamento del
 *  catalogo non lo tocca. Voti, note, appelli e lezioni seguono la
 *  chiave nuova: niente si perde. */
export function ricollega(s: Stato, piano: Piano, casuale: () => string): Ricollegamento {
  const voci = piano.insegnamenti.map(i => ({
    chiave: chiaveDaCodice(i.codice), nome: i.nome, cfu: i.cfu, codice: i.codice,
  }))
  const mappa = new Map<string, { id: string; codice?: string }>()
  const usate = new Set(s.insegnamenti.filter(i => !eProvvisoria(i.id)).map(i => i.id))
  const personali: string[] = []
  const ambigui: string[] = []
  let collegati = 0

  for (const ins of s.insegnamenti) {
    if (!eProvvisoria(ins.id)) continue
    const r = abbina({ nome: ins.nome, cfu: ins.cfu }, voci)
    if (r.esito === 'ambiguo') { ambigui.push(ins.nome); continue }
    if ((r.esito === 'nome_cfu' || r.esito === 'codice') && r.voce.cfu === ins.cfu && !usate.has(r.voce.chiave)) {
      mappa.set(ins.id, { id: r.voce.chiave, codice: r.voce.codice })
      usate.add(r.voce.chiave)
      collegati++
      continue
    }
    // Nessuna corrispondenza (o CFU diversi, o codice già preso):
    // l'insegnamento resta, ma come voce personale.
    const id = chiaveManuale(ins.nome, casuale)
    mappa.set(ins.id, { id })
    personali.push(ins.nome)
  }

  const nuovo = (id: string) => mappa.get(id)?.id ?? id
  const esami: Record<string, Esame> = {}
  for (const [k, e] of Object.entries(s.esami)) esami[nuovo(k)] = { ...e, insegnamentoId: nuovo(k) }

  return {
    stato: {
      ...s,
      insegnamenti: s.insegnamenti.map(i => {
        const m = mappa.get(i.id)
        return m ? { ...i, id: m.id, ...(m.codice ? { codice: m.codice } : {}) } : i
      }),
      esami,
      appelli: s.appelli.map((a): Appello => ({ ...a, insegnamentoId: nuovo(a.insegnamentoId) })),
      lezioni: s.lezioni.map((l): Lezione => ({ ...l, insegnamentoId: nuovo(l.insegnamentoId) })),
    },
    collegati, personali, ambigui,
  }
}

/* ---------------- Orario ---------------- */

/** A quale insegnamento del piano appartiene una riga d'orario. Il
 *  feed usa spesso il nome del modulo («Geometria descrittiva»), non
 *  quello dell'insegnamento («Fondamenti di disegno»). */
export function trovaNelPiano(
  piano: Piano | undefined, nome: string, codice?: string,
): { ins: InsegnamentoCatalogo; modulo?: string } | undefined {
  if (!piano) return undefined
  if (codice) {
    const perCodice = piano.insegnamenti.find(i => i.codice === codice)
    if (perCodice) return { ins: perCodice }
  }
  const n = normalizza(nome)
  const perNome = piano.insegnamenti.filter(i => normalizza(i.nome) === n)
  if (perNome.length === 1) return { ins: perNome[0] }
  const perModulo = piano.insegnamenti.filter(i => i.moduli.some(m => normalizza(m.nome) === n))
  if (perModulo.length === 1) return { ins: perModulo[0], modulo: nomeLeggibile(nome) }
  // Zero o più di uno: non si sceglie.
  return undefined
}

export interface OrarioDalCatalogo {
  orario: OrarioUfficiale
  /** Lezioni il cui anno la fonte non dichiara. Restano fuori dagli
   *  anni: lo studente le può scegliere a mano, l'app non le assegna. */
  senzaAnno: VarianteOrario[]
  /** L'anno che il piano dà a ciascuna, solo come informazione */
  annoNelPiano: Record<string, number>
}

function aaDa(dal: string | undefined): string {
  if (!dal) return ''
  const y = Number(dal.slice(0, 4)), m = Number(dal.slice(5, 7))
  const inizio = m >= 8 ? y : y - 1
  return `${inizio}/${String((inizio + 1) % 100).padStart(2, '0')}`
}

/** Trasforma l'orario della pipeline nella forma che il foglio di
 *  importazione già conosce: una variante per insegnamento e canale. */
export function orarioDaCatalogo(o: Orario, piano: Piano | undefined): OrarioDalCatalogo {
  const annoNelPiano: Record<string, number> = {}

  const raggruppa = (lezioni: Orario['lezioni'], conAnno: boolean): VarianteOrario[] => {
    const gruppi = new Map<string, VarianteOrario>()
    const docenti = new Map<string, Set<string>>()
    for (const l of lezioni) {
      const trovato = trovaNelPiano(piano, l.nome, l.codice)
      const ins = trovato ? nomeLeggibile(trovato.ins.nome) : nomeLeggibile(l.nome)
      if (trovato) annoNelPiano[ins] = trovato.ins.anno
      const anno = conAnno ? l.anno ?? 0 : 0
      const chiave = `${anno}|${ins}|${l.canale ?? ''}`
      const v = gruppi.get(chiave) ?? {
        ins, codice: trovato?.ins.codice, anno, slot: [] as SlotOrario[],
        etichetta: l.canale ? l.canale.replace(/^(\d+)º canale$/i, 'Canale $1') : undefined,
      }
      const suoi = docenti.get(chiave) ?? new Set<string>()
      for (const d of l.docenti) suoi.add(nomeLeggibileProprio(d))
      docenti.set(chiave, suoi)
      v.docente = [...suoi].join(', ') || undefined
      v.slot.push({
        giorno: l.giorno as Giorno, inizio: l.inizio, fine: l.fine, aula: l.aula, edificio: l.edificio,
        modulo: trovato?.modulo, saltate: l.saltate.length ? l.saltate : undefined,
      })
      gruppi.set(chiave, v)
    }
    for (const v of gruppi.values()) {
      v.slot.sort((a, b) => a.giorno - b.giorno || a.inizio.localeCompare(b.inizio))
    }
    return [...gruppi.values()].sort((a, b) => a.ins.localeCompare(b.ins, 'it') || (a.etichetta ?? '').localeCompare(b.etichetta ?? ''))
  }

  const tutte = [...o.lezioni, ...o.nonAttribuite]
  const dal = tutte.map(l => l.dal).filter((x): x is string => !!x).sort()[0] ?? ''
  const al = tutte.map(l => l.al).filter((x): x is string => !!x).sort().at(-1) ?? ''
  const semestre = (o.semestre ?? (dal && Number(dal.slice(5, 7)) >= 8 ? 1 : 2)) as 1 | 2

  return {
    orario: {
      aa: aaDa(dal),
      semestre,
      fonte: `corsidilaurea.uniroma1.it/it/course/${o.codiceCorso}/attendance/timetable`,
      dal, al,
      sospese: [],
      varianti: raggruppa(o.lezioni.filter(l => l.anno != null), true),
    },
    senzaAnno: raggruppa([...o.lezioni.filter(l => l.anno == null), ...o.nonAttribuite], false),
    annoNelPiano,
  }
}

/** «GRAZIANO MARIO VALENTI» → «Graziano Mario Valenti». Solo per i
 *  nomi di persona, dove ogni parola comincia con la maiuscola. */
function nomeLeggibileProprio(n: string): string {
  if (n !== n.toUpperCase()) return n
  return n.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, sep: string, c: string) => sep + c.toUpperCase())
}

/* ---------------- Appelli ---------------- */

export type AppelloCatalogo = Appelli['appelli'][number]

/** Gli appelli futuri di un insegnamento del libretto, per la
 *  propria coorte. Si aggancia per codice, passando dagli alias (lo
 *  stesso esame ha codici diversi fra ordinamenti); per nome solo se
 *  l'insegnamento un codice non ce l'ha, cioè è nato a mano. */
export function appelliDellInsegnamento(
  a: Appelli | undefined, codiceCoorte: string,
  ins: { codice?: string; nome: string }, dal: string,
): AppelloCatalogo[] {
  if (!a) return []
  const canonico = (c: string) => a.alias[c] ?? c
  const voci = appelliDellaCoorte(a, codiceCoorte).filter(x => x.data >= dal)
  const suoi = ins.codice
    ? voci.filter(x => canonico(x.codice) === canonico(ins.codice!))
    : voci.filter(x => normalizza(x.nome) === normalizza(ins.nome))
  return suoi.sort((x, y) => x.data.localeCompare(y.data))
}

/** La finestra di prenotazione rispetto a oggi. */
export function finestra(x: AppelloCatalogo, oggi: string): 'prima' | 'aperta' | 'chiusa' | 'ignota' {
  if (!x.prenotazioniDal && !x.prenotazioniAl) return 'ignota'
  if (x.prenotazioniDal && oggi < x.prenotazioniDal) return 'prima'
  if (x.prenotazioniAl && oggi > x.prenotazioniAl) return 'chiusa'
  return 'aperta'
}
