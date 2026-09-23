/* ============================================================
   Modelli dei dati pubblici e schemi di validazione.

   Ogni file pubblicato porta `schemaVersion`, `sources` e
   `fetchedAt`: l'app deve poter dire da dove viene un dato e
   quando è stato preso, e rifiutare un file di una versione che
   non sa leggere.
   ============================================================ */

import { z } from 'zod'

export const VERSIONE_SCHEMA = 1

const ISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'data yyyy-mm-dd')
const Comune = {
  schemaVersion: z.literal(VERSIONE_SCHEMA),
  sources: z.array(z.string().url()).min(1),
  fetchedAt: z.string().datetime(),
}

/* ---------------- Corso e coorti ---------------- */

/** Una coorte: l'anno di immatricolazione e il codice corso che le
 *  corrisponde. Il codice cambia fra coorti (Design: 31807 per
 *  2024/25, 33426 dal 2025/26), quindi non è identificativo da solo. */
export const Coorte = z.object({
  anno: z.number().int().min(2000).max(2100),
  /** "2024/2025" */
  etichetta: z.string(),
  codiceCorso: z.string(),
})
export type Coorte = z.infer<typeof Coorte>

export const Corso = z.object({
  codice: z.string(),
  nome: z.string().min(1),
  classe: z.string().optional(),
  facolta: z.string().optional(),
  /** Coorti note, dalla più recente */
  coorti: z.array(Coorte).default([]),
})
export type Corso = z.infer<typeof Corso>

export const Indice = z.object({
  ...Comune,
  generatedAt: z.string().datetime(),
  corsi: z.array(Corso),
  /** percorso del file → hash del contenuto, per scaricare solo il cambiato */
  hash: z.record(z.string(), z.string()).default({}),
})
export type Indice = z.infer<typeof Indice>

/* ---------------- Piano di studi ---------------- */

export const TipoAttivita = z.enum(['graded', 'pass_fail', 'other'])
export type TipoAttivita = z.infer<typeof TipoAttivita>

/** Modulo di un insegnamento integrato. Non ha codice proprio: voto
 *  e CFU appartengono al padre, il modulo serve a lezioni e orari.
 *  I suoi CFU non vanno sommati a quelli del padre. */
export const Modulo = z.object({
  nome: z.string().min(1),
  cfu: z.number().nonnegative(),
  ssd: z.string().optional(),
  lingua: z.string().optional(),
  /** Chiave interna del catalogo, per costruire il link alla pagina */
  uuid: z.string().optional(),
})
export type Modulo = z.infer<typeof Modulo>

export const Insegnamento = z.object({
  codice: z.string(),
  nome: z.string().min(1),
  anno: z.number().int().min(1).max(6),
  /** 1, 2, oppure 0 per annuale */
  semestre: z.number().int().min(0).max(2),
  cfu: z.number().nonnegative(),
  ssd: z.string().optional(),
  lingua: z.string().optional(),
  tipo: TipoAttivita,
  /** Nome del gruppo opzionale di appartenenza, se c'è */
  gruppo: z.string().optional(),
  moduli: z.array(Modulo).default([]),
  uuid: z.string().optional(),
  /** Percorso della pagina dell'insegnamento, per i programmi a richiesta */
  pagina: z.string().optional(),
})
export type Insegnamento = z.infer<typeof Insegnamento>

export const GruppoOpzionale = z.object({
  nome: z.string(),
  /** CFU da acquisire nel gruppo, se dichiarati */
  cfuRichiesti: z.number().nonnegative().optional(),
  codici: z.array(z.string()),
})
export type GruppoOpzionale = z.infer<typeof GruppoOpzionale>

export const Piano = z.object({
  ...Comune,
  codiceCorso: z.string(),
  nomeCorso: z.string(),
  coorte: z.number().int(),
  curricula: z.array(z.string()).default([]),
  insegnamenti: z.array(Insegnamento),
  gruppi: z.array(GruppoOpzionale).default([]),
})
export type Piano = z.infer<typeof Piano>

/* ---------------- Appelli ---------------- */

export const Appello = z.object({
  /** Codice dell'insegnamento come compare nella pagina */
  codice: z.string(),
  nome: z.string(),
  /** Codice corso della riga: la stessa pagina mescola più coorti */
  codiceCorso: z.string().optional(),
  data: ISO,
  docenti: z.array(z.string()).default([]),
  prenotazioniDal: ISO.optional(),
  prenotazioniAl: ISO.optional(),
})
export type Appello = z.infer<typeof Appello>

export const Appelli = z.object({
  ...Comune,
  codiceCorso: z.string(),
  appelli: z.array(Appello),
  /** codice → codice canonico: lo stesso esame fra ordinamenti diversi */
  alias: z.record(z.string(), z.string()).default({}),
})
export type Appelli = z.infer<typeof Appelli>

/* ---------------- Orari ---------------- */

export const Lezione = z.object({
  /** Nome dell'insegnamento o del modulo come compare in orario */
  nome: z.string(),
  /** Codice dell'insegnamento, quando la fonte lo dichiara */
  codice: z.string().optional(),
  /** 1 = lunedì … 7 = domenica */
  giorno: z.number().int().min(1).max(7),
  inizio: z.string().regex(/^\d{2}:\d{2}$/),
  fine: z.string().regex(/^\d{2}:\d{2}$/),
  aula: z.string().optional(),
  edificio: z.string().optional(),
  docenti: z.array(z.string()).default([]),
  /** Anno di corso, SOLO se la fonte lo dichiara. Mai dedotto. */
  anno: z.number().int().min(1).max(6).optional(),
  /** Canale, SOLO se la fonte lo dichiara. Mai dedotto. */
  canale: z.string().optional(),
  /** Prima e ultima data osservata per questa fascia */
  dal: ISO.optional(),
  al: ISO.optional(),
  /** Date del suo giorno in cui la lezione non si tiene */
  saltate: z.array(ISO).default([]),
})
export type Lezione = z.infer<typeof Lezione>

export const Orario = z.object({
  ...Comune,
  codiceCorso: z.string(),
  coorte: z.number().int().optional(),
  /** Id dell'adattatore che ha prodotto questi dati */
  adattatore: z.string(),
  semestre: z.number().int().min(1).max(2).optional(),
  lezioni: z.array(Lezione),
  /** Lezioni senza anno o canale dichiarati: l'app le mostra a parte,
   *  non le attribuisce da sola. */
  nonAttribuite: z.array(Lezione).default([]),
})
export type Orario = z.infer<typeof Orario>

/* ---------------- Programmi ---------------- */

export const Programma = z.object({
  ...Comune,
  codiceCorso: z.string(),
  codice: z.string(),
  nome: z.string(),
  canale: z.string().optional(),
  docenti: z.array(z.string()).default([]),
  sezioni: z.record(z.string(), z.string()).default({}),
})
export type Programma = z.infer<typeof Programma>

/* I percorsi stanno in un modulo loro, senza zod: l'app li usa anche
   dove non vuole caricare la validazione. */
export { percorsi } from './percorsi'
