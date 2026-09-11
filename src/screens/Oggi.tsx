import { useMemo, useState } from 'react'
import { useApp } from '../lib/store'
import { Icona } from '../components/Icona'
import { Anello, AzioneNav, Schermo, Sezione, Vuoto } from '../components/ui'
import { SchedaEsame } from '../components/SchedaEsame'
import { SchedaInsegnamento } from '../components/SchedaInsegnamento'
import { tinta, PIENO, TESTO, posizioneVoto } from '../lib/tinte'
import {
  lezioniDel, lezioneInCorso, prossimaLezione, prenotazioni, daRegistrare, esameDi,
} from '../lib/query'
import { riepilogo, fmtMedia, fmt110, portaCfu } from '../lib/stats'
import {
  annoAccademico, durata, fmtData, minuti, oggi as dataOggi, oraOra, quando, semestreCorrente,
} from '../lib/date'
import { plurale } from '../lib/testo'
import type { Insegnamento } from '../lib/types'
import type { Vista, Pila } from '../App'

function saluto(): string {
  const h = new Date().getHours()
  if (h < 5) return 'Buonanotte'
  if (h < 13) return 'Buongiorno'
  if (h < 18) return 'Buon pomeriggio'
  return 'Buonasera'
}

const VUOTE = new Set(['di', 'del', 'della', 'delle', 'dei', 'degli', 'per', 'la', 'le', 'il',
  'lo', 'i', 'gli', 'e', 'ed', 'a', 'al', 'alla', 'in', 'con', 'su', 'un', 'una', 'o', 'dell’', "dell'"])

