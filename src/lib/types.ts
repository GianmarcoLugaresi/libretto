/* ============================================================
   Modello dati — modellato sul funzionamento reale di Sapienza:
   voti 18–30 con lode, idoneità senza voto, CFU a scelta,
   corsi annuali oltre che semestrali.
   ============================================================ */

export type Semestre = 1 | 2 | 0        // 0 = annuale
export type AnnoCorso = 1 | 2 | 3 | 4 | 5 | 6

export type TipoInsegnamento =
  | 'obbligatorio'
  | 'caratterizzante'
  | 'affine'
  | 'a_scelta'
  | 'tirocinio'
  | 'lingua'
  | 'prova_finale'

/** Un insegnamento del piano di studi. */
export interface Insegnamento {
  id: string
  nome: string
  cfu: number
  anno: AnnoCorso
  semestre: Semestre
  tipo: TipoInsegnamento
  /** Settore scientifico-disciplinare, es. INF/01 */
  ssd?: string
  docente?: string
  codice?: string
  /** Indice 0–9 nella tavolozza: dà al corso un colore stabile
   *  in orario, calendario e statistiche. */
  tinta: number
  /** URL di un'immagine scelta da te per il poster in home; se
   *  manca, l'app ne sceglie una a tema. */
  immagine?: string
}

export type StatoEsame =
  | 'da_sostenere'
  | 'prenotato'
  | 'superato'
  | 'idoneo'      // superato senza voto (lingue, tirocini)
  | 'respinto'    // bocciato o ritirato: resta nello storico

/** Il record d'esame per un insegnamento. Uno per insegnamento;
 *  i tentativi andati male finiscono in `tentativi`. */
export interface Esame {
  insegnamentoId: string
  stato: StatoEsame
  voto?: number           // 18–30
  lode?: boolean
  /** Data di superamento (ISO yyyy-mm-dd) */
  data?: string
  /** Appello per cui sei prenotato, se stato = 'prenotato' */
  appelloId?: string
  note?: string
  /** Escludi dalla media pur contando i CFU (es. esame convalidato
   *  da Bologna, che porta crediti ma non voto). */
  escludiDaMedia?: boolean
  tentativi?: { data: string; esito: 'respinto' | 'ritirato'; voto?: number }[]
}

export type TipoProva = 'scritto' | 'orale' | 'scritto_orale' | 'pratico' | 'parziale'

/** Una data d'appello. */
export interface Appello {
  id: string
  insegnamentoId: string
  /** ISO yyyy-mm-dd */
  data: string
  /** "09:00" — opzionale, non sempre pubblicata in anticipo */
  ora?: string
  aula?: string
  edificio?: string
  tipo: TipoProva
  /** Finestra di iscrizione su Infostud */
  iscrizioneDal?: string
  iscrizioneAl?: string
  note?: string
}

export type Giorno = 1 | 2 | 3 | 4 | 5 | 6 | 7   // 1 = lunedì (ISO)

/** Una lezione ricorrente settimanale. */
export interface Lezione {
  id: string
  insegnamentoId: string
  giorno: Giorno
  /** "08:00" */
  inizio: string
  fine: string
  aula?: string
  edificio?: string
  /** Modulo dell'insegnamento, quando le ore sono divise per modulo
   *  (es. "Geometria descrittiva" dentro Fondamenti di disegno) */
  modulo?: string
  /** Periodo di validità: fuori da qui la lezione non compare
   *  (le lezioni del 1° semestre non devono apparire a maggio). */
  dal?: string
  al?: string
  /** Lezione singola annullata o spostata, per date ISO */
  saltate?: string[]
}

export type TipoCorsoLaurea = 'triennale' | 'magistrale' | 'ciclo_unico'

