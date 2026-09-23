/* ============================================================
   Runner della pipeline.

   Un giro completo del catalogo costa tempo: con Crawl-delay 10 le
   sole pagine degli appelli sono ~53 minuti, e i piani di tutti i
   corsi non ci starebbero ogni giorno. Perciò:

     - gli appelli si aggiornano tutti i giorni (cambiano spesso);
     - i piani ruotano su 7 fette, una al giorno (cambiano una
       volta l'anno);
     - i programmi non stanno qui: sono a richiesta dall'app.

   Tutto ciò che è deciso qui è deterministico: stesso giorno,
   stessa fetta, stessi corsi. Nessuna casualità in una pipeline
   che deve essere riproducibile.
   ============================================================ */

import { createHash } from 'node:crypto'
import { Cache } from './cache'
import { controllaAppelli, controllaIndice, controllaPiano } from './controlli'
import { HostNonConsentito, scarica } from './http'
import { appelliPubblicabili, estraiAppelli, soloCoorte } from './parser/appelli'
import { estraiIndice } from './parser/indice'
import { estraiPiano, pianoPubblicabile } from './parser/piano'
import { curatedAdapter } from './orari/curato'
import { gompAdapter } from './orari/gomp'
import type { TimetableAdapter } from './orari/tipi'
import { Pubblicatore, percorsi, stampaRapporto } from './pubblica'
import { Appelli, Indice, Orario, Piano, VERSIONE_SCHEMA, type Corso } from './tipi'

const BASE = 'https://corsidilaurea.uniroma1.it'
export const FETTE = 7

export type Compito = 'indice' | 'appelli' | 'piani' | 'orari'
export const COMPITI: Compito[] = ['indice', 'appelli', 'piani', 'orari']

export interface Opzioni {
  compiti: Compito[]
  /** Solo questi codici corso; vuoto = tutti */
  solo: string[]
  /** Fetta dei piani da fare oggi, 0…FETTE-1; -1 = tutte */
  fetta: number
  /** Tetto di richieste, per le prove */
  limite: number
  radice: string
  cache: string
  curati: string
  /** Non scrivere niente: serve a stimare il costo di un giro */
  secco: boolean
  /** Iniettabili nei test: in produzione restano vuoti e valgono
   *  il fetch vero e il crawl-delay vero. */
  fetchImpl?: typeof fetch
  attesaMs?: number
}

export const predefinite: Opzioni = {
  compiti: COMPITI,
  solo: [],
  fetta: -1,
  limite: Infinity,
  radice: 'data/v1',
  cache: 'pipeline/.cache/etag.json',
  curati: 'pipeline/curated/timetables',
  secco: false,
}

/* ---------------- Argomenti ---------------- */

export function leggiArgomenti(argv: string[], oggi = new Date()): Opzioni {
  const o: Opzioni = { ...predefinite, solo: [...predefinite.solo] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const valore = () => argv[++i] ?? ''
    switch (a) {
      case '--compiti': {
        const chiesti = valore().split(',').map(s => s.trim()).filter(Boolean)
        const ignoti = chiesti.filter(c => !COMPITI.includes(c as Compito))
        if (ignoti.length) throw new Error(`Compiti sconosciuti: ${ignoti.join(', ')}. Validi: ${COMPITI.join(', ')}`)
        o.compiti = chiesti as Compito[]
        break
      }
      case '--solo': o.solo = valore().split(',').map(s => s.trim()).filter(Boolean); break
      case '--fetta': {
        const v = valore()
        // `oggi` rende la rotazione automatica ma ancora deterministica:
        // lo stesso giorno produce sempre la stessa fetta.
        o.fetta = v === 'oggi' ? fettaDelGiorno(oggi) : Number(v)
        if (!Number.isInteger(o.fetta) || o.fetta < -1 || o.fetta >= FETTE) {
          throw new Error(`--fetta vuole «oggi» o un numero fra 0 e ${FETTE - 1}`)
        }
        break
      }
      case '--limite': o.limite = Number(valore()); break
      case '--radice': o.radice = valore(); break
      case '--cache': o.cache = valore(); break
      case '--curati': o.curati = valore(); break
      case '--secco': o.secco = true; break
      default: throw new Error(`Argomento sconosciuto: ${a}`)
    }
  }
  return o
}

/** Giorni dall'epoca modulo FETTE: ruota da sé, senza stato. */
export function fettaDelGiorno(d: Date): number {
  return Math.floor(d.getTime() / 86_400_000) % FETTE
}

/** A quale fetta appartiene un corso. Deriva dal codice, così un
 *  corso cade sempre nella stessa fetta e in una settimana passano
 *  tutti esattamente una volta. */
