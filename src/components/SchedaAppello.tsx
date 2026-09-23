/* ============================================================
   Data d'appello: crearla, modificarla, prenotarsi.
   ============================================================ */

import { useEffect, useState } from 'react'
import { useApp, nuovoId } from '../lib/store'
import { Foglio, Campo, Segmentato, Selezione, Interruttore } from './ui'
import { Icona } from './Icona'
import { fmtData, oggi, quando, sessione } from '../lib/date'
import { esameDi } from '../lib/query'
import { LABEL_PROVA, type Appello, type TipoProva } from '../lib/types'
import { portaCfu } from '../lib/stats'

export function SchedaAppello({ appello, aperto, chiudi, preselezione }: {
  /** null = nuovo appello */
  appello: Appello | null
  aperto: boolean
  chiudi: () => void
  /** Insegnamento già scelto (arrivi dalla riga di un corso) */
  preselezione?: string
}) {
  const { s, d, avviso } = useApp()
  const [insId, setInsId] = useState('')
  const [data, setData] = useState('')
  const [ora, setOra] = useState('')
  const [aula, setAula] = useState('')
  const [edificio, setEdificio] = useState('')
  const [tipo, setTipo] = useState<TipoProva>('scritto')
  const [iscrDal, setIscrDal] = useState('')
  const [iscrAl, setIscrAl] = useState('')
  const [prenotato, setPrenotato] = useState(false)
  const [conferma, setConferma] = useState(false)

  // Nella tendina restano fuori gli esami già chiusi: non ha senso
  // fissare un appello per qualcosa che hai già passato.
  const disponibili = s.insegnamenti
    .filter(i => !portaCfu(esameDi(s, i.id)) || i.id === insId)
    .sort((a, b) => a.anno - b.anno || a.nome.localeCompare(b.nome, 'it'))

  useEffect(() => {
    if (!aperto) return
    setConferma(false)
    if (appello) {
      setInsId(appello.insegnamentoId)
      setData(appello.data); setOra(appello.ora ?? '')
      setAula(appello.aula ?? ''); setEdificio(appello.edificio ?? '')
      setTipo(appello.tipo ?? 'scritto')
      setIscrDal(appello.iscrizioneDal ?? ''); setIscrAl(appello.iscrizioneAl ?? '')
      const e = Object.values(s.esami).find(x => x.appelloId === appello.id)
      setPrenotato(e?.stato === 'prenotato')
    } else {
      setInsId(preselezione ?? disponibili[0]?.id ?? '')
      setData(''); setOra(''); setAula(''); setEdificio('')
      setTipo('scritto'); setIscrDal(''); setIscrAl(''); setPrenotato(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aperto, appello?.id, preselezione])

  function salva() {
    if (!insId) { avviso('Scegli un insegnamento'); return }
    if (!data) { avviso('Serve la data'); return }
    const v = {
      insegnamentoId: insId, data,
      ora: ora || undefined, aula: aula || undefined, edificio: edificio || undefined,
      tipo,
      iscrizioneDal: iscrDal || undefined, iscrizioneAl: iscrAl || undefined,
    }
    const id = appello?.id ?? nuovoId()
    if (appello) d({ t: 'appello.set', id, v })
    else d({ t: 'appello.add', v: { id, ...v } })

    const e = esameDi(s, insId)
    if (prenotato) {
      d({ t: 'esame.set', id: insId, v: { stato: 'prenotato', appelloId: id } })
    } else if (e.appelloId === id && e.stato === 'prenotato') {
      d({ t: 'esame.set', id: insId, v: { stato: 'da_sostenere', appelloId: undefined } })
    }
    avviso(appello ? 'Appello aggiornato' : `Appello del ${fmtData(data, 'breve')} salvato`)
    chiudi()
  }

  return (
    <Foglio
      aperto={aperto}
      chiudi={chiudi}
      titolo={appello ? 'Appello' : 'Nuovo appello'}
      azione={<button className="btn btn-ghost btn-sm" onClick={salva}>Salva</button>}
      piede={<button className="btn btn-primary btn-block" onClick={salva}>
        {appello ? 'Salva modifiche' : 'Aggiungi appello'}
      </button>}
    >
      <div className="stack" style={{ gap: 18, paddingTop: 4 }}>
        <Campo label="Insegnamento">
          {disponibili.length === 0 ? (
            <div className="input row dimmer" style={{ alignItems: 'center' }}>Nessun esame da sostenere</div>
          ) : (
            <Selezione
              valore={insId} cambia={setInsId}
              opzioni={disponibili.map(i => ({ v: i.id, l: `${i.nome} · ${i.cfu} CFU` }))}
            />
          )}
        </Campo>

        <Campo
          label="Data"
          hint={data
            ? `${fmtData(data, 'giorno')} · ${sessione(data).nome}${data >= oggi() ? ` · ${quando(data)}` : ''}`
            : undefined}
        >
          <input type="date" className="input" value={data} onChange={e => setData(e.target.value)} />
        </Campo>

        <div className="row" style={{ gap: 12, alignItems: 'flex-end' }}>
          <div style={{ width: 120, flex: 'none' }}><Campo label="Ora">
            <input type="time" className="input" value={ora} onChange={e => setOra(e.target.value)} />
          </Campo></div>
          <div className="grow"><Campo label="Aula">
            <input className="input" value={aula} onChange={e => setAula(e.target.value)} placeholder="Aula 3" />
          </Campo></div>
        </div>

        <Campo label="Edificio" hint="Opzionale">
          <input className="input" value={edificio} onChange={e => setEdificio(e.target.value)} placeholder="RM018, via Salaria 113" />
        </Campo>

        <div className="field">
          <span className="field-label">Tipo di prova</span>
          <Segmentato
            valore={tipo} cambia={setTipo}
            opzioni={(['scritto', 'orale', 'scritto_orale', 'parziale'] as TipoProva[])
              .map(v => ({ v, l: LABEL_PROVA[v] }))}
          />
        </div>

        <div className="card card-pad row" style={{ gap: 12 }}>
          <div className="grow stack" style={{ gap: 2 }}>
            <span className="callout strong">Sono prenotato</span>
            <span className="foot dimmer">
              Compare in home col conto alla rovescia.
            </span>
          </div>
          <Interruttore acceso={prenotato} cambia={setPrenotato} etichetta="Sono prenotato" />
        </div>

        <details className="dettagli">
          <summary className="callout strong">
            Finestra di iscrizione
            <Icona nome="chevron-giu" size={17} peso={2.2} className="chev" />
          </summary>
          <div className="row" style={{ gap: 12, marginTop: 12 }}>
            <div className="grow"><Campo label="Apre il">
              <input type="date" className="input" value={iscrDal} onChange={e => setIscrDal(e.target.value)} />
            </Campo></div>
            <div className="grow"><Campo label="Chiude il">
              <input type="date" className="input" value={iscrAl} onChange={e => setIscrAl(e.target.value)} />
            </Campo></div>
          </div>
          <p className="caption dimmer" style={{ marginTop: 8 }}>
            Su Infostud le liste chiudono di solito qualche giorno prima dell'appello.
          </p>
        </details>

        {appello && (
          conferma ? (
            <div className="card card-pad stack" style={{ gap: 12, borderColor: 'var(--fail)' }}>
              <span className="callout strong">Eliminare questo appello?</span>
              <div className="row" style={{ gap: 8 }}>
                <button className="btn btn-secondary btn-sm grow" onClick={() => setConferma(false)}>Annulla</button>
                <button className="btn btn-danger btn-sm grow" onClick={() => {
                  d({ t: 'appello.del', id: appello.id }); avviso('Appello eliminato'); chiudi()
                }}>Elimina</button>
              </div>
            </div>
          ) : (
            <button className="btn btn-danger btn-block" onClick={() => setConferma(true)}>
              <Icona nome="cestino" size={16} /> Elimina appello
            </button>
          )
        )}
      </div>
    </Foglio>
  )
}
