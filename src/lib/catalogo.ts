/* ============================================================
   Catalogo dei corsi di laurea.

   REGOLA: qui dentro entrano solo piani trascritti dal catalogo
   ufficiale Sapienza e verificati riga per riga (la somma dei CFU
   deve tornare per anno e per semestre). Un piano "plausibile" ma
   ricostruito a mano fa più danni che comodo: da qui si aggiungono
   esami al libretto vero, e CFU sbagliati falsano media e
   proiezione del voto di laurea.

   Per i corsi non ancora trascritti si parte da zero e si
   aggiungono gli insegnamenti a mano.
   ============================================================ */

import type { Giorno, Insegnamento, TipoCorsoLaurea, TipoInsegnamento } from './types'

/** [nome, cfu, anno, semestre (0=annuale), tipo?, ssd?] */
type Riga = [string, number, number, number, TipoInsegnamento?, string?]

/** Una fascia oraria settimanale. */
export interface SlotOrario {
  giorno: Giorno
  inizio: string
  fine: string
  aula?: string
  edificio?: string
  /** Modulo tenuto in questa fascia, se l'insegnamento ne ha più d'uno */
  modulo?: string
}

/** Un modo di seguire un insegnamento: il canale (A-Li / Lo-Z) o,
 *  al terzo anno, quale laboratorio hai scelto. Chi importa
 *  l'orario sceglie la variante che lo riguarda. */
export interface VarianteOrario {
  /** Nome dell'insegnamento nel piano di studi */
  ins: string
  /** Come compare in orario, se diverso dal nome nel piano */
  titolo?: string
  /** "Canale 1", "Canale 2 · Lo-Z", oppure il laboratorio scelto */
  etichetta?: string
  docente?: string
  anno: number
  slot: SlotOrario[]
}

export interface OrarioUfficiale {
  aa: string
  semestre: 1 | 2
  fonte: string
  /** Primo e ultimo giorno di lezione pubblicati */
  dal: string
  al: string
  /** Giorni senza lezione dentro il periodo (ponti, Natale) */
  sospese: string[]
  varianti: VarianteOrario[]
}

export interface CorsoLaurea {
  id: string
  nome: string
  classe: string
  facolta: string
  tipo: TipoCorsoLaurea
  anni: number
  cfu: number
  piano: Riga[]
  /** Da dove viene il piano e a che anno accademico si riferisce. */
  fonte: { url: string; aa: string }
  /** Orario ufficiale pubblicato dalla facoltà, se disponibile */
  orario?: OrarioUfficiale
}

const O: TipoInsegnamento = 'obbligatorio'
const C: TipoInsegnamento = 'caratterizzante'
const A: TipoInsegnamento = 'affine'
const S: TipoInsegnamento = 'a_scelta'
const T: TipoInsegnamento = 'tirocinio'
const L: TipoInsegnamento = 'lingua'
const P: TipoInsegnamento = 'prova_finale'

