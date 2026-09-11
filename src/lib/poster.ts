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
