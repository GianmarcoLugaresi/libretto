import { useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../lib/store'
import { Icona } from '../components/Icona'
import { Anello, Sezione, Vuoto } from '../components/ui'
import { Poster } from '../components/Poster'
import { Vetro } from '../components/Vetro'
import { immaginePer, immagineLibera } from '../lib/poster'
import { tinta, PIENO, posizioneVoto } from '../lib/tinte'
import {
  lezioniDel, lezioneInCorso, prossimaLezione, prenotazioni, daRegistrare, type LezioneRisolta,
} from '../lib/query'
import { riepilogo, fmtMedia, fmt110 } from '../lib/stats'
import {
  addGiorni, durata, fmtData, giornoSettimana, minuti, oggi as dataOggi, oraOra, quando,
} from '../lib/date'
import { GIORNI } from '../lib/types'
import type { ISO } from '../lib/date'
import type { Vista, Pila } from '../App'
import { NOME_APP } from '../lib/app'

const VUOTE = new Set(['di', 'del', 'della', 'delle', 'dei', 'degli', 'per', 'la', 'le', 'il',
  'lo', 'i', 'gli', 'e', 'ed', 'a', 'al', 'alla', 'in', 'con', 'su', 'un', 'una', 'o', 'dell’', "dell'"])

/** Sigla di due lettere: le iniziali delle parole piene. */
export function sigla(nome: string): string {
  const parole = nome.split(/[\s’']+/).filter(p => p && !VUOTE.has(p.toLowerCase()))
  return (parole.length ? parole : [nome]).slice(0, 2).map(p => p[0]).join('').toUpperCase()
}

/** Corpo del titolo da poster: scala col nome, così anche
 *  "Progettazione strutturale e principi di meccanica per il design"
 *  resta dentro l'eroe. */
function corpoTitolo(nome: string): number {
  const n = nome.length
  if (n <= 22) return 38
  if (n <= 36) return 32
  if (n <= 56) return 27
  return 23
}

function etichettaGiorno(data: ISO, oggi: ISO): string {
  const n = (Date.parse(data) - Date.parse(oggi)) / 86_400_000
  if (n === 0) return 'Oggi'
  if (n === 1) return 'Domani'
  return GIORNI[giornoSettimana(data)]
}

export function Oggi({ vai, apri }: {
  vai: (v: Vista) => void
  apri: (p: Exclude<Pila, null>) => void
}) {
  const { s } = useApp()
  const o = dataOggi()
  const inCorso = lezioneInCorso(s)
  const prossima = prossimaLezione(s)
  const prenotati = prenotazioni(s)
  const sospesi = daRegistrare(s)
  const r = riepilogo(s)
  const ora = minuti(oraOra())
  const nome = s.profilo.nome.trim()

  // La barra col saluto diventa vetro quando il poster è scorso via.
  const scroll = useRef<HTMLDivElement>(null)
  const [collassata, setCollassata] = useState(false)
  useEffect(() => {
    const el = scroll.current
    if (!el) return
    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => setCollassata(el.scrollTop > el.clientHeight * 0.32))
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => { el.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf) }
  }, [])

  // In scena: la lezione in corso, altrimenti la prossima.
  const scena = inCorso
    ? { tipo: 'ora' as const, r: inCorso, data: o }
    : prossima
      ? { tipo: 'prossima' as const, r: prossima.r, data: prossima.data }
      : null

  // Le lezioni dopo quella in scena, nei prossimi sette giorni,
  // raggruppate per giorno.
  const inArrivo = useMemo(() => {
    const gruppi: { data: ISO; voci: LezioneRisolta[] }[] = []
    let conta = 0
    for (let i = 0; i < 8 && conta < 6; i++) {
      const data = addGiorni(o, i)
      const voci = lezioniDel(s, data).filter(v => {
        if (i === 0 && minuti(v.lezione.fine) <= ora) return false
        if (scena && v.lezione.id === scena.r.lezione.id && data === scena.data) return false
        return true
      })
      if (voci.length) {
        const presi = voci.slice(0, 6 - conta)
        gruppi.push({ data, voci: presi })
        conta += presi.length
      }
    }
    return gruppi
  }, [s, o, ora, scena])

  return (
    <div className="scroll" ref={scroll}>
      {/* ---------- Barra: il nome al centro, come un titolo ---------- */}
      <div className="oggi-bar" data-collapsed={collassata}>
        <button className="oggi-nome" onClick={() => apri('impostazioni')} aria-label="Apri il profilo">
          <span className="headline oggi-saluto">{nome || NOME_APP}</span>
          <Icona nome="chevron-giu" size={15} peso={2.4} className="oggi-nome-freccia" />
        </button>
      </div>

      {/* ---------- Eroe: il poster del corso in arrivo ---------- */}
      {scena ? (
        <button className="eroe" onClick={() => vai('orario')}>
          <Poster tinta={scena.r.ins.tinta} sigla={sigla(scena.r.ins.nome)}
            immagine={scena.r.ins.immagine || immaginePer(scena.r.ins.nome)} />
          <span className="eroe-occhiello">
            {scena.tipo === 'ora'
              ? <><span className="polso" style={{ background: 'var(--sapienza)', boxShadow: '0 0 10px var(--accent-glow)' }} />Ora in aula</>
              : scena.data === o ? 'Prossima lezione · oggi' : `Prossima lezione · ${quando(scena.data)}`}
            {scena.r.lezione.modulo && <> · {scena.r.lezione.modulo}</>}
          </span>
          <h1 className="eroe-titolo" style={{ fontSize: corpoTitolo(scena.r.ins.nome) }}>{scena.r.ins.nome}</h1>

          {/* Le quattro cose che contano adesso: quando, dove, quanto */}
          <Vetro as="div" className="eroe-fatti" raggio={22} sfoco={14} forza={36}>
            <span className="fatto">
              <span className="fatto-valore num">{scena.r.lezione.inizio}<span className="fatto-sep">–</span>{scena.r.lezione.fine}</span>
              <span className="fatto-etichetta">orario</span>
            </span>
            <span className="fatto-div" />
            <span className="fatto">
              <span className="fatto-valore">{scena.r.lezione.aula || '—'}</span>
              <span className="fatto-etichetta">{scena.r.lezione.edificio || 'aula'}</span>
            </span>
            <span className="fatto-div" />
            <span className="fatto">
              <span className="fatto-valore num">{durata(scena.r.lezione.inizio, scena.r.lezione.fine)}</span>
              <span className="fatto-etichetta">durata</span>
            </span>
          </Vetro>

          {scena.tipo === 'ora' && (
            <div className="eroe-progresso">
              <div className="bar" style={{ background: 'rgba(0,0,0,0.45)', boxShadow: 'none' }}>
                <div className="bar-fill" style={{
                  width: `${Math.round(((ora - minuti(scena.r.lezione.inizio)) /
                    (minuti(scena.r.lezione.fine) - minuti(scena.r.lezione.inizio))) * 100)}%`,
                }} />
              </div>
              <span className="caption num" style={{ color: '#fff', opacity: 0.8 }}>
                finisce fra {minuti(scena.r.lezione.fine) - ora} minuti
              </span>
            </div>
          )}
        </button>
      ) : (
        <div className="eroe">
          <Poster tinta={null} immagine={immagineLibera()} />
          <span className="eroe-occhiello">{fmtData(o, 'giorno')}</span>
          <h1 className="eroe-titolo" style={{ fontSize: 38 }}>
            {s.lezioni.length === 0 ? 'Orario vuoto' : 'Giornata libera'}
          </h1>
          {s.lezioni.length === 0 && (
            <div className="eroe-azioni">
              <button className="btn btn-primary btn-sm" onClick={() => vai('orario')}>
                <Icona nome="orologio" size={15} peso={2.2} /> Compila l’orario
              </button>
            </div>
          )}
        </div>
      )}

      {/* ---------- Esiti da registrare ---------- */}
      {sospesi.length > 0 && (
        <Sezione stretto>
          <button className="card card-accent card-pad avviso-riga" onClick={() => vai('esami')}>
            <Icona nome="avviso" size={20} style={{ color: 'var(--accent)' }} />
            <div className="grow stack" style={{ gap: 2 }}>
              <span className="callout strong" style={{ color: 'var(--accent)' }}>
                {sospesi.length === 1 ? 'Un esito da registrare' : `${sospesi.length} esiti da registrare`}
              </span>
              <span className="foot" style={{ color: 'var(--accent)', opacity: 0.8 }}>
                {sospesi.slice(0, 2).map(x => x.ins.nome).join(', ')}
                {sospesi.length === 3 && ' e un altro'}
                {sospesi.length > 3 && ` e altri ${sospesi.length - 2}`}
              </span>
            </div>
            <Icona nome="chevron" size={17} peso={2.2} style={{ color: 'var(--accent)' }} />
          </button>
        </Sezione>
      )}

      {/* ---------- Lezioni in arrivo ---------- */}
      <Sezione titolo="In arrivo" stretto>
        {inArrivo.length === 0 ? (
          <div className="card">
            <Vuoto icona="sole" titolo="Nessuna lezione in vista" />
          </div>
        ) : (
          <div className="stack" style={{ gap: 14 }}>
            {inArrivo.map(g => (
              <div key={g.data} className="stack" style={{ gap: 8 }}>
                <span className="foot strong" style={{ paddingInline: 4 }}>
                  {etichettaGiorno(g.data, o)}
                  <span className="dimmer"> · {fmtData(g.data, 'breve')}</span>
                </span>
                <div className="list">
                  {g.voci.map(({ lezione: l, ins }) => (
                    <button key={l.id} className="list-row is-tappable" style={tinta(ins.tinta)} onClick={() => vai('orario')}>
                      <div className="arrivo-ora num">
                        <span className="callout strong">{l.inizio}</span>
                        <span className="caption dimmer">{l.fine}</span>
                      </div>
                      <span className="riga-tinta" style={{ background: PIENO, color: PIENO }} />
                      <div className="grow stack" style={{ gap: 2 }}>
                        <span className="callout strong clamp-2">{ins.nome}</span>
                        {(l.modulo || l.aula || l.edificio) && (
                          <span className="foot dimmer truncate">
                            {[l.modulo, [l.aula, l.edificio].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}
                          </span>
                        )}
                      </div>
                      <Icona nome="chevron" size={16} peso={2.2} className="chev" />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Sezione>

      {/* ---------- Appelli prenotati ---------- */}
      {prenotati.length > 0 && (
        <Sezione titolo="Esami prenotati" destra={
          <button className="foot" style={{ color: 'var(--ink-2)' }} onClick={() => vai('esami')}>Vedi tutti</button>
        }>
          <div className="list">
            {prenotati.slice(0, 3).map(({ appello: a, ins, giorni }) => (
              <button key={a.id} className="list-row is-tappable" onClick={() => vai('esami')} style={tinta(ins.tinta)}>
                <div className="conta" data-vicino={giorni <= 3}>
                  <span className="display-m num">{giorni}</span>
                  <span className="caption">{giorni === 1 ? 'giorno' : 'giorni'}</span>
                </div>
                <div className="grow stack" style={{ gap: 2 }}>
                  <span className="callout strong clamp-2">{ins.nome}</span>
                  <span className="foot dimmer truncate">
                    {fmtData(a.data, 'giorno')}{a.ora && ` · ${a.ora}`}{a.aula && ` · ${a.aula}`}
                  </span>
                </div>
                <Icona nome="chevron" size={17} peso={2.2} className="chev" />
              </button>
            ))}
          </div>
        </Sezione>
      )}

      {/* ---------- Il percorso ---------- */}
      <Sezione titolo="Il tuo percorso" destra={
        <button className="foot" style={{ color: 'var(--ink-2)' }} onClick={() => apri('statistiche')}>Dettagli</button>
      }>
        <Vetro as="button" className="card card-pad stack" raggio={28} sfoco={16} forza={30} interattivo
          style={{ width: '100%', textAlign: 'left', gap: 16 }} onClick={() => apri('statistiche')}>
          <div className="percorso">
            <Anello valore={r.percentuale} size={96} spessore={9}>
              <span className="display-m num">{r.cfuAcquisiti}</span>
              <span className="caption dimmer">di {r.cfuTotali}</span>
            </Anello>
            <div className="grow stack" style={{ gap: 12 }}>
              <div className="stack" style={{ gap: 1 }}>
                <span className="eyebrow">Esami</span>
                <span className="headline num">{r.esamiSuperati}<span className="dimmer">/{r.esamiTotali}</span></span>
              </div>
              <div className="stack" style={{ gap: 1 }}>
                <span className="eyebrow">Base di laurea</span>
                <span className="headline num">{fmt110(r.votoPartenza)}<span className="dimmer">/110</span></span>
              </div>
            </div>
          </div>
          <div className="stack" style={{ gap: 8 }}>
            <div className="between">
              <span className="eyebrow">Media ponderata</span>
              {r.mediaPonderata == null && <span className="caption dimmer">nessun voto ancora</span>}
            </div>
            <div className="spettro-wrap">
              <div className="spettro" data-vuoto={r.mediaPonderata == null}
                style={{ ['--pos' as string]: `${r.mediaPonderata == null ? 50 : posizioneVoto(r.mediaPonderata)}%` }}>
                <span className="spettro-knob">{r.mediaPonderata == null ? '—' : fmtMedia(r.mediaPonderata, 1)}</span>
              </div>
            </div>
            <div className="between caption dimmer num"><span>18</span><span>24</span><span>30</span></div>
          </div>
        </Vetro>
      </Sezione>
    </div>
  )
}
