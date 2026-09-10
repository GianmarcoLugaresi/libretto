/* ============================================================
   Set di icone disegnate a mano: tratto uniforme 1.75,
   estremità tonde, griglia 24. Un set coerente regge il
   carattere dell'interfaccia più di qualsiasi illustrazione.
   ============================================================ */

export type NomeIcona =
  | 'casa' | 'libro' | 'calendario' | 'orologio' | 'grafico'
  | 'chevron' | 'chevron-giu' | 'chevron-su' | 'indietro'
  | 'piu' | 'check' | 'chiudi' | 'cestino' | 'matita'
  | 'cerca' | 'ingranaggio' | 'bussola' | 'campana'
  | 'luogo' | 'persona' | 'tocco' | 'scarica' | 'carica'
  | 'stella' | 'bersaglio' | 'salita' | 'info' | 'avviso'
  | 'lampadina' | 'fuoco' | 'cappello' | 'filtro' | 'sole'

const P: Record<NomeIcona, string[]> = {
  casa: ['M4 10.9 12 4.2l8 6.7V19a2 2 0 0 1-2 2h-3.6v-5.6H9.6V21H6a2 2 0 0 1-2-2z'],
  libro: [
    'M5 5.5A2.5 2.5 0 0 1 7.5 3H19v14.5H7.5A2.5 2.5 0 0 0 5 20z',
    'M5 20a2.5 2.5 0 0 1 2.5-2.5H19V21H7.5A2.5 2.5 0 0 1 5 20z',
    'M9 7.5h6M9 11h4',
  ],
  calendario: [
    'M4.5 7.5A2 2 0 0 1 6.5 5.5h11a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2z',
    'M4.5 10.5h15M8.5 3.5v4M15.5 3.5v4',
    'm9 15 2 2 4-4',
  ],
  orologio: [
    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
    'M12 7.2V12l3.2 2',
  ],
  grafico: [
    'M4 3.5v15a2 2 0 0 0 2 2h14',
    'M8 17V12.5M12.5 17V7.5M17 17v-6.5',
  ],
  chevron: ['m9.5 5.5 6.5 6.5-6.5 6.5'],
  'chevron-giu': ['m5.5 9.5 6.5 6.5 6.5-6.5'],
  'chevron-su': ['m5.5 14.5 6.5-6.5 6.5 6.5'],
  indietro: ['m14.5 5.5-6.5 6.5 6.5 6.5'],
  piu: ['M12 5v14M5 12h14'],
  check: ['m5 12.8 4.6 4.4L19 6.6'],
  chiudi: ['m6.5 6.5 11 11M17.5 6.5l-11 11'],
  cestino: [
    'M4.5 7.5h15', 'M9.5 7.5V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2.5',
    'M6.5 7.5 7.3 19a2 2 0 0 0 2 1.9h5.4a2 2 0 0 0 2-1.9l.8-11.5',
    'M10.5 11v6M13.5 11v6',
  ],
  matita: [
    'M4.5 19.5h3.1L19 8.1a1.8 1.8 0 0 0 0-2.5l-.6-.6a1.8 1.8 0 0 0-2.5 0L4.5 16.4z',
    'M14.8 6.8l2.4 2.4',
  ],
  cerca: ['M10.8 17.6a6.8 6.8 0 1 0 0-13.6 6.8 6.8 0 0 0 0 13.6z', 'm15.8 15.8 4.2 4.2'],
  ingranaggio: [
    'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z',
    'M19.3 14.5a1.5 1.5 0 0 0 .3 1.7l.1.1a1.8 1.8 0 1 1-2.6 2.6l-.1-.1a1.5 1.5 0 0 0-1.7-.3 1.5 1.5 0 0 0-.9 1.4v.2a1.8 1.8 0 0 1-3.6 0v-.1a1.5 1.5 0 0 0-1-1.4 1.5 1.5 0 0 0-1.7.3l-.1.1a1.8 1.8 0 1 1-2.6-2.6l.1-.1a1.5 1.5 0 0 0 .3-1.7 1.5 1.5 0 0 0-1.4-.9H4a1.8 1.8 0 0 1 0-3.6h.2a1.5 1.5 0 0 0 1.3-1 1.5 1.5 0 0 0-.3-1.7l-.1-.1a1.8 1.8 0 1 1 2.6-2.6l.1.1a1.5 1.5 0 0 0 1.7.3H9.7a1.5 1.5 0 0 0 .9-1.4V4a1.8 1.8 0 0 1 3.6 0v.2a1.5 1.5 0 0 0 .9 1.4 1.5 1.5 0 0 0 1.7-.3l.1-.1a1.8 1.8 0 1 1 2.6 2.6l-.1.1a1.5 1.5 0 0 0-.3 1.7v.1a1.5 1.5 0 0 0 1.4.9h.2a1.8 1.8 0 0 1 0 3.6h-.2a1.5 1.5 0 0 0-1.4.9z',
  ],
  bussola: [
    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
    'm15.2 8.8-2 4.4-4.4 2 2-4.4z',
  ],
  campana: [
    'M18 9.5a6 6 0 1 0-12 0c0 4.2-1.5 5.5-1.5 5.5h15S18 13.7 18 9.5z',
    'M13.7 18.5a2 2 0 0 1-3.4 0',
  ],
  luogo: [
    'M19 10.5c0 5-7 10.5-7 10.5s-7-5.5-7-10.5a7 7 0 0 1 14 0z',
    'M12 13a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  ],
  persona: [
    'M12 12.2a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
    'M5 20.5a7 7 0 0 1 14 0',
  ],
  tocco: ['M12 20.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2z', 'M12 16V4'],
  scarica: ['M12 4v11', 'm7.5 10.5 4.5 4.5 4.5-4.5', 'M4.5 19.5h15'],
  carica: ['M12 15.5V4.5', 'm7.5 9 4.5-4.5L16.5 9', 'M4.5 19.5h15'],
  stella: ['m12 3.8 2.6 5.4 5.9.8-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.2 5.9-.8z'],
  bersaglio: [
    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
    'M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9z',
    'M12 13.2a1.2 1.2 0 1 0 0-2.4 1.2 1.2 0 0 0 0 2.4z',
  ],
  salita: ['m4 16.5 5-5 3.5 3.5L20 7.5', 'M14.5 7.5H20v5.5'],
  info: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z', 'M12 11v5.5', 'M12 7.8h.01'],
  avviso: [
    'M10.3 4.3 2.9 17a2 2 0 0 0 1.7 3h14.8a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0z',
    'M12 9.5V14', 'M12 17.2h.01',
  ],
  lampadina: [
    'M9.2 16.5a6 6 0 1 1 5.6 0', 'M9.5 16.5h5v2.2a1.5 1.5 0 0 1-1.5 1.5h-2a1.5 1.5 0 0 1-1.5-1.5z',
  ],
  fuoco: [
    'M12 21c3.3 0 6-2.5 6-5.8 0-4.3-4.4-5.4-3.5-11.2-3 1.4-5 4.2-5 7 0 1-.6 1.6-1.2 1.6-.8 0-1.3-.7-1.3-1.7C5.4 12 6 13.2 6 15.2 6 18.5 8.7 21 12 21z',
  ],
  cappello: [
    'M2.8 8.5 12 4.5l9.2 4-9.2 4z',
    'M6 10.6v4.2c0 1.6 2.7 2.9 6 2.9s6-1.3 6-2.9v-4.2',
  ],
  filtro: ['M4 6.5h16', 'M7 12h10', 'M10 17.5h4'],
  sole: [
    'M12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9z',
    'M12 2.5V4M12 20v1.5M4.2 4.2l1.1 1.1M18.7 18.7l1.1 1.1M2.5 12H4M20 12h1.5M4.2 19.8l1.1-1.1M18.7 5.3l1.1-1.1',
  ],
}

/** Icone che si leggono meglio riempite quando sono attive. */
const PIENE: Partial<Record<NomeIcona, number[]>> = {
  libro: [1],
  stella: [0],
  fuoco: [0],
  luogo: [0],
}

export function Icona({
  nome, size = 22, peso = 1.75, pieno = false, className, style,
}: {
  nome: NomeIcona
  size?: number
  peso?: number
  pieno?: boolean
  className?: string
  style?: React.CSSProperties
}) {
  const tratti = P[nome]
  const riempi = pieno ? (PIENE[nome] ?? tratti.map((_, i) => i)) : []
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor"
      strokeWidth={peso} strokeLinecap="round" strokeLinejoin="round"
      className={className} style={style} aria-hidden="true"
    >
      {tratti.map((d, i) => (
        <path key={i} d={d} fill={riempi.includes(i) ? 'currentColor' : 'none'} />
      ))}
    </svg>
  )
}
