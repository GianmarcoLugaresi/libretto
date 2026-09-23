/* ============================================================
   Scheda d'esame: registri lo stato, il voto, la data.
   Si lavora su una copia e si conferma con "Salva", così uscire
   senza salvare non sporca il libretto.
   ============================================================ */

import { useEffect, useMemo, useState } from 'react'
import { useApp, nuovoId } from '../lib/store'
import { Foglio, Campo, Interruttore, Segmentato } from './ui'
import { Icona } from './Icona'
import { impatto, fmtMedia } from '../lib/stats'
import { fmtData, oggi, sessione } from '../lib/date'
import { LABEL_PROVA, type Esame, type Insegnamento, type StatoEsame, type TipoProva } from '../lib/types'
import { tinta, VELO, TESTO } from '../lib/tinte'
import { useMioCorso } from '../lib/catalogoContesto'
import { appelliDellInsegnamento, finestra, nomePersona } from '../lib/daCatalogo'

const STATI: { v: StatoEsame; l: string; wide?: boolean }[] = [
  { v: 'da_sostenere', l: 'Da sostenere' },
  { v: 'prenotato', l: 'Prenotato' },
  { v: 'superato', l: 'Superato' },
  { v: 'idoneo', l: 'Idoneo' },
  { v: 'respinto', l: 'Non superato', wide: true },
]

