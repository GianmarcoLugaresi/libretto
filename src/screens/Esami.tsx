import { useMemo, useState } from 'react'
import { useApp } from '../lib/store'
import { Icona } from '../components/Icona'
import { AzioneNav, Schermo, Segmentato, Vuoto } from '../components/ui'
import { SchedaAppello } from '../components/SchedaAppello'
import { SchedaEsame } from '../components/SchedaEsame'
import { SchedaInsegnamento } from '../components/SchedaInsegnamento'
import { appelliFuturi, daRegistrare, esameDi } from '../lib/query'
import { portaCfu, fmtVoto } from '../lib/stats'
import { fmtData, meseAnno, oggi, quando, sessione } from '../lib/date'
import { LABEL_PROVA, type Appello, type Insegnamento } from '../lib/types'
import { plurale } from '../lib/testo'
import { tinta, PIENO, coloreVoto } from '../lib/tinte'

type Vista = 'arrivo' | 'pianificare' | 'storico'

export function Esami() {
  const { s } = useApp()
  const [vista, setVista] = useState<Vista>('arrivo')
  const [appello, setAppello] = useState<Appello | null>(null)
  const [nuovo, setNuovo] = useState<{ pre?: string } | null>(null)
  const [esameAperto, setEsameAperto] = useState<Insegnamento | null>(null)
  const [modifica, setModifica] = useState<Insegnamento | null>(null)

  const futuri = appelliFuturi(s)
  const sospesi = daRegistrare(s)
  const prenotatiN = futuri.filter(a => a.prenotato).length

  const daFare = useMemo(
    () => s.insegnamenti
      .filter(i => !portaCfu(esameDi(s, i.id)))
      .sort((a, b) => a.anno - b.anno || (a.semestre || 3) - (b.semestre || 3) || a.nome.localeCompare(b.nome, 'it')),
    [s],
  )

  const storico = useMemo(() => {
    const voci = s.insegnamenti
      .map(i => ({ ins: i, e: esameDi(s, i.id) }))
      .filter(x => (x.e.stato === 'superato' || x.e.stato === 'idoneo') && x.e.data)
      .sort((a, b) => (b.e.data ?? '').localeCompare(a.e.data ?? ''))
    // Raggruppati per sessione: è così che uno ricorda gli esami
    // ("quelli di gennaio", non "quelli del 2025-01-14").
    const g = new Map<string, typeof voci>()
    for (const v of voci) {
      const d = v.e.data!
      const k = `${sessione(d).nome} ${d.slice(0, 4)}`
      g.set(k, [...(g.get(k) ?? []), v])
    }
    return Array.from(g.entries())
  }, [s])

  return (
    <>
      <Schermo
        titolo="Esami"
        sottotitolo={
          prenotatiN > 0
            ? <>{plurale(prenotatiN, 'prenotazione attiva', 'prenotazioni attive')}</>
            : <>{plurale(daFare.length, 'esame da sostenere', 'esami da sostenere')}</>
        }
        azioni={<AzioneNav icona="piu" etichetta="Nuovo appello" onClick={() => setNuovo({})} />}
        sotto={
          <div className="gut">
            <Segmentato
              valore={vista} cambia={setVista}
              opzioni={[
                { v: 'arrivo', l: 'In arrivo' },
                { v: 'pianificare', l: 'Da fare' },
                { v: 'storico', l: 'Storico' },
              ]}
            />
          </div>
        }
      >
        {/* ---- Esiti da chiudere ---- */}
        {sospesi.length > 0 && (
          <section className="gut" style={{ marginTop: 16 }}>
            <div className="card card-accent card-pad stack" style={{ gap: 12 }}>
              <div className="row" style={{ gap: 8 }}>
                <Icona nome="avviso" size={18} style={{ color: 'var(--accent)' }} />
                <span className="callout strong" style={{ color: 'var(--accent)' }}>
                  {sospesi.length === 1 ? 'Com’è andata?' : 'Come sono andati?'}
                </span>
              </div>
              <p className="foot" style={{ color: 'var(--accent)', opacity: 0.85, marginTop: -4 }}>
                Questi appelli sono passati e la prenotazione è ancora aperta.
              </p>
              <div className="stack" style={{ gap: 6 }}>
                {sospesi.map(({ appello: a, ins }) => (
                  <button key={a.id} className="sospeso" onClick={() => setEsameAperto(ins)}>
                    <div className="grow stack" style={{ gap: 1 }}>
                      <span className="callout strong truncate">{ins.nome}</span>
                      <span className="foot dimmer">{fmtData(a.data, 'giorno')}</span>
                    </div>
                    <span className="btn btn-primary btn-sm">Registra</span>
                  </button>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ---- In arrivo ---- */}
        {vista === 'arrivo' && (
          futuri.length === 0 ? (
            <Vuoto
              icona="calendario"
              titolo="Nessun appello in programma"
              testo="Aggiungi le date che trovi su Infostud: te le ritrovi in home col conto alla rovescia."
              azione={
                <button className="btn btn-primary btn-sm" onClick={() => setNuovo({})}>
                  <Icona nome="piu" size={15} peso={2.2} /> Aggiungi appello
                </button>
              }
            />
          ) : (
            raggruppaPerMese(futuri).map(([mese, voci]) => (
              <section key={mese} className="gut" style={{ marginTop: 22 }}>
                <div className="list-hdr" style={{ paddingTop: 0 }}>
                  <span className="eyebrow">{mese}</span>
                  <span className="foot dimmer num">{voci.length}</span>
                </div>
                <div className="list">
                  {voci.map(({ appello: a, ins, prenotato }) => (
                    <button key={a.id} className="list-row is-tappable" style={tinta(ins.tinta)}
                      onClick={() => setAppello(a)}>
                      <div className="data-blocco" data-on={prenotato}>
                        <span className="display-m num">{a.data.slice(8, 10)}</span>
                        <span className="caption">{fmtData(a.data, 'giorno').split(' ')[0].slice(0, 3)}</span>
                      </div>
                      <div className="grow stack" style={{ gap: 2 }}>
                        <span className="callout strong clamp-2">{ins.nome}</span>
                        <span className="foot dimmer truncate">
                          {[a.ora, LABEL_PROVA[a.tipo], a.aula].filter(Boolean).join(' · ')}
                        </span>
                        {a.iscrizioneAl && a.iscrizioneAl >= oggi() && (
                          <span className="foot" style={{ color: 'var(--plan)' }}>
                            Iscrizioni fino al {fmtData(a.iscrizioneAl, 'breve')}
                          </span>
                        )}
                      </div>
                      <div className="stack" style={{ alignItems: 'flex-end', gap: 4, flex: 'none', maxWidth: 96 }}>
                        {prenotato
                          ? <span className="chip chip-plan"><Icona nome="check" size={11} peso={3} />Prenotato</span>
                          : <span className="chip chip-outline">Libero</span>}
                        <span className="caption dimmer num" style={{ textAlign: 'right' }}>{quando(a.data)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            ))
          )
        )}

        {/* ---- Da pianificare ---- */}
        {vista === 'pianificare' && (
          daFare.length === 0 ? (
            <Vuoto icona="stella" titolo="Li hai fatti tutti" testo="Non resta nessun esame da sostenere nel piano." />
          ) : (
            <>
              <section className="gut" style={{ marginTop: 18 }}>
                <div className="card card-pad row" style={{ gap: 14 }}>
                  <div className="grow stack" style={{ gap: 2 }}>
                    <span className="eyebrow">Ti restano</span>
                    <span className="display-m num">
                      {daFare.reduce((n, i) => n + i.cfu, 0)} <span className="headline dim">CFU</span>
                    </span>
                  </div>
                  <div className="stack" style={{ alignItems: 'flex-end', gap: 2 }}>
                    <span className="eyebrow">Esami</span>
                    <span className="display-m num">{daFare.length}</span>
                  </div>
                </div>
              </section>

              <section className="gut" style={{ marginTop: 18 }}>
                <div className="list">
                  {daFare.map(i => {
                    const e = esameDi(s, i.id)
                    const a = e.appelloId ? s.appelli.find(x => x.id === e.appelloId) : undefined
                    return (
                      <div key={i.id} className="list-row" style={tinta(i.tinta)}>
                        <span className="riga-tinta" style={{ background: PIENO, color: PIENO }} />
                        <button className="grow stack" style={{ gap: 2, textAlign: 'left', minWidth: 0 }}
                          onClick={() => setEsameAperto(i)}>
                          <span className="callout strong clamp-2">{i.nome}</span>
                          <span className="foot dimmer truncate">
                            {i.cfu} CFU · {i.anno}° anno
                            {a && ` · prenotato ${quando(a.data)}`}
                          </span>
                        </button>
                        {e.stato === 'respinto' && <span className="chip chip-fail">Ritentare</span>}
                        <button
                          className="btn btn-secondary btn-sm" style={{ flex: 'none' }}
                          onClick={() => setNuovo({ pre: i.id })}
                          aria-label={`Aggiungi data per ${i.nome}`}
                        >
                          <Icona nome="calendario" size={15} />
                          Data
                        </button>
                      </div>
                    )
                  })}
                </div>
              </section>
            </>
          )
        )}

        {/* ---- Storico ---- */}
        {vista === 'storico' && (
          storico.length === 0 ? (
            <Vuoto icona="libro" titolo="Storico vuoto" testo="Qui finiscono gli esami una volta registrati, in ordine di sessione." />
          ) : (
            storico.map(([sess, voci]) => (
              <section key={sess} className="gut" style={{ marginTop: 22 }}>
                <div className="list-hdr" style={{ paddingTop: 0 }}>
                  <span className="eyebrow">{sess}</span>
                  <span className="foot dimmer num">
                    {voci.reduce((n, v) => n + v.ins.cfu, 0)} CFU
                  </span>
                </div>
                <div className="list">
                  {voci.map(({ ins, e }) => (
                    <button key={ins.id} className="list-row is-tappable" style={tinta(ins.tinta)}
                      onClick={() => setEsameAperto(ins)}>
                      <span className="riga-tinta" style={{ background: PIENO, color: PIENO }} />
                      <div className="grow stack" style={{ gap: 2 }}>
                        <span className="callout strong clamp-2">{ins.nome}</span>
                        <span className="foot dimmer">{fmtData(e.data!, 'medio')} · {ins.cfu} CFU</span>
                      </div>
                      <span className="esito" data-lode={!!e.lode} data-escluso={!!e.escludiDaMedia}
                        style={e.voto != null ? { ['--voto-colore' as string]: coloreVoto(e.voto) } : undefined}>
                        <span className={e.stato === 'idoneo' ? 'chip chip-pass' : 'num esito-voto'}>
                          {fmtVoto(e)}
                        </span>
                        {e.lode && <Icona nome="stella" size={12} pieno className="esito-lode" />}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            ))
          )
        )}
      </Schermo>

      <SchedaAppello appello={appello} aperto={!!appello} chiudi={() => setAppello(null)} />
      <SchedaAppello appello={null} aperto={!!nuovo} chiudi={() => setNuovo(null)} preselezione={nuovo?.pre} />
      <SchedaEsame
        ins={esameAperto}
        chiudi={() => setEsameAperto(null)}
        apriModifica={i => { setEsameAperto(null); setModifica(i) }}
      />
      <SchedaInsegnamento ins={modifica} aperto={!!modifica} chiudi={() => setModifica(null)} />
    </>
  )
}

function raggruppaPerMese<T extends { appello: Appello }>(voci: T[]): [string, T[]][] {
  const m = new Map<string, T[]>()
  for (const v of voci) {
    const k = meseAnno(v.appello.data)
    m.set(k, [...(m.get(k) ?? []), v])
  }
  return Array.from(m.entries())
}
