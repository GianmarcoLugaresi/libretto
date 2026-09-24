import { useMemo, useState } from 'react'
import { useApp } from '../lib/store'
import { Icona } from '../components/Icona'
import { AzioneNav, Schermo, Segmentato, Vuoto } from '../components/ui'
import { SchedaLezione } from '../components/SchedaLezione'
import {
  SchedaOrarioUfficiale, corsoDelProfilo, fonteCatalogo, fonteStatica,
} from '../components/SchedaOrarioUfficiale'
import { useCatalogo, useFileCorso } from '../lib/catalogoContesto'
import { anniDelPiano } from '../lib/daCatalogo'
import { lezioniDel } from '../lib/query'
import {
  addGiorni, durata, fmtData, giornoSettimana, minuti,
  oggi as dataOggi, oraOra, settimana,
} from '../lib/date'
import { GIORNI, GIORNI_BREVI, type Giorno, type Lezione } from '../lib/types'
import { tinta, PIENO } from '../lib/tinte'

type Modo = 'giorno' | 'settimana'

/** Altezza di un'ora nella griglia settimanale. */
const H_ORA = 54

export function Orario() {
  const { s } = useApp()
  const [modo, setModo] = useState<Modo>('giorno')
  const [ancora, setAncora] = useState(dataOggi())   // data di riferimento
  const [lezione, setLezione] = useState<Lezione | null>(null)
  // g: il giorno della settimana proposto; d: la data, per una lezione
  // di un giorno solo.
  const [nuova, setNuova] = useState<{ g?: Giorno; d?: string } | null>(null)
  const [importa, setImporta] = useState(false)

  // L'orario pubblicato dalla facoltà, se il corso ce l'ha. Quello
  // trascritto a mano vince su quello del catalogo: è stato
  // controllato riga per riga, il feed etichetta a metà.
  const { indice } = useCatalogo()
  const statico = corsoDelProfilo(s.profilo.catalogoId, s.profilo.corsoDiLaurea)
  const corsoCat = indice?.corsi.find(c => c.codice === s.profilo.codiceCorso)
  const fc = useFileCorso(statico?.orario ? undefined : corsoCat, s.profilo.immatricolazione)
  const fonte = useMemo(
    () => (statico && fonteStatica(statico))
      ?? (fc.orario
        ? fonteCatalogo(fc.orario, fc.piano, s.profilo.corsoDiLaurea, fc.piano ? anniDelPiano(fc.piano) : s.profilo.durataAnni)
        : undefined),
    [statico, fc.orario, fc.piano, s.profilo.corsoDiLaurea, s.profilo.durataAnni],
  )
  const haOrarioUfficiale = !!fonte

  const giorni = settimana(ancora)
  const oggiISO = dataOggi()

  const conSabato = s.lezioni.some(l => l.giorno === 6)
  const giorniVisibili = giorni.slice(0, conSabato ? 6 : 5)

  // La griglia si adatta agli orari veri: se la prima lezione è
  // alle 11 non ha senso mostrare tre ore vuote sopra.
  const [oraMin, oraMax] = useMemo(() => {
    if (s.lezioni.length === 0) return [8, 20]
    let min = 24, max = 0
    for (const l of s.lezioni) {
      min = Math.min(min, Math.floor(minuti(l.inizio) / 60))
      max = Math.max(max, Math.ceil(minuti(l.fine) / 60))
    }
    // Un'ora di respiro in fondo: i blocchi non toccano il bordo e
    // la linea dell'ora corrente resta visibile a fine giornata.
    return [Math.max(0, min), Math.min(24, Math.max(max + 1, min + 4))]
  }, [s.lezioni])

  const ore = Array.from({ length: oraMax - oraMin }, (_, i) => oraMin + i)
  const cfuSettimana = useMemo(() => {
    const visti = new Set<string>()
    let n = 0
    for (const g of giorni) for (const r of lezioniDel(s, g)) {
      if (!visti.has(r.ins.id)) { visti.add(r.ins.id); n += r.ins.cfu }
    }
    return n
  }, [s, giorni])

  const oreSettimana = useMemo(() => {
    let m = 0
    for (const g of giorni) for (const r of lezioniDel(s, g)) {
      m += minuti(r.lezione.fine) - minuti(r.lezione.inizio)
    }
    return m / 60
  }, [s, giorni])

  const lezioniOggi = lezioniDel(s, ancora)
  const adesso = minuti(oraOra())

  // Una settimana vuota può voler dire due cose molto diverse:
  // "non hai lezione" oppure "il semestre non è ancora cominciato".
  // Senza dirlo, la griglia vuota sembra un'app rotta.
  const lezioniInSettimana = giorniVisibili.reduce((n, g) => n + lezioniDel(s, g).length, 0)
  const inizioPeriodo = s.lezioni.map(l => l.dal).filter(Boolean).sort()[0]
  const fini = s.lezioni.map(l => l.al).filter(Boolean).sort()
  const finePeriodo = fini[fini.length - 1]
  const fuoriPeriodo =
    s.lezioni.length > 0 && lezioniInSettimana === 0
      ? inizioPeriodo && giorni[6] < inizioPeriodo
        ? { tipo: 'prima' as const, data: inizioPeriodo }
        : finePeriodo && giorni[0] > finePeriodo
          ? { tipo: 'dopo' as const, data: finePeriodo }
          : { tipo: 'pausa' as const, data: null }
      : null

  return (
    <>
      <Schermo
        titolo="Orario"
        sottotitolo={
          s.lezioni.length === 0
            ? 'Nessuna lezione inserita'
            : <>{oreSettimana.toFixed(0)} ore a settimana · {cfuSettimana} CFU attivi</>
        }
        azioni={
          <>
            {haOrarioUfficiale && (
              <AzioneNav icona="scarica" etichetta="Importa orario ufficiale"
                onClick={() => setImporta(true)} />
            )}
            <AzioneNav icona="piu" etichetta="Nuova lezione" onClick={() => setNuova({ d: ancora })} />
          </>
        }
        sotto={
          <div className="gut stack" style={{ gap: 10 }}>
            <Segmentato
              valore={modo} cambia={setModo}
              opzioni={[{ v: 'giorno', l: 'Giorno' }, { v: 'settimana', l: 'Settimana' }]}
            />
            {modo === 'giorno' && (
              <Segmentato
                className="strip"
                valore={giorniVisibili.includes(ancora) ? ancora : giorniVisibili[0]}
                cambia={setAncora}
                opzioni={giorniVisibili.map(g => {
                  const n = lezioniDel(s, g).length
                  return {
                    v: g,
                    extra: { 'data-oggi': String(g === oggiISO) },
                    l: (
                      <>
                        <span className="caption">{GIORNI_BREVI[giornoSettimana(g)]}</span>
                        <span className="headline num">{g.slice(8, 10)}</span>
                        <span className="strip-pallini">
                          {Array.from({ length: Math.min(n, 4) }, (_, i) => <i key={i} />)}
                        </span>
                      </>
                    ),
                  }
                })}
              />
            )}
          </div>
        }
      >
        {/* Navigazione settimana */}
        <div className="gut settimana-nav">
          <button className="nav-act" onClick={() => setAncora(addGiorni(ancora, -7))} aria-label="Settimana precedente">
            <Icona nome="indietro" size={19} peso={2.2} />
          </button>
          <span className="stack" style={{ gap: 2, alignItems: 'center' }}>
            <span className="foot strong">
              {fmtData(giorni[0], 'breve')} – {fmtData(giorniVisibili[giorniVisibili.length - 1], 'medio')}
            </span>
            {!giorni.includes(oggiISO) && (
              <button className="caption strong torna-oggi" onClick={() => setAncora(oggiISO)}>
                Torna a oggi
              </button>
            )}
          </span>
          <button className="nav-act" onClick={() => setAncora(addGiorni(ancora, 7))} aria-label="Settimana successiva">
            <Icona nome="chevron" size={19} peso={2.2} />
          </button>
        </div>

        {fuoriPeriodo && (
          <section className="gut" style={{ marginTop: 16 }}>
            <div className="card card-pad row" style={{ gap: 12 }}>
              <Icona nome={fuoriPeriodo.tipo === 'prima' ? 'calendario' : 'sole'} size={20} className="dimmer" />
              <div className="grow stack" style={{ gap: 2 }}>
                <span className="callout strong">
                  {fuoriPeriodo.tipo === 'prima' && 'Le lezioni non sono ancora cominciate'}
                  {fuoriPeriodo.tipo === 'dopo' && 'Periodo di lezione concluso'}
                  {fuoriPeriodo.tipo === 'pausa' && 'Settimana senza lezioni'}
                </span>
                <span className="foot dimmer">
                  {fuoriPeriodo.tipo === 'prima' && `Si parte ${fmtData(fuoriPeriodo.data!, 'giorno')}.`}
                  {fuoriPeriodo.tipo === 'dopo' && `Ultimo giorno: ${fmtData(fuoriPeriodo.data!, 'giorno')}.`}
                  {fuoriPeriodo.tipo === 'pausa' && 'Nessuna lezione in questa settimana.'}
                </span>
              </div>
              {fuoriPeriodo.data && (
                <button className="btn btn-secondary btn-sm" style={{ flex: 'none' }}
                  onClick={() => setAncora(fuoriPeriodo.data!)}>
                  Vai
                </button>
              )}
            </div>
          </section>
        )}

        {s.lezioni.length === 0 ? (
          <Vuoto
            icona="orologio"
            titolo="Orario da compilare"
            testo={haOrarioUfficiale
              ? `C'è l'orario ufficiale di ${fonte!.nomeCorso}: lo importo io, tu scegli solo il canale.`
              : 'Inserisci le lezioni una volta sola: si ripetono ogni settimana e finiscono in home ogni mattina.'}
            azione={
              <div className="stack" style={{ gap: 8, alignItems: 'center' }}>
                {haOrarioUfficiale && (
                  <button className="btn btn-primary btn-sm" onClick={() => setImporta(true)}>
                    <Icona nome="scarica" size={15} peso={2.2} /> Importa l'orario ufficiale
                  </button>
                )}
                <button
                  className={haOrarioUfficiale ? 'btn btn-ghost btn-sm' : 'btn btn-primary btn-sm'}
                  onClick={() => setNuova({ d: ancora })}
                >
                  <Icona nome="piu" size={15} peso={2.2} /> Aggiungi a mano
                </button>
              </div>
            }
          />
        ) : modo === 'giorno' ? (
          /* ---------------- Vista giorno ---------------- */
          <section className="gut" style={{ marginTop: 18 }}>
            <div className="between" style={{ marginBottom: 12 }}>
              <span className="headline">{fmtData(ancora, 'giorno')}</span>
              {ancora === oggiISO && <span className="chip chip-accent">Oggi</span>}
            </div>

            {lezioniOggi.length === 0 ? (
              <div className="card">
                <Vuoto icona="sole" titolo="Giornata libera" testo="Nessuna lezione in programma." />
              </div>
            ) : (
              <ol className="timeline">
                {lezioniOggi.map(({ lezione: l, ins }) => {
                  const attiva = ancora === oggiISO
                    && minuti(l.inizio) <= adesso && adesso < minuti(l.fine)
                  const passata = ancora < oggiISO || (ancora === oggiISO && minuti(l.fine) <= adesso)
                  return (
                    <li key={l.id} className="tl-riga" data-passata={passata} style={tinta(ins.tinta)}>
                      <div className="tl-ore num">
                        <span className="foot strong">{l.inizio}</span>
                        <span className="caption dimmer">{l.fine}</span>
                      </div>
                      <div className="tl-rail">
                        <span className="tl-pallino" style={{
                          background: attiva ? PIENO : 'var(--surface)', borderColor: PIENO, color: PIENO,
                        }} />
                      </div>
                      <button
                        className={`tl-card card is-tappable${attiva ? ' card-tinta' : ''}`}
                        onClick={() => setLezione(l)}
                        style={{ textAlign: 'left' }}
                      >
                        <span className="callout strong truncate">{ins.nome}</span>
                        {l.modulo && <span className="foot dim truncate">{l.modulo}</span>}
                        <span className="foot dimmer row" style={{ gap: 8, marginTop: 3, flexWrap: 'wrap' }}>
                          <span>{durata(l.inizio, l.fine)}</span>
                          {(l.aula || l.edificio) && (
                            <span className="row truncate" style={{ gap: 3 }}>
                              <Icona nome="luogo" size={12} peso={1.9} />
                              {[l.aula, l.edificio].filter(Boolean).join(', ')}
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ol>
            )}

            <button className="btn btn-secondary btn-block" style={{ marginTop: 16 }}
              onClick={() => setNuova({ g: giornoSettimana(ancora) as Giorno, d: ancora })}>
              <Icona nome="piu" size={16} peso={2.2} />
              Aggiungi lezione di {GIORNI[giornoSettimana(ancora)].toLowerCase()}
            </button>
          </section>
        ) : (
          /* ---------------- Vista settimana ---------------- */
          <section style={{ marginTop: 14 }}>
            <div className="griglia-wrap">
              <div className="griglia" style={{ ['--h-ora' as string]: `${H_ORA}px` }}>
                {/* colonna delle ore */}
                <div className="gr-ore">
                  <div className="gr-testa" />
                  {ore.map(h => (
                    <div key={h} className="gr-ora num">
                      <span>{String(h).padStart(2, '0')}</span>
                    </div>
                  ))}
                </div>

                {/* una colonna per giorno */}
                {giorniVisibili.map(g => {
                  const voci = lezioniDel(s, g)
                  const isOggi = g === oggiISO
                  return (
                    <div key={g} className="gr-col" data-oggi={isOggi}>
                      <button className="gr-testa gr-testa-btn" onClick={() => { setAncora(g); setModo('giorno') }}>
                        <span className="caption dimmer">{GIORNI_BREVI[giornoSettimana(g)]}</span>
                        <span className="foot strong num" data-oggi={isOggi}>{g.slice(8, 10)}</span>
                      </button>
                      <div className="gr-corpo" style={{ height: ore.length * H_ORA }}>
                        {ore.map(h => <div key={h} className="gr-linea" style={{ top: (h - oraMin) * H_ORA }} />)}

                        {isOggi && adesso >= oraMin * 60 && adesso <= oraMax * 60 && (
                          <div className="gr-adesso" style={{ top: ((adesso - oraMin * 60) / 60) * H_ORA }} />
                        )}

                        {voci.map(({ lezione: l, ins }) => {
                          const top = ((minuti(l.inizio) - oraMin * 60) / 60) * H_ORA
                          const h = ((minuti(l.fine) - minuti(l.inizio)) / 60) * H_ORA
                          return (
                            <button
                              key={l.id} className="gr-blocco" style={{
                                ...tinta(ins.tinta),
                                top, height: Math.max(h - 3, 22),
                              }}
                              onClick={() => setLezione(l)}
                            >
                              <span className="gr-nome">{l.modulo ?? ins.nome}</span>
                              {h > 44 && l.aula && <span className="gr-aula">{l.aula}</span>}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <p className="gut caption dimmer" style={{ marginTop: 14, lineHeight: 1.5 }}>
              Tocca un blocco per modificarlo, l'intestazione di un giorno per aprirlo.
            </p>
          </section>
        )}
      </Schermo>

      <SchedaLezione lezione={lezione} aperto={!!lezione} chiudi={() => setLezione(null)} />
      <SchedaLezione lezione={null} aperto={!!nuova} chiudi={() => setNuova(null)} preGiorno={nuova?.g} preData={nuova?.d} />
      {fonte && (
        <SchedaOrarioUfficiale fonte={fonte} aperto={importa} chiudi={() => setImporta(false)} />
      )}
    </>
  )
}