export function fettaDi(codice: string): number {
  const h = createHash('sha1').update(codice).digest()
  return h.readUInt32BE(0) % FETTE
}

/** I corsi chiesti con --solo, o tutti. Gli appelli si fermano qui:
 *  cambiano di continuo e si rifanno ogni notte per tutti. */
export function richiesti(corsi: Corso[], o: Opzioni): Corso[] {
  return o.solo.length ? corsi.filter(c => o.solo.includes(c.codice)) : corsi
}

/** I corsi di oggi per piani e orari: la fetta si applica solo a
 *  loro, che cambiano una volta l'anno. */
export function selezione(corsi: Corso[], o: Opzioni): Corso[] {
  const scelti = richiesti(corsi, o)
  return o.fetta < 0 ? scelti : scelti.filter(c => fettaDi(c.codice) === o.fetta)
}

/* ---------------- Giro ---------------- */

export interface Diario {
  righe: string[]
  richieste: number
  /** Il tetto di --limite ha fermato almeno una richiesta */
  fermatoDalLimite: boolean
  errori: string[]
}

function registra(d: Diario, riga: string) {
  d.righe.push(riga)
  console.log(riga)
}

export async function esegui(o: Opzioni): Promise<Diario> {
  const d: Diario = { righe: [], richieste: 0, fermatoDalLimite: false, errori: [] }
  const cache = new Cache(o.cache)
  await cache.carica()
  const pub = new Pubblicatore(o.radice)
  await pub.caricaHashPrecedenti()

  const prendi = async (url: string): Promise<string | null> => {
    if (d.richieste >= o.limite) { d.fermatoDalLimite = true; return null }
    d.richieste++
    const r = await scarica(url, { ...cache.prendi(url), fetchImpl: o.fetchImpl, attesaMs: o.attesaMs })
    cache.segna(url, r)
    return r.corpo
  }

  /* --- Indice --- */
  const urlIndice = `${BASE}/it`
  const html = await prendi(urlIndice)
  if (!html) {
    // Un 304 vuol dire che l'indice non è cambiato, e si riusa
    // quello pubblicato invece di fermarsi. Il tetto di --limite è
    // un'altra cosa e va detta con un'altra frase.
    registra(d, d.fermatoDalLimite
      ? 'indice: non scaricato, tetto di --limite raggiunto'
      : 'indice: non cambiato, riuso quello pubblicato')
  }
  const precedente = await pub.precedente(percorsi.indice(), Indice)
  const corsi: Corso[] = html ? estraiIndice(html).corsi : (precedente?.corsi ?? [])
  if (!corsi.length) {
    d.errori.push('Nessun corso: né dalla pagina né dall\'indice pubblicato.')
    return d
  }
  registra(d, `indice: ${corsi.length} corsi`)

  const tutti = richiesti(corsi, o)
  const scelti = selezione(corsi, o)
  registra(d, `selezione: ${tutti.length} corsi per gli appelli, ${scelti.length} per piani e orari (fetta ${o.fetta < 0 ? 'tutte' : o.fetta})`)
  if (o.secco) {
    const costo = stima(scelti.length, o.compiti, tutti.length)
    registra(d, `giro a secco: ~${costo.richieste} richieste, ~${Math.round(costo.minuti)} minuti`)
    return d
  }

  /* --- Appelli --- */
  if (o.compiti.includes('appelli')) {
    for (const c of tutti) {
      const url = `${BASE}/it/course/${c.codice}/attendance/exams`
      try {
        const h = await prendi(url)
        if (!h) continue
        const e = estraiAppelli(h)
        const dati = appelliPubblicabili(
          { ...e, appelli: soloCoorte(e.appelli, c.codice) }, c.codice, url,
        )
        await pub.scrivi(percorsi.appelli(c.codice), dati, Appelli, controllaAppelli)
      } catch (err) { annota(d, `appelli ${c.codice}`, err) }
    }
  }

  /* --- Piani --- */
  if (o.compiti.includes('piani')) {
    // Le coorti vecchie hanno un codice corso diverso (Design:
    // 31807 per 2024/25, 33426 dal 2025/26): la pagina di ciascuna
    // sta sul proprio codice, non su un parametro inventato.
    const daVisitare = scelti.map(c => c.codice)
    const visti = new Set<string>()
    const coortiPerCorso = new Map<string, Corso['coorti']>()

    while (daVisitare.length) {
      const codice = daVisitare.shift()!
      if (visti.has(codice)) continue
      visti.add(codice)
      const url = `${BASE}/it/course/${codice}/attendance/lessons-plan`
      try {
        const h = await prendi(url)
        if (!h) continue
        const e = estraiPiano(h, codice)
        // Il percorso segue il codice che la pagina dichiara, non
        // quello che abbiamo chiesto: dopo un redirect i due
        // divergono, e un file il cui nome contraddice il contenuto
        // è peggio di un file mancante.
        visti.add(e.codiceCorso)
        await pub.scrivi(percorsi.piano(e.codiceCorso, e.coorte), pianoPubblicabile(e, url), Piano, controllaPiano)
        coortiPerCorso.set(e.codiceCorso, e.coorti)
        // Le altre coorti si visitano solo partendo da un corso
        // scelto, altrimenti da una coorte vecchia si risalirebbe a
        // tutto il catalogo.
        if (scelti.some(c => c.codice === codice)) {
          for (const k of e.coorti) {
            if (!visti.has(k.codiceCorso)) daVisitare.push(k.codiceCorso)
          }
        }
      } catch (err) { annota(d, `piano ${codice}`, err) }
    }
    // Le coorti scoperte finiscono nell'indice: è lì che l'app
    // guarda per sapere quali anni può aprire.
    for (const c of corsi) {
      const k = coortiPerCorso.get(c.codice)
      if (k?.length) c.coorti = k
    }
    registra(d, `piani: ${visti.size} pagine visitate`)
  }

  /* --- Orari --- */
  if (o.compiti.includes('orari')) {
    // Il curato viene prima: se qualcuno ha controllato a mano un
    // orario, quello vince su un feed che etichetta a metà.
    const curato = curatedAdapter(o.curati)
    for (const e of curato.errori) d.errori.push(`csv curato: ${e}`)
    const adattatori: TimetableAdapter[] = [curato, gompAdapter()]

    for (const c of scelti) {
      const a = adattatori.find(x => x.enabled && x.supports(c.codice))
      if (!a) continue
      try {
        const esito = await a.fetch(c.codice, { prendi })
        if (!esito.lezioni.length && !esito.nonAttribuite.length) continue
        const coorte = c.coorti[0]?.anno ?? new Date().getFullYear()
        const orario: Orario = {
          schemaVersion: VERSIONE_SCHEMA,
          sources: esito.sources,
          fetchedAt: new Date().toISOString(),
          codiceCorso: c.codice,
          coorte,
          adattatore: a.id,
          semestre: esito.semestre,
          lezioni: esito.lezioni,
          nonAttribuite: esito.nonAttribuite,
        }
        await pub.scrivi(percorsi.orario(c.codice, coorte), orario, Orario)
        if (esito.nonAttribuite.length) {
          registra(d, `orario ${c.codice}: ${esito.nonAttribuite.length} lezioni senza anno/canale dichiarati`)
        }
      } catch (err) { annota(d, `orario ${c.codice}`, err) }
    }
  }

  await pub.scriviIndice(corsi, [urlIndice], controllaIndice)
  await cache.salva()

  registra(d, stampaRapporto(pub.rapporto))
  registra(d, `${d.richieste} richieste`)
  d.errori.push(...pub.rapporto.bloccati.map(b => `bloccato: ${b}`))
  return d
}

