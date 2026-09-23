/* ============================================================
   Anonimizzazione di un HAR catturato dal browser.

   Un HAR è la registrazione completa del traffico: contiene i
   cookie di sessione, i token, e tutto quello che le pagine hanno
   scambiato. Mandarlo così com'è significherebbe consegnare la
   propria sessione Infostud a chiunque lo legga, e finirebbe in un
   repository pubblico.

   Questo strumento tiene la FORMA delle risposte — che è l'unica
   cosa che serve per scrivere il mapper — e butta via i valori.

   Due scelte deliberate:

   - Si redige per *lista di ciò che si tiene*, non per lista di ciò
     che si toglie. Un campo nuovo, mai visto, viene redatto: se
     sbaglia, sbaglia verso la prudenza.
   - Ogni valore redatto diventa sempre lo stesso segnaposto. Così
     si continua a vedere che il «12345» di una risposta è lo stesso
     «12345» di un'altra, che è un'informazione strutturale, senza
     mai vedere il numero.
   ============================================================ */

/** Chiavi il cui valore è una struttura, non un dato personale:
 *  queste passano. Tutto il resto viene redatto. */
const DA_TENERE = new Set([
  // identificativi di didattica, non di persona
  'codice', 'code', 'codiceinsegnamento', 'codiceattivita', 'codicecorso',
  'codiceesame', 'codiceappello', 'codicecdl', 'cod', 'id', 'uuid',
  'ssd', 'lingua', 'language',
  // struttura del piano
  'cfu', 'crediti', 'credits', 'peso', 'anno', 'annocorso', 'semestre',
  'periodo', 'tipo', 'type', 'stato', 'status', 'esito',
  'obbligatorio', 'opzionale', 'gruppo', 'curriculum', 'canale', 'partizione',
  // nomi di cose, non di persone
  'nomeinsegnamento', 'denominazioneinsegnamento', 'descrizione', 'description',
  'titolo', 'title', 'nomecorso', 'denominazionecorso', 'corso',
  'aula', 'edificio', 'sede',
  // date e conteggi
  'data', 'date', 'datainizio', 'datafine', 'dataappello', 'dataesame',
  'dataprenotazione', 'scadenza', 'ora', 'orainizio', 'orafine',
  'totale', 'count', 'numero', 'pagina', 'page', 'size',
  // forma delle risposte
  'success', 'ok', 'error', 'errore', 'message', 'messaggio',
])

/** Voti e lodi: si tengono i *tipi*, non i valori. Vanno sostituiti
 *  con numeri plausibili, perché la fixture finirà in un repository
 *  pubblico e un voto è un dato personale a tutti gli effetti. */
const VOTI = new Set(['voto', 'votazione', 'grade', 'mark', 'valutazione', 'media', 'mediaponderata', 'mediaaritmetica'])
const LODI = new Set(['lode', 'conlode', 'honours', 'cumlaude'])

/** Header che non devono sopravvivere in nessun caso. */
const HEADER_VIETATI = /cookie|authorization|auth|token|session|csrf|xsrf|api-?key|bearer|set-cookie|x-forwarded|remote-addr/i

/** Cose che non devono restare nemmeno dentro a una stringa
 *  qualsiasi, perché a volte i token viaggiano in posti strani. */
const VELENI: [RegExp, string][] = [
  [/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g, '«jwt»'],
  [/\b[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]\b/g, '«codice-fiscale»'],
  [/[\w.+-]+@[\w-]+\.[\w.]{2,}/g, '«email»'],
  [/\b(?:\+39[\s.-]?)?3\d{2}[\s.-]?\d{6,7}\b/g, '«telefono»'],
  // Su Infostud la credenziale è un UUID (il parametro `ingresso`) e
  // le risposte ne rimandano indietro uno in `output`. Nessun UUID
  // serve al mapper, che aggancia per codice: si tolgono ovunque,
  // anche sotto chiavi che di solito si tengono come `id`.
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '«uuid»'],
  [/\b[A-Za-z0-9+/=_-]{40,}\b/g, '«stringa-lunga»'],
]

export interface Rapporto {
  /** chiave → quante volte è stata redatta. Solo conteggi: i valori
   *  non compaiono mai qui, altrimenti tanto varrebbe non redigere. */
  redatte: Record<string, number>
  headerTolti: Record<string, number>
  velenoTrovato: Record<string, number>
  vociTolte: number
  vociTenute: number
}

export function rapportoVuoto(): Rapporto {
  return { redatte: {}, headerTolti: {}, velenoTrovato: {}, vociTolte: 0, vociTenute: 0 }
}

