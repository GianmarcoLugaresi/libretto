/* ============================================================
   Immagini di sfondo per il poster della home.
   Opere in pubblico dominio o CC0 (crediti in public/poster/
   CREDITI.md), scelte per tema; due o tre per tema, a rotazione
   giornaliera. L'insegnamento può sovrascriverle con un'immagine
   propria (campo `immagine`).
   ============================================================ */

const P = (n: string) => `${import.meta.env.BASE_URL}poster/${n}.jpg`

const TEMI: Record<string, string[]> = {
  matematica:  ['durer-melencolia', 'geometria-medievale', 'leonardo-codice-atlantico'],
  disegno:     ['piranesi-carceri', 'leonardo-vitruviano', 'leonardo-anatomia'],
  arti:        ['mucha-gismonda', 'morris-tulip-willow', 'piranesi-piazza-del-popolo'],
  grafica:     ['lissitzky-cuneo-rosso', 'kandinsky-composizione-8', 'mucha-gismonda'],
  prodotto:    ['perriand-poltrona', 'ford-catena-1913', 'blossfeldt-acanthus'],
  spazio:      ['bauhaus-dessau', 'piranesi-piazza-del-popolo', 'piranesi-colosseo'],
  forma:       ['bauhaus-maestri-1926', 'kandinsky-composizione-8', 'bauhaus-dessau', 'mondrian-composizione-1921'],
  ergonomia:   ['muybridge-salto', 'marey-bicicletta', 'leonardo-vitruviano'],
  natura:      ['haeckel-actiniae', 'blossfeldt-acanthus', 'haeckel-discomedusae'],
  industria:   ['ford-catena-1913', 'ford-linea-1913', 'tour-eiffel-1888'],
  interazione: ['eniac-1946', 'apollo-11-controllo', 'houston-eidophor'],
  strutture:   ['durandelle-tour-eiffel', 'tour-eiffel-1888', 'leonardo-codice-atlantico'],
  studio:      ['bauhaus-maestri-1926', 'bauhaus-dessau', 'leonardo-codice-atlantico'],
  /** Giornata senza lezioni: immagini quiete, a rotazione */
  libero:      ['piranesi-piazza-del-popolo', 'blossfeldt-acanthus', 'haeckel-discomedusae', 'piranesi-colosseo'],
}

/** Dove cade il taglio. Il riquadro dell'eroe è più alto che largo:
 *  di un'opera orizzontale si vede circa metà della larghezza, di una
 *  verticale quasi tutta l'altezza. Scelti guardando le opere nel
 *  riquadro vero, perché i bordi cadano sul vuoto e non a metà di una
 *  chiesa o di una figura. Le assenti vanno bene col taglio di default
 *  (`center 30%`, in schermi.css). La seconda coordinata conta sulle
 *  opere verticali e, su schermi larghi, anche sulle orizzontali. */
export const FUOCHI: Record<string, string> = {
  'bauhaus-dessau':             '30% 30%',  // torre con la scritta e la vetrata
  'bauhaus-maestri-1926':       '50% 15%',  // le teste, non le gambe
  'eniac-1946':                 '30% 30%',  // l'operatore davanti ai pannelli
  'ford-catena-1913':           '40% 30%',
  'ford-linea-1913':            '10% 30%',  // il telaio intero, ruote comprese
  'houston-eidophor':           '50% 20%',  // lo schermo con l'allunaggio
  'kandinsky-composizione-8':   '0% 30%',   // il cerchio grande, intero
  'leonardo-anatomia':          '30% 30%',
  'leonardo-codice-atlantico':  '30% 30%',
  'leonardo-vitruviano':        '50% 10%',  // la figura e il cerchio, non il testo
  'lissitzky-cuneo-rosso':      '45% 30%',  // il cuneo che entra nel cerchio
  'marey-bicicletta':           '20% 30%',
  'mucha-gismonda':             '50% 15%',
  'muybridge-salto':            '0% 30%',   // due colonne di fotogrammi intere
  'piranesi-colosseo':          '8% 30%',   // la curva che si allontana
  'piranesi-piazza-del-popolo': '42% 30%',  // le due chiese con l'obelisco in mezzo
}

/** Il taglio per un'immagine del poster; per le altre (anche quelle
 *  scelte dallo studente) decide il default del CSS. */
export function fuocoDi(url: string): string | undefined {
  const m = /\/poster\/([a-z0-9-]+)\.jpg$/.exec(url)
  return m ? FUOCHI[m[1]] : undefined
}

/** Dal nome dell'insegnamento al tema. Il primo che combacia vince,
 *  quindi le voci più specifiche stanno in alto. */
const REGOLE: [RegExp, string][] = [
  [/ergonom|psicolog/i, 'ergonomia'],
  [/interazion|esperienz|multimedial|informatic|programm|digital|software|calcolator/i, 'interazione'],
  [/struttur|meccanic|statica|costruzion|impiant/i, 'strutture'],
  [/sostenib|material design|scienza dei material|natur|ambient|chimic|biolog/i, 'natura'],
  [/grafic|comunicazione visiva|tipograf|lettering|editorial|visual/i, 'grafica'],
  [/prodott|industrial design|oggett/i, 'prodotto'],
  [/industria|management|econom|impres|marketing|gestion|aziend/i, 'industria'],
  [/arti applicate|storia dell.arte|decorativ|arte contemporanea/i, 'arti'],
  [/spazio|intern|interior|urban|allestim|architett|pubblic/i, 'spazio'],
  [/forma|storia del design|teoria e storia/i, 'forma'],
  [/matemat|geometr|statistic|fisic|analisi/i, 'matematica'],
  [/disegno|rilievo|modell|rappresentaz/i, 'disegno'],
  [/sintesi|laborator|tirocin|prova finale|scelta/i, 'studio'],
]

export function temaDi(nome: string): string {
  for (const [re, tema] of REGOLE) if (re.test(nome)) return tema
  return 'studio'
}

/** L'immagine di oggi per un insegnamento: ruota ogni giorno tra
 *  quelle del suo tema, così la home non è sempre uguale. */
export function immaginePer(nome: string, giornoDellAnno = giornoAnno()): string {
  const lista = TEMI[temaDi(nome)] ?? TEMI.studio
  return P(lista[giornoDellAnno % lista.length])
}

/** L'immagine di oggi per una giornata libera. */
export function immagineLibera(giornoDellAnno = giornoAnno()): string {
  const lista = TEMI.libero
  return P(lista[giornoDellAnno % lista.length])
}

function giornoAnno(): number {
  const d = new Date()
  return Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86_400_000)
}