export const CATALOGO: CorsoLaurea[] = [
  {
    id: 'design',
    nome: 'Design',
    classe: 'L-4',
    facolta: 'Architettura',
    tipo: 'triennale', anni: 3, cfu: 180,
    fonte: { url: 'corsidilaurea.uniroma1.it/it/course/33426/study-plan', aa: '2026/27' },
    piano: [
      // 1° anno — I semestre
      ['Istituzioni di matematica', 6, 1, 1, O, 'MATH-03/A'],
      ['Fondamenti di disegno', 12, 1, 1, C, 'CEAR-10/A'],
      ['Scienza dei materiali', 6, 1, 1, O, 'IMAT-01/A'],
      ['Storia delle arti applicate', 6, 1, 1, C, 'ARTE-01/C'],
      // 1° anno — II semestre
      ['Laboratorio di basic design per la grafica', 6, 1, 2, C, 'CEAR-08/D'],
      ['Laboratorio di basic design per il prodotto', 6, 1, 2, C, 'CEAR-08/D'],
      ['Laboratorio di basic design per lo spazio interno', 6, 1, 2, C, 'CEAR-09/C'],
      ['Teoria della forma', 6, 1, 2, C, 'CEAR-10/A'],
      ['Ergonomia e psicologia cognitiva per il design', 6, 1, 2, C, 'CEAR-08/C'],
      // 2° anno — I semestre
      ['Material design e tecnologie per la sostenibilità', 6, 2, 1, C, 'CEAR-08/C'],
      ['Disegno e modello', 9, 2, 1, C, 'CEAR-10/A'],
      ['Teoria e storia del design', 6, 2, 1, C, 'CEAR-08/D'],
      ['Progettazione strutturale e principi di meccanica per il design', 9, 2, 1, A, 'CEAR-06/A'],
      // 2° anno — II semestre
      ['Laboratorio di design per la grafica e la comunicazione visiva', 9, 2, 2, C, 'CEAR-08/D'],
      ['Laboratorio di design per il prodotto', 9, 2, 2, C, 'CEAR-08/D'],
      ['Laboratorio di design per lo spazio pubblico', 9, 2, 2, C, 'CEAR-08/D'],
      ['Lingua inglese', 3, 2, 2, L],
      // 3° anno — I semestre
      ['Storia dell’industria e management dell’innovazione', 6, 3, 1, A, 'ECON-07/A'],
      ['Laboratorio di sintesi finale (uno a scelta)', 12, 3, 1, C, 'CEAR-08/D'],
      ['Design dell’interazione, dell’esperienza o del multimediale', 12, 3, 1, C, 'CEAR-08/D'],
      // 3° anno — II semestre
      ['Altre conoscenze utili per il mondo del lavoro', 8, 3, 2, T],
      ['A scelta dello studente', 12, 3, 2, S],
      ['Prova finale', 10, 3, 2, P],
    ],
    // Orario ufficiale 1° semestre 2026/27, dal calendario del catalogo
    // (dati GOMP, 535 lezioni da settembre a gennaio). Anno e canale
    // vengono dai campi strutturati dove ci sono; per gli insegnamenti
    // del 3° anno, che il calendario elenca per modulo, l'aggancio al
    // piano segue aule e giorni, che combaciano con la precedente
    // pubblicazione della facoltà (G33, F5, Y1, F6, Y3).
    orario: {
      aa: '2026/27',
      semestre: 1,
      fonte: 'corsidilaurea.uniroma1.it/it/course/33426/attendance/timetable',
      dal: '2026-09-28',
      al: '2027-01-13',
      sospese: ['2026-11-23', '2026-12-07', '2026-12-08', '2026-12-24', '2026-12-25', '2026-12-28',
        '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-04', '2027-01-05', '2027-01-06'],
      varianti: [
        // ---------------- I anno ----------------
        { ins: 'Istituzioni di matematica', anno: 1, etichetta: 'Canale 1', slot: [
          { giorno: 2, inizio: '11:00', fine: '14:00', aula: 'Aula F1', edificio: 'RM068' },
          { giorno: 4, inizio: '12:00', fine: '14:00', aula: 'Aula F1', edificio: 'RM068' },
        ]},
        { ins: 'Istituzioni di matematica', anno: 1, etichetta: 'Canale 2', slot: [
          { giorno: 2, inizio: '11:00', fine: '13:30', aula: 'Aula F5', edificio: 'RM068' },
          { giorno: 5, inizio: '09:00', fine: '11:30', aula: 'Aula F1', edificio: 'RM068' },
        ]},
        { ins: 'Fondamenti di disegno', anno: 1, etichetta: 'Canale 1', docente: 'Meschini A.', slot: [
          { giorno: 2, inizio: '14:30', fine: '19:30', aula: 'Aula F5', edificio: 'RM068', modulo: 'Disegno digitale' },
          { giorno: 4, inizio: '14:30', fine: '19:30', aula: 'Aula F6', edificio: 'RM068', modulo: 'Geometria descrittiva' },
        ]},
        { ins: 'Fondamenti di disegno', anno: 1, etichetta: 'Canale 2', docente: 'Colonnese F. / Salvatore M.', slot: [
          { giorno: 2, inizio: '14:30', fine: '19:30', aula: 'Aula F6', edificio: 'RM068', modulo: 'Disegno digitale' },
          { giorno: 4, inizio: '14:30', fine: '19:30', aula: 'Aula F5', edificio: 'RM068', modulo: 'Geometria descrittiva' },
        ]},
        { ins: 'Scienza dei materiali', anno: 1, etichetta: 'Canale 1', slot: [
          { giorno: 3, inizio: '11:30', fine: '13:30', aula: 'Aula F2', edificio: 'RM068' },
          { giorno: 5, inizio: '14:30', fine: '16:30', aula: 'Aula F2', edificio: 'RM068' },
        ]},
        { ins: 'Scienza dei materiali', anno: 1, etichetta: 'Canale 2', slot: [
          { giorno: 3, inizio: '14:00', fine: '16:00', aula: 'Aula F6', edificio: 'RM068' },
          { giorno: 5, inizio: '16:30', fine: '18:30', aula: 'Aula F2', edificio: 'RM068' },
        ]},
        { ins: 'Storia delle arti applicate', anno: 1, slot: [
          { giorno: 2, inizio: '08:30', fine: '11:00', aula: 'Aula F1', edificio: 'RM068' },
          { giorno: 5, inizio: '11:30', fine: '14:00', aula: 'Aula F1', edificio: 'RM068' },
        ]},
        // ---------------- II anno ----------------
        { ins: 'Material design e tecnologie per la sostenibilità', anno: 2, etichetta: 'Canale 1', slot: [
          { giorno: 4, inizio: '14:30', fine: '17:00', aula: 'Aula G31', edificio: 'RM089', modulo: 'Material design' },
          { giorno: 4, inizio: '17:00', fine: '19:30', aula: 'Aula G31', edificio: 'RM089', modulo: 'Tecnologie per la sostenibilità' },
        ]},
        { ins: 'Material design e tecnologie per la sostenibilità', anno: 2, etichetta: 'Canale 2', docente: 'Baiani S.', slot: [
          { giorno: 4, inizio: '09:00', fine: '11:30', aula: 'Aula F5', edificio: 'RM068', modulo: 'Tecnologie per la sostenibilità' },
          { giorno: 4, inizio: '11:30', fine: '13:30', aula: 'Aula F5', edificio: 'RM068', modulo: 'Material design' },
        ]},
        { ins: 'Disegno e modello', anno: 2, etichetta: 'Canale 1', docente: 'Calvano M. / Casale A.', slot: [
          { giorno: 2, inizio: '11:30', fine: '13:30', aula: 'Aula F3', edificio: 'RM068', modulo: 'Modellazione digitale' },
          { giorno: 4, inizio: '09:00', fine: '13:30', aula: 'Aula F3', edificio: 'RM068', modulo: 'Modellazione tridimensionale' },
        ]},
        { ins: 'Disegno e modello', anno: 2, etichetta: 'Canale 2', docente: 'Romor J. / Valenti G. M.', slot: [
          { giorno: 2, inizio: '09:30', fine: '11:30', aula: 'Aula F3', edificio: 'RM068', modulo: 'Modellazione digitale' },
          { giorno: 4, inizio: '14:30', fine: '19:30', aula: 'Aula F3', edificio: 'RM068', modulo: 'Modellazione tridimensionale' },
        ]},
        { ins: 'Teoria e storia del design', anno: 2, slot: [
          { giorno: 2, inizio: '14:30', fine: '18:30', aula: 'Aula 9', edificio: 'RM064' },
        ]},
        { ins: 'Progettazione strutturale e principi di meccanica per il design', anno: 2, etichetta: 'Canale 1', docente: 'Lofrano E.', slot: [
          { giorno: 1, inizio: '14:30', fine: '19:00', aula: 'Aula F5', edificio: 'RM068', modulo: 'Progettazione strutturale' },
          { giorno: 3, inizio: '09:00', fine: '11:30', aula: 'Aula F2', edificio: 'RM068', modulo: 'Principi di meccanica' },
        ]},
        { ins: 'Progettazione strutturale e principi di meccanica per il design', anno: 2, etichetta: 'Canale 2', docente: 'Boscato G.', slot: [
          { giorno: 1, inizio: '14:30', fine: '19:00', aula: 'Aula F6', edificio: 'RM068', modulo: 'Progettazione strutturale' },
          { giorno: 3, inizio: '09:00', fine: '11:30', aula: 'Aula F6', edificio: 'RM068', modulo: 'Principi di meccanica' },
        ]},
        // ---------------- III anno ----------------
        { ins: 'Storia dell’industria e management dell’innovazione', anno: 3, slot: [
          { giorno: 1, inizio: '09:00', fine: '11:00', aula: 'Aula F5', edificio: 'RM068', modulo: 'Fondamenti di marketing e comunicazione d’impresa' },
          { giorno: 1, inizio: '11:00', fine: '13:30', aula: 'Aula F5', edificio: 'RM068', modulo: 'Imprenditorialità e sviluppo di nuovi business' },
        ]},
        { ins: 'Laboratorio di sintesi finale (uno a scelta)', anno: 3, etichetta: 'Exhibit e spazio pubblico', slot: [
          { giorno: 2, inizio: '09:00', fine: '14:00', aula: 'Aula G33', edificio: 'RM089', modulo: 'Design per l’exhibit e lo spazio pubblico' },
          { giorno: 2, inizio: '14:00', fine: '19:00', aula: 'Aula G33', edificio: 'RM089', modulo: 'Comunicazione visiva e multimediale' },
        ]},
        { ins: 'Laboratorio di sintesi finale (uno a scelta)', anno: 3, etichetta: 'Comunicazione visiva', slot: [
          { giorno: 3, inizio: '09:00', fine: '14:00', aula: 'Aula F5', edificio: 'RM068', modulo: 'Branding' },
          { giorno: 3, inizio: '14:00', fine: '19:00', aula: 'Aula F5', edificio: 'RM068', modulo: 'Design per la comunicazione visiva 2' },
        ]},
        { ins: 'Laboratorio di sintesi finale (uno a scelta)', anno: 3, etichetta: 'Prodotto', slot: [
          { giorno: 4, inizio: '09:00', fine: '14:00', aula: 'Aula Y1', edificio: 'RM094', modulo: 'Design per il prodotto 2' },
          { giorno: 4, inizio: '14:00', fine: '19:00', aula: 'Aula Y1', edificio: 'RM094', modulo: 'Processi produttivi' },
        ]},
        { ins: 'Design dell’interazione, dell’esperienza o del multimediale', anno: 3, etichetta: 'Design dell’interazione', slot: [
          { giorno: 5, inizio: '09:00', fine: '14:00', aula: 'Aula F6', edificio: 'RM068', modulo: 'Design per le tecnologie digitali' },
          { giorno: 5, inizio: '14:00', fine: '19:00', aula: 'Aula F6', edificio: 'RM068', modulo: 'Tecnologie informatiche' },
        ]},
        { ins: 'Design dell’interazione, dell’esperienza o del multimediale', anno: 3, etichetta: 'Design dell’esperienza', slot: [
          { giorno: 5, inizio: '09:00', fine: '14:00', aula: 'Aula F5', edificio: 'RM068', modulo: 'Analisi del comportamento' },
          { giorno: 5, inizio: '14:00', fine: '19:00', aula: 'Aula F5', edificio: 'RM068', modulo: 'Design per l’esperienza utente' },
        ]},
        { ins: 'Design dell’interazione, dell’esperienza o del multimediale', anno: 3, etichetta: 'Disegno del multimediale', slot: [
          { giorno: 5, inizio: '09:00', fine: '14:00', aula: 'Aula Y3', edificio: 'RM094', modulo: 'Rappresentazione multimediale' },
          { giorno: 5, inizio: '14:00', fine: '19:00', aula: 'Aula Y3', edificio: 'RM094', modulo: 'Tecniche per la scenografia e per gli eventi' },
        ]},
      ],
    },
  },
]

/** Espande un piano in insegnamenti pronti per il libretto. */
export function espandi(c: CorsoLaurea, id: () => string): Insegnamento[] {
  return c.piano.map((r, i) => {
    const [nome, cfu, anno, semestre, tipo, ssd] = r
    return {
      id: id(),
      nome,
      cfu,
      anno: anno as Insegnamento['anno'],
      semestre: semestre as Insegnamento['semestre'],
      tipo: tipo ?? 'obbligatorio',
      ssd,
      tinta: i % 10,
    }
  })
}

export function cfuDelPiano(c: CorsoLaurea): number {
  return c.piano.reduce((n, r) => n + r[1], 0)
}

export function trovaCorso(id: string): CorsoLaurea | undefined {
  return CATALOGO.find(c => c.id === id)
}