export function SchedaEsame({ ins, chiudi, apriModifica }: {
  ins: Insegnamento | null
  chiudi: () => void
  apriModifica: (ins: Insegnamento) => void
}) {
  const { s, d, avviso } = useApp()
  const precedente = ins ? (s.esami[ins.id] ?? { insegnamentoId: ins.id, stato: 'da_sostenere' as StatoEsame }) : null

  const [stato, setStato] = useState<StatoEsame>('da_sostenere')
  const [voto, setVoto] = useState<number | null>(null)
  const [lode, setLode] = useState(false)
  const [data, setData] = useState('')
  const [note, setNote] = useState('')
  const [escludi, setEscludi] = useState(false)
  // Campi dell'appello, quando ti stai prenotando
  const [pData, setPData] = useState('')
  const [pOra, setPOra] = useState('')
  const [pAula, setPAula] = useState('')
  const [pTipo, setPTipo] = useState<TipoProva>('scritto')

  // Ricarica la bozza ogni volta che si apre su un insegnamento.
  useEffect(() => {
    if (!ins || !precedente) return
    setStato(precedente.stato)
    setVoto(precedente.voto ?? null)
    setLode(!!precedente.lode)
    setData(precedente.data ?? '')
    setNote(precedente.note ?? '')
    setEscludi(!!precedente.escludiDaMedia)
    const ap = s.appelli.find(a => a.id === precedente.appelloId)
    setPData(ap?.data ?? '')
    setPOra(ap?.ora ?? '')
    setPAula(ap?.aula ?? '')
    setPTipo(ap?.tipo ?? 'scritto')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ins?.id])

  // Gli appelli ufficiali di questo insegnamento, dal catalogo: si
  // leggono e basta. La prenotazione resta dello studente, e si scrive
  // nel libretto solo quando preme Salva.
  const mioCorso = useMioCorso()
  const ufficiali = useMemo(
    () => (ins && mioCorso.codiceCoorte
      ? appelliDellInsegnamento(mioCorso.appelli, mioCorso.codiceCoorte, ins, oggi())
      : []),
    [ins, mioCorso.appelli, mioCorso.codiceCoorte],
  )

  const sim = useMemo(() => {
    if (!ins || stato !== 'superato' || voto == null) return null
    return impatto(s, ins.cfu, lode ? s.impostazioni.valoreLode : voto)
  }, [s, ins, stato, voto, lode])

  if (!ins) return null

  function salva() {
    const patch: Partial<Esame> = { stato, note: note.trim() || undefined, escludiDaMedia: escludi || undefined }

    if (stato === 'superato') {
      if (voto == null) { avviso('Scegli il voto'); return }
      patch.voto = voto
      patch.lode = voto === 30 ? lode : false
      patch.data = data || oggi()
      patch.appelloId = undefined
    } else if (stato === 'idoneo') {
      patch.voto = undefined; patch.lode = false
      patch.data = data || oggi()
      patch.appelloId = undefined
    } else if (stato === 'prenotato') {
      if (!pData) { avviso("Indica la data dell'appello"); return }
      // Riusa l'appello già collegato se la data non è cambiata,
      // altrimenti ne crea uno nuovo: evita doppioni in calendario.
      const esistente = s.appelli.find(a => a.insegnamentoId === ins!.id && a.data === pData)
      const id = esistente?.id ?? nuovoId()
      if (esistente) {
        d({ t: 'appello.set', id, v: { ora: pOra || undefined, aula: pAula || undefined, tipo: pTipo } })
      } else {
        d({ t: 'appello.add', v: {
          id, insegnamentoId: ins!.id, data: pData,
          ora: pOra || undefined, aula: pAula || undefined, tipo: pTipo,
        }})
      }
      patch.appelloId = id
      patch.voto = undefined; patch.lode = false; patch.data = undefined
    } else {
      patch.voto = undefined; patch.lode = false
      patch.appelloId = undefined
      if (stato === 'da_sostenere') patch.data = undefined
      else patch.data = data || undefined
    }

    d({ t: 'esame.set', id: ins!.id, v: patch })
    avviso(stato === 'superato'
      ? `${ins!.nome}: ${voto === 30 && lode ? '30 e lode' : voto} registrato`
      : 'Salvato')
    chiudi()
  }

  return (
    <Foglio
      aperto={!!ins}
      chiudi={chiudi}
      titolo="Esame"
      azione={<button className="btn btn-ghost btn-sm" onClick={salva}>Salva</button>}
      piede={
        <>
          <button className="btn btn-secondary grow" onClick={() => apriModifica(ins!)}>
            <Icona nome="matita" size={16} /> Modifica corso
          </button>
          <button className="btn btn-primary grow" onClick={salva}>Salva</button>
        </>
      }
    >
      {/* Intestazione col corso */}
      <div className="scheda-top" style={tinta(ins.tinta)}>
        <div className="scheda-cfu" style={{ background: VELO, color: TESTO }}>
          <span className="display-m num">{ins.cfu}</span>
          <span className="caption">CFU</span>
        </div>
        <div className="grow stack" style={{ gap: 3 }}>
          <span className="title" style={{ lineHeight: 1.2 }}>{ins.nome}</span>
          <span className="foot dimmer">
            {ins.anno}° anno · {ins.semestre === 0 ? 'annuale' : `${ins.semestre === 1 ? 'I' : 'II'} semestre`}
            {ins.ssd && ` · ${ins.ssd}`}
          </span>
          {ins.docente && <span className="foot dimmer">{ins.docente}</span>}
        </div>
      </div>

      {/* Esame ufficiale, da Infostud */}
      {s.infostud.esami[ins.id] && <Ufficiale id={ins.id} />}

      {/* Stato */}
      <div className="field" style={{ marginTop: 20 }}>
        <span className="field-label">Stato</span>
        <div className="stati-grid">
          {STATI.map(x => (
            <button
              key={x.v} className="stato-key" aria-pressed={stato === x.v}
              data-k={x.v} style={x.wide ? { gridColumn: 'span 2' } : undefined}
              onClick={() => setStato(x.v)}
            >
              {stato === x.v && <Icona nome="check" size={14} peso={2.6} />}
              {x.l}
            </button>
          ))}
        </div>
      </div>

      {/* Appelli ufficiali */}
      {ufficiali.length > 0 && (stato === 'da_sostenere' || stato === 'prenotato' || stato === 'respinto') && (
        <div className="stack" style={{ gap: 8, marginTop: 20 }}>
          <span className="field-label">Prossimi appelli ufficiali</span>
          {ufficiali.slice(0, 4).map((x, i) => {
            const on = stato === 'prenotato' && pData === x.data
            const f = finestra(x, oggi())
            return (
              <button key={`${x.data}-${i}`} className="variante" data-on={on}
                onClick={() => { setStato('prenotato'); setPData(x.data) }}>
                <span className="variante-check" data-on={on}>
                  {on && <Icona nome="check" size={12} peso={3} />}
                </span>
                <span className="grow stack" style={{ gap: 2, minWidth: 0 }}>
                  <span className="foot strong">{fmtData(x.data, 'giorno')} · {sessione(x.data).nome}</span>
                  {x.docenti.length > 0 && <span className="foot dimmer truncate">{x.docenti.map(nomePersona).join(', ')}</span>}
                  {f !== 'ignota' && (
                    <span className="caption num" style={{ color: f === 'aperta' ? 'var(--accent)' : undefined }}>
                      {f === 'aperta' && `Prenotazioni aperte${x.prenotazioniAl ? ` fino al ${fmtData(x.prenotazioniAl, 'breve')}` : ''}`}
                      {f === 'prima' && `Prenotazioni dal ${fmtData(x.prenotazioniDal!, 'breve')}`}
                      {f === 'chiusa' && 'Prenotazioni chiuse'}
                    </span>
                  )}
                </span>
              </button>
            )
          })}
          <span className="caption dimmer" style={{ lineHeight: 1.5 }}>
            Dal catalogo pubblico. Toccane uno per segnarti la prenotazione:
            ci si prenota comunque su Infostud.
          </span>
        </div>
      )}

      {/* Voto */}
      {stato === 'superato' && (
        <div className="field" style={{ marginTop: 20 }}>
          <span className="field-label">Voto</span>
          <div className="grade-grid">
            {Array.from({ length: 13 }, (_, i) => 18 + i).map(v => (
              <button
                key={v} className="grade-key num"
                aria-pressed={voto === v && !(v === 30 && lode)}
                onClick={() => { setVoto(v); if (v !== 30) setLode(false) }}
              >{v}</button>
            ))}
            <button
              className="grade-key is-wide"
              aria-pressed={voto === 30 && lode}
              onClick={() => { setVoto(30); setLode(true) }}
              style={voto === 30 && lode ? { background: 'var(--gold)', color: '#fff' } : undefined}
            >30 e lode</button>
          </div>

          {sim && (
            <div className="sim" style={{ marginTop: 12 }}>
              <Icona nome={sim.delta >= 0 ? 'salita' : 'grafico'} size={16}
                style={{ color: sim.delta >= 0 ? 'var(--pass)' : 'var(--fail)' }} />
              <span className="foot">
                La media ponderata passa a <strong className="num">{fmtMedia(sim.nuova)}</strong>{' '}
                <span style={{ color: sim.delta >= 0 ? 'var(--pass)' : 'var(--fail)' }} className="num">
                  ({sim.delta >= 0 ? '+' : '−'}{fmtMedia(Math.abs(sim.delta))})
                </span>
              </span>
            </div>
          )}
        </div>
      )}

      {/* Data di superamento */}
      {(stato === 'superato' || stato === 'idoneo' || stato === 'respinto') && (
        <div style={{ marginTop: 20 }}>
          <Campo
            label={stato === 'respinto' ? 'Data del tentativo' : 'Data di superamento'}
            hint={data ? `${fmtData(data, 'lungo')} · ${sessione(data).nome}` : 'Se la lasci vuota uso oggi.'}
          >
            <input type="date" className="input" value={data} onChange={e => setData(e.target.value)} />
          </Campo>
        </div>
      )}

      {/* Prenotazione */}
      {stato === 'prenotato' && (
        <div className="stack" style={{ gap: 16, marginTop: 20 }}>
          <Campo label="Data dell'appello"
            hint={pData ? `${fmtData(pData, 'giorno')} · ${sessione(pData).nome}` : undefined}>
            <input type="date" className="input" value={pData} onChange={e => setPData(e.target.value)} />
          </Campo>
          <div className="row" style={{ gap: 12, alignItems: 'flex-end' }}>
            <div className="grow"><Campo label="Ora">
              <input type="time" className="input" value={pOra} onChange={e => setPOra(e.target.value)} />
            </Campo></div>
            <div className="grow"><Campo label="Aula">
              <input className="input" value={pAula} onChange={e => setPAula(e.target.value)} placeholder="Aula 1" />
            </Campo></div>
          </div>
          <div className="field">
            <span className="field-label">Tipo di prova</span>
            <Segmentato
              valore={pTipo}
              cambia={setPTipo}
              opzioni={(['scritto', 'orale', 'scritto_orale'] as TipoProva[]).map(v => ({ v, l: LABEL_PROVA[v] }))}
            />
          </div>
        </div>
      )}

      {/* Note */}
      <div style={{ marginTop: 20 }}>
        <Campo label="Note">
          <textarea
            className="input" value={note} onChange={e => setNote(e.target.value)}
            placeholder="Programma, libri, professore, appunti…"
          />
        </Campo>
      </div>

      {/* Escludi dalla media */}
      {stato === 'superato' && (
        <div className="card card-pad row" style={{ gap: 12, marginTop: 16 }}>
          <div className="grow stack" style={{ gap: 2 }}>
            <span className="callout strong">Escludi dalla media</span>
            <span className="foot dimmer">
              Per esami convalidati: portano i CFU ma non il voto.
            </span>
          </div>
          <Interruttore acceso={escludi} cambia={setEscludi} etichetta="Escludi dalla media" />
        </div>
      )}

      {/* Azzera */}
      {precedente && precedente.stato !== 'da_sostenere' && (
        <button
          className="btn btn-danger btn-block" style={{ marginTop: 18 }}
          onClick={() => { d({ t: 'esame.reset', id: ins.id }); avviso('Esame azzerato'); chiudi() }}
        >
          Azzera questo esame
        </button>
      )}
    </Foglio>
  )
}