/** Sigla di due lettere per la tile: le iniziali delle parole piene. */
export function sigla(nome: string): string {
  const parole = nome.split(/[\s’']+/).filter(p => p && !VUOTE.has(p.toLowerCase()))
  const s = (parole.length ? parole : [nome]).slice(0, 2).map(p => p[0]).join('')
  return s.toUpperCase()
}

export function Oggi({ vai, apri }: {
  vai: (v: Vista) => void
  apri: (p: Exclude<Pila, null>) => void
}) {
  const { s } = useApp()
  const o = dataOggi()
  const lezioni = lezioniDel(s, o)
  const inCorso = lezioneInCorso(s)
  const prossima = prossimaLezione(s)
  const prenotati = prenotazioni(s)
  const sospesi = daRegistrare(s)
  const r = riepilogo(s)
  const ora = minuti(oraOra())
  const nome = s.profilo.nome.trim()

  const [aperto, setAperto] = useState<Insegnamento | null>(null)
  const [modifica, setModifica] = useState<Insegnamento | null>(null)

  // I corsi "in cartellone": quelli del semestre in corso per il tuo
  // anno; se non ce ne sono, tutti quelli ancora da chiudere.
  const cartellone = useMemo(() => {
    const sem = semestreCorrente()
    const anno = s.profilo.annoCorrente
    const del = s.insegnamenti.filter(i =>
      i.anno === anno && (sem === 0 || i.semestre === sem || i.semestre === 0))
    const base = del.length ? del : s.insegnamenti.filter(i => !portaCfu(esameDi(s, i.id)))
    return [...base].sort((a, b) =>
      (a.semestre || 3) - (b.semestre || 3) || a.nome.localeCompare(b.nome, 'it'))
  }, [s])

  // Il manifesto mostra la cosa più viva: la lezione in corso, poi
  // la prossima, altrimenti la giornata stessa.
  const scena = inCorso
    ? { tipo: 'ora' as const, ins: inCorso.ins, lez: inCorso.lezione, data: o }
    : prossima
      ? { tipo: 'prossima' as const, ins: prossima.r.ins, lez: prossima.r.lezione, data: prossima.data }
      : null

  return (
    <>
      <Schermo
        titolo={nome ? `${saluto()}, ${nome}` : saluto()}
        sottotitolo={<>{fmtData(o, 'giorno')} · a.a. {annoAccademico()}</>}
        azioni={
          <>
            <AzioneNav icona="bussola" etichetta="Esplora i corsi" onClick={() => apri('esplora')} />
            <AzioneNav icona="ingranaggio" etichetta="Impostazioni" onClick={() => apri('impostazioni')} />
          </>
        }
      >
        {/* ---------- Manifesto ---------- */}
        <section className="gut" style={{ marginTop: 6 }}>
          {scena ? (
            <button className="manifesto" style={tinta(scena.ins.tinta)} onClick={() => vai('orario')}>
              <div className="manifesto-sopra">
                <span className="chip">
                  {scena.tipo === 'ora'
                    ? <><span className="polso" style={{ background: PIENO }} />Ora in aula</>
                    : scena.data === o ? 'Prossima lezione' : quando(scena.data)}
                </span>
                <span className="chip num">{scena.lez.inizio}–{scena.lez.fine}</span>
              </div>
              <h2 className="hero-l manifesto-titolo">{scena.ins.nome}</h2>
              <div className="manifesto-chips">
                {(scena.lez.aula || scena.lez.edificio) && (
                  <span className="chip"><Icona nome="luogo" size={12} peso={2.2} />
                    {[scena.lez.aula, scena.lez.edificio].filter(Boolean).join(', ')}</span>
                )}
                <span className="chip num">{durata(scena.lez.inizio, scena.lez.fine)}</span>
                <span className="chip num">{scena.ins.cfu} CFU</span>
              </div>
              {scena.tipo === 'ora' && (
                <div className="stack" style={{ gap: 5, marginTop: 14 }}>
                  <div className="bar" style={{ background: 'rgba(0,0,0,0.35)' }}>
                    <div className="bar-fill" style={{
                      background: PIENO,
                      width: `${Math.round(((ora - minuti(scena.lez.inizio)) /
                        (minuti(scena.lez.fine) - minuti(scena.lez.inizio))) * 100)}%`,
                    }} />
                  </div>
                  <span className="caption num" style={{ color: TESTO }}>
                    finisce fra {minuti(scena.lez.fine) - ora} minuti
                  </span>
                </div>
              )}
            </button>
          ) : (
            <div className="manifesto manifesto-neutro">
              <div className="manifesto-sopra">
                <span className="chip">{s.lezioni.length === 0 ? 'Orario vuoto' : 'Giornata libera'}</span>
                <span className="chip">{fmtData(o, 'breve')}</span>
              </div>
              <h2 className="hero-l manifesto-titolo">
                {s.lezioni.length === 0 ? 'Oggi' : 'Nessuna lezione'}
              </h2>
              <p className="sub dim" style={{ marginTop: 8, maxWidth: 300 }}>
                {s.lezioni.length === 0
                  ? 'Compila l’orario una volta sola: ogni mattina qui trovi cosa ti aspetta.'
                  : 'Niente in aula nei prossimi giorni. Buon momento per un ripasso.'}
              </p>
              {s.lezioni.length === 0 && (
                <div className="manifesto-azioni">
                  <button className="btn btn-primary btn-sm" onClick={() => vai('orario')}>
                    <Icona nome="orologio" size={15} peso={2.2} /> Compila l’orario
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

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

        {/* ---------- In cartellone: i corsi come tile ---------- */}
        {cartellone.length > 0 && (
          <Sezione titolo="In cartellone" destra={
            <button className="foot" style={{ color: 'var(--ink-2)' }} onClick={() => vai('libretto')}>Libretto</button>
          }>
            <div className="tile-row">
              {cartellone.map(i => {
                const e = esameDi(s, i.id)
                const k = portaCfu(e) ? 'pass' : e.stato === 'prenotato' ? 'plan' : null
                return (
                  <button key={i.id} className="tile-item" onClick={() => setAperto(i)} aria-label={i.nome}>
                    <span className="tile" style={tinta(i.tinta)}>
                      <span className="tile-sigla">{sigla(i.nome)}</span>
                      {k === 'pass' && (
                        <span className="tile-badge" data-k="pass">
                          {e.stato === 'idoneo' ? 'ID' : e.lode ? '30L' : e.voto}
                        </span>
                      )}
                      {k === 'plan' && <span className="tile-badge" data-k="plan"><Icona nome="calendario" size={11} peso={2.6} /></span>}
                    </span>
                    <span className="tile-nome clamp-2">{i.nome}</span>
                  </button>
                )
              })}
            </div>
          </Sezione>
        )}

        {/* ---------- La giornata ---------- */}
        <Sezione
          titolo="La giornata"
          destra={lezioni.length > 0 && <span className="foot dimmer num">{plurale(lezioni.length, 'lezione', 'lezioni')}</span>}
        >
          {lezioni.length === 0 ? (
            <div className="card">
              <Vuoto icona="sole" titolo="Niente in aula oggi"
                testo={s.lezioni.length === 0 ? 'L’orario è ancora vuoto.' : 'Giornata libera.'} />
            </div>
          ) : (
            <ol className="timeline">
              {lezioni.map(({ lezione: l, ins }) => {
                const passata = minuti(l.fine) <= ora
                const attiva = minuti(l.inizio) <= ora && ora < minuti(l.fine)
                return (
                  <li key={l.id} className="tl-riga" data-passata={passata} style={tinta(ins.tinta)}>
                    <div className="tl-ore num">
                      <span className="foot strong">{l.inizio}</span>
                      <span className="caption dimmer">{l.fine}</span>
                    </div>
                    <div className="tl-rail">
                      <span className="tl-pallino" style={{ background: attiva ? PIENO : 'var(--surface)', borderColor: PIENO, color: PIENO }} />
                    </div>
                    <button className={`tl-card card is-tappable${attiva ? ' card-tinta' : ''}`} style={{ textAlign: 'left' }}
                      onClick={() => vai('orario')}>
                      <span className="callout strong">{ins.nome}</span>
                      {(l.aula || l.edificio) && (
                        <span className="foot dimmer row truncate" style={{ gap: 4, marginTop: 3 }}>
                          <Icona nome="luogo" size={13} peso={1.9} />
                          {[l.aula, l.edificio].filter(Boolean).join(', ')}
                        </span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ol>
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
          <button className="foot" style={{ color: 'var(--ink-2)' }} onClick={() => vai('statistiche')}>Dettagli</button>
        }>
          <button className="card card-pad stack" style={{ width: '100%', textAlign: 'left', gap: 16 }} onClick={() => vai('statistiche')}>
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
                <div className="spettro" style={{ ['--pos' as string]: `${r.mediaPonderata == null ? 0 : posizioneVoto(r.mediaPonderata)}%` }}>
                  <span className="spettro-knob">{r.mediaPonderata == null ? '—' : fmtMedia(r.mediaPonderata, 1)}</span>
                </div>
              </div>
              <div className="between caption dimmer num"><span>18</span><span>24</span><span>30</span></div>
            </div>
          </button>
        </Sezione>
      </Schermo>

      <SchedaEsame ins={aperto} chiudi={() => setAperto(null)} apriModifica={i => { setAperto(null); setModifica(i) }} />
      <SchedaInsegnamento ins={modifica} aperto={!!modifica} chiudi={() => setModifica(null)} />
    </>
  )
}