/** I segni diacritici che NFD stacca dalle lettere. */
const SEGNI_DIACRITICI = new RegExp('[\\u0300-\\u036f]', 'g')

const chiave = (k: string) => k.normalize('NFD').replace(SEGNI_DIACRITICI, '').toLowerCase().replace(/[^a-z0-9]/g, '')

/** Lo stesso valore dà sempre lo stesso segnaposto: si continua a
 *  vedere quali campi coincidono fra risposte diverse. */
export class Segnaposti {
  private visti = new Map<string, number>()
  per(etichetta: string, valore: unknown): string {
    // Chiave JSON invece di un separatore: un carattere che «non
    // capita mai» capita, e un carattere di controllo nel sorgente
    // è invisibile e si perde nei passaggi.
    const k = JSON.stringify([etichetta, String(valore)])
    if (!this.visti.has(k)) this.visti.set(k, this.visti.size + 1)
    return `«${etichetta}-${this.visti.get(k)}»`
  }
}

function ripulisciTesto(t: string, r: Rapporto): string {
  let out = t
  for (const [re, con] of VELENI) {
    out = out.replace(re, () => {
      r.velenoTrovato[con] = (r.velenoTrovato[con] ?? 0) + 1
      return con
    })
  }
  return out
}

/** Un voto plausibile, derivato dal valore vero in modo stabile ma
 *  non invertibile a occhio: due esami con voto uguale restano
 *  uguali, e nessuno dei due è il voto vero. */
function votoFinto(originale: unknown): number {
  const s = String(originale)
  let h = 7
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return 18 + (h % 13)
}

/** Un numero della stessa *forma*: stesse cifre, stesso segno, ma
 *  un altro numero. Che una matricola sia a sette cifre è una cosa
 *  che devo vedere; quale matricola sia, no. */
function numeroFinto(originale: number, segnaposto: string): number {
  const cifre = Math.trunc(Math.abs(originale)).toString().length
  const n = Number(segnaposto.replace(/\D/g, '')) || 1
  const base = 10 ** (cifre - 1)
  const finto = cifre > 1 ? base + (n * 7919) % (base * 9) : n % 10
  return originale < 0 ? -finto : finto
}

export function anonimizzaValore(
  valore: unknown, nomeChiave: string, r: Rapporto, s = new Segnaposti(), profondita = 0,
): unknown {
  if (profondita > 40) return '«troppo-profondo»'
  if (valore === null || valore === undefined) return valore
  if (Array.isArray(valore)) return valore.map(v => anonimizzaValore(v, nomeChiave, r, s, profondita + 1))

  if (typeof valore === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(valore as Record<string, unknown>)) {
      out[k] = anonimizzaValore(v, k, r, s, profondita + 1)
    }
    return out
  }

  const k = chiave(nomeChiave)

  if (VOTI.has(k)) {
    r.redatte[nomeChiave] = (r.redatte[nomeChiave] ?? 0) + 1
    r.vociTolte++
    // Il tipo va conservato: un mapper che riceve "28" invece di 28
    // si comporta diversamente, ed è proprio quello che devo vedere.
    return typeof valore === 'number' ? votoFinto(valore) : String(votoFinto(valore))
  }

  if (LODI.has(k)) {
    r.vociTenute++
    return valore   // vero/falso non identifica nessuno
  }

  if (DA_TENERE.has(k)) {
    r.vociTenute++
    return typeof valore === 'string' ? ripulisciTesto(valore, r) : valore
  }

  // Booleani e numeri piccoli sono quasi sempre struttura. Un numero
  // grande invece può essere una matricola, e si redige.
  if (typeof valore === 'boolean') { r.vociTenute++; return valore }
  if (typeof valore === 'number' && Math.abs(valore) < 1000) { r.vociTenute++; return valore }

  r.redatte[nomeChiave] = (r.redatte[nomeChiave] ?? 0) + 1
  r.vociTolte++
  if (typeof valore === 'number') return numeroFinto(valore, s.per(nomeChiave, valore))
  return s.per(nomeChiave, valore)
}

/* ---------------- HAR ---------------- */

interface Header { name: string; value: string }
interface VoceHar {
  request?: { url?: string; method?: string; headers?: Header[]; cookies?: unknown[]; queryString?: Header[]; postData?: { text?: string; mimeType?: string } }
  response?: { status?: number; headers?: Header[]; cookies?: unknown[]; content?: { text?: string; mimeType?: string; size?: number } }
  [k: string]: unknown
}