/** L'esame come lo registra Infostud. Il foglio sotto continua a
 *  modificare l'inserimento a mano, che resta; nelle statistiche vale
 *  questo. */
function Ufficiale({ id }: { id: string }) {
  const { s, d, avviso } = useApp()
  const u = s.infostud.esami[id]
  const manuale = s.esami[id]
  if (!u) return null
  const voto = u.idoneita ? 'Idoneo' : u.voto != null ? `${u.voto}${u.lode ? ' e lode' : ''}` : null
  const manualeDiverso = manuale && (manuale.stato === 'superato' || manuale.stato === 'idoneo')
    && (manuale.voto !== u.voto || !!manuale.lode !== u.lode)

  return (
    <div className="card card-pad stack" style={{ gap: 6, marginTop: 16 }}>
      <div className="row" style={{ gap: 8 }}>
        <Icona nome="check" size={15} peso={2.6} style={{ color: 'var(--pass)' }} />
        <span className="callout strong">Registrato su Infostud</span>
      </div>
      <span className="foot num">
        {voto ?? 'Voto da controllare'}
        {u.data && ` · ${fmtData(u.data, 'medio')}`}
        {` · ${u.cfu} CFU`}
      </span>
      {!voto && u.votoTesto && (
        <span className="foot" style={{ color: 'var(--accent)', lineHeight: 1.5 }}>
          Infostud scrive «{u.votoTesto}», che non so leggere come voto: controllalo
          e, se serve, scrivilo qui sotto. Finché non è chiaro non entra nella media.
        </span>
      )}
      {manualeDiverso && (
        <span className="foot dimmer" style={{ lineHeight: 1.5 }}>
          Quello che avevi scritto a mano ({manuale.stato === 'idoneo' ? 'idoneo' : `${manuale.voto}${manuale.lode ? ' e lode' : ''}`})
          resta, ma nelle statistiche vale il voto ufficiale.
        </span>
      )}
      {u.nonPiuPresente && (
        <div className="stack" style={{ gap: 8, marginTop: 4 }}>
          <span className="foot" style={{ color: 'var(--accent)', lineHeight: 1.5 }}>
            All’ultima sincronizzazione Infostud non lo elencava più. Non l’ho
            tolto: decidi tu.
          </span>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => { d({ t: 'infostud.tieni', insegnamentoId: id }); avviso('Tenuto') }}>
              Tienilo
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => { d({ t: 'infostud.togli', insegnamentoId: id }); avviso('Tolto il voto ufficiale') }}>
              Togli il voto ufficiale
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