function annota(d: Diario, dove: string, err: unknown) {
  // Un host escluso non è un guasto: è una regola che rispettiamo.
  // Va detto una volta, non trattato come errore del job.
  if (err instanceof HostNonConsentito) {
    registra(d, `${dove}: saltato, ${err.message}`)
    return
  }
  const m = `${dove}: ${err instanceof Error ? err.message : String(err)}`
  d.errori.push(m)
  console.error(m)
}

/** Stima del costo di un giro, per decidere se ci sta in un job. */
export function stima(corsi: number, compiti: Compito[], perAppelli = corsi): { richieste: number; minuti: number } {
  let richieste = 1
  if (compiti.includes('appelli')) richieste += perAppelli
  if (compiti.includes('piani')) richieste += Math.round(corsi * 1.8) // ~1,8 coorti per corso
  if (compiti.includes('orari')) richieste += corsi * 5 // 5 mesi di feed
  return { richieste, minuti: (richieste * 10) / 60 }
}

/* ---------------- main ---------------- */

const invocatoDaRiga = process.argv[1]?.includes('esegui')
if (invocatoDaRiga) {
  const o = leggiArgomenti(process.argv.slice(2))
  esegui(o)
    .then(d => {
      if (d.errori.length) {
        console.error(`\n${d.errori.length} problemi:`)
        for (const e of d.errori) console.error(`  ${e}`)
        process.exit(1)
      }
      console.log('\nfatto')
    })
    .catch(e => { console.error(e); process.exit(1) })
}