function filtraHeader(h: Header[] | undefined, r: Rapporto): Header[] {
  if (!h) return []
  const tenuti: Header[] = []
  for (const x of h) {
    if (HEADER_VIETATI.test(x.name)) {
      const n = x.name.toLowerCase()
      r.headerTolti[n] = (r.headerTolti[n] ?? 0) + 1
      // Il *fatto* che l'header ci fosse è l'informazione che serve
      // per capire come funziona l'autenticazione. Il valore no.
      tenuti.push({ name: x.name, value: '«tolto»' })
    } else {
      tenuti.push({ name: x.name, value: ripulisciTesto(x.value, r) })
    }
  }
  return tenuti
}

/** Toglie dall'URL tutto ciò che sta dopo il path: query e frammento
 *  portano spesso matricola o token. Il path si tiene, perché è
 *  l'endpoint, ma i segmenti che sembrano identificatori si redigono. */
export function ripulisciUrl(url: string, r: Rapporto, s = new Segnaposti()): string {
  let u: URL
  try { u = new URL(url) } catch { return '«url-illeggibile»' }
  const segmenti = u.pathname.split('/').map(seg => {
    if (/^\d{4,}$/.test(seg)) { r.vociTolte++; return s.per('id-nel-path', seg) }
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(seg)) { r.vociTolte++; return s.per('uuid-nel-path', seg) }
    return seg
  })
  const query = [...u.searchParams.keys()]
  // I nomi dei parametri servono, i valori no.
  const q = query.length ? `?${query.map(k => `${k}=«valore»`).join('&')}` : ''
  return `${u.origin}${segmenti.join('/')}${q}`
}

function corpo(testo: string | undefined, r: Rapporto, s: Segnaposti): string | undefined {
  if (!testo) return testo
  try {
    return JSON.stringify(anonimizzaValore(JSON.parse(testo), 'radice', r, s))
  } catch {
    // Non è JSON: probabilmente HTML o un form. Non si prova a
    // capirlo, si tiene solo quanto era grande.
    return `«non-json, ${testo.length} caratteri»`
  }
}

export function anonimizzaHar(har: unknown, r = rapportoVuoto()): { har: unknown; rapporto: Rapporto } {
  const s = new Segnaposti()
  const d = har as { log?: { entries?: VoceHar[] } }
  const voci = d?.log?.entries ?? []

  const pulite = voci.map((v): VoceHar => ({
    startedDateTime: (v as Record<string, unknown>).startedDateTime,
    request: {
      method: v.request?.method,
      url: ripulisciUrl(v.request?.url ?? '', r, s),
      headers: filtraHeader(v.request?.headers, r),
      // I cookie non si redigono: si tolgono. Non c'è niente da
      // imparare dal loro contenuto, e tenerli sarebbe un rischio
      // per un guadagno nullo.
      cookies: [],
      queryString: (v.request?.queryString ?? []).map(q => ({ name: q.name, value: '«valore»' })),
      postData: v.request?.postData
        ? { mimeType: v.request.postData.mimeType, text: corpo(v.request.postData.text, r, s) }
        : undefined,
    },
    response: {
      status: v.response?.status,
      headers: filtraHeader(v.response?.headers, r),
      cookies: [],
      content: {
        mimeType: v.response?.content?.mimeType,
        size: v.response?.content?.size,
        text: corpo(v.response?.content?.text, r, s),
      },
    },
  }))

  return {
    har: { log: { version: '1.2', creator: { name: 'anonimizza-har', version: '1' }, entries: pulite } },
    rapporto: r,
  }
}

/** Solo le chiamate che somigliano a dati: le immagini, i font e i
 *  CSS non servono e gonfiano il file. */
export function soloDati(har: unknown): unknown {
  const d = har as { log?: { entries?: VoceHar[] } }
  const voci = (d?.log?.entries ?? []).filter(v => {
    const tipo = v.response?.content?.mimeType ?? ''
    const url = v.request?.url ?? ''
    if (/image|font|css|javascript|octet-stream/i.test(tipo)) return false
    if (/\.(png|jpe?g|gif|svg|webp|woff2?|ttf|css|js|map|ico)(\?|$)/i.test(url)) return false
    return true
  })
  return { log: { entries: voci } }
}

export function stampaRapporto(r: Rapporto): string {
  const riga = (t: Record<string, number>) =>
    Object.entries(t).sort((a, b) => b[1] - a[1]).map(([k, n]) => `    ${k} (${n})`).join('\n') || '    nessuno'
  return [
    `Campi tenuti: ${r.vociTenute} · redatti: ${r.vociTolte}`,
    '  Chiavi redatte:', riga(r.redatte),
    '  Header svuotati:', riga(r.headerTolti),
    '  Trovati e tolti dal testo:', riga(r.velenoTrovato),
  ].join('\n')
}