export interface Profilo {
  nome: string
  matricola?: string
  corsoDiLaurea: string
  /** Id del corso nel catalogo, se scelto da lì: aggancia
   *  l'orario ufficiale e il piano di riferimento. */
  catalogoId?: string
  facolta?: string
  tipo: TipoCorsoLaurea
  /** Totale CFU per laurearsi: 180 triennale, 120 magistrale */
  cfuTotali: number
  /** Anno accademico d'immatricolazione, es. 2025 per 2025/26 */
  immatricolazione: number
  annoCorrente: AnnoCorso
  durataAnni: number
}

export interface Impostazioni {
  /** Quanto vale la lode nel calcolo della media ponderata.
   *  Sapienza di norma la conta 30; alcuni CdL usano 30 o 31 per
   *  il voto di partenza. Configurabile perché cambia il risultato. */
  valoreLode: 30 | 31 | 32
  /** Punti extra stimati alla proclamazione (tesi, in corso,
   *  Erasmus...). Serve alla proiezione del voto di laurea. */
  puntiTesi: number
  tema: 'auto' | 'chiaro' | 'scuro'
  /** Giorni di preavviso per l'avviso "esame vicino" */
  preavvisoGiorni: number
  /** Notifiche locali (solo app nativa) */
  notifiche?: { lezioni: boolean; esami: boolean; minutiPrima: number }
}

/** Avanzamento delle sincronizzazioni. Sta nello stato perché la UI
 *  deve poter dire "aggiornato il…" senza interrogare la rete. */
export interface StatoSync {
  /** Ultimo controllo dei dati pubblici (ISO) */
  pubblicaIl?: string
  /** Ultima sincronizzazione con Infostud (ISO) */
  infostudIl?: string
  /** ETag per file scaricato: evita di riscaricare l'invariato */
  etag?: Record<string, string>
}

/** Radice dello stato persistito.
 *  `esami` è indicizzato per chiave stabile dell'insegnamento
 *  (vedi chiavi.ts): è quella che regge gli aggiornamenti del
 *  catalogo e, più avanti, l'aggancio degli esami di Infostud. */
export interface Stato {
  versione: number
  profilo: Profilo
  impostazioni: Impostazioni
  insegnamenti: Insegnamento[]
  esami: Record<string, Esame>
  appelli: Appello[]
  lezioni: Lezione[]
  sync: StatoSync
  /** Prima apertura non ancora conclusa */
  onboarding: boolean
}

/* ---------------- Etichette ---------------- */

export const LABEL_STATO: Record<StatoEsame, string> = {
  da_sostenere: 'Da sostenere',
  prenotato: 'Prenotato',
  superato: 'Superato',
  idoneo: 'Idoneo',
  respinto: 'Non superato',
}

export const LABEL_TIPO: Record<TipoInsegnamento, string> = {
  obbligatorio: 'Base',
  caratterizzante: 'Caratterizzante',
  affine: 'Affine',
  a_scelta: 'A scelta',
  tirocinio: 'Tirocinio',
  lingua: 'Lingua',
  prova_finale: 'Prova finale',
}

export const LABEL_PROVA: Record<TipoProva, string> = {
  scritto: 'Scritto',
  orale: 'Orale',
  scritto_orale: 'Scritto e orale',
  pratico: 'Pratico',
  parziale: 'Esonero',
}

export const GIORNI = ['', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica']
export const GIORNI_BREVI = ['', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']

/** Tavolozza per gli insegnamenti: tinte desaturate che
 *  convivono senza urlare quando ce ne sono sei in un giorno. */
export const TINTE = [
  { h: 351, nome: 'Bordeaux' },
  { h: 28,  nome: 'Terracotta' },
  { h: 42,  nome: 'Ocra' },
  { h: 158, nome: 'Salvia' },
  { h: 190, nome: 'Ottanio' },
  { h: 214, nome: 'Indaco' },
  { h: 260, nome: 'Glicine' },
  { h: 320, nome: 'Prugna' },
  { h: 96,  nome: 'Oliva' },
  { h: 8,   nome: 'Mattone' },
]
