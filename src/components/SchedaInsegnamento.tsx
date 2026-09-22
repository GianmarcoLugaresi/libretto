/* ============================================================
   Aggiungi o modifica un insegnamento del piano.
   ============================================================ */

import { useEffect, useState } from 'react'
import { useApp, nuovoId } from '../lib/store'
import { chiaveManuale } from '../lib/chiavi'
import { Foglio, Campo, Segmentato, Selezione } from './ui'
import { Icona } from './Icona'
import {
  LABEL_TIPO, TINTE, type AnnoCorso, type Insegnamento, type Semestre, type TipoInsegnamento,
} from '../lib/types'
import { tinta, PIENO } from '../lib/tinte'

const CFU_COMUNI = [3, 6, 9, 12]

export function SchedaInsegnamento({ ins, aperto, chiudi }: {
  /** null = nuovo insegnamento */
  ins: Insegnamento | null
  aperto: boolean
  chiudi: () => void
}) {
  const { s, d, avviso } = useApp()
  const [nome, setNome] = useState('')
  const [cfu, setCfu] = useState(9)
  const [anno, setAnno] = useState<AnnoCorso>(1)
  const [semestre, setSemestre] = useState<Semestre>(1)
  const [tipo, setTipo] = useState<TipoInsegnamento>('obbligatorio')
  const [ssd, setSsd] = useState('')
  const [docente, setDocente] = useState('')
  const [tintaIdx, setTintaIdx] = useState(0)
  const [immagine, setImmagine] = useState('')
  const [conferma, setConferma] = useState(false)

  useEffect(() => {
    if (!aperto) return
    setConferma(false)
    if (ins) {
      setNome(ins.nome); setCfu(ins.cfu); setAnno(ins.anno); setSemestre(ins.semestre)
      setTipo(ins.tipo); setSsd(ins.ssd ?? ''); setDocente(ins.docente ?? ''); setTintaIdx(ins.tinta)
      setImmagine(ins.immagine ?? '')
    } else {
      setNome(''); setCfu(9); setAnno(s.profilo.annoCorrente); setSemestre(1)
      setTipo('obbligatorio'); setSsd(''); setDocente(''); setImmagine('')
      // Tinta successiva nel giro, così due corsi nuovi non escono uguali.
      setTintaIdx(s.insegnamenti.length % TINTE.length)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aperto, ins?.id])

  function salva() {
    const n = nome.trim()
    if (!n) { avviso('Serve almeno il nome') ; return }
    const dati = {
      nome: n, cfu, anno, semestre, tipo,
      ssd: ssd.trim() || undefined,
      docente: docente.trim() || undefined,
      tinta: tintaIdx,
      immagine: immagine.trim() || undefined,
    }
    if (ins) {
      d({ t: 'ins.set', id: ins.id, v: dati })
      avviso('Modifiche salvate')
    } else {
      d({ t: 'ins.add', v: { id: chiaveManuale(n, nuovoId), ...dati } })
      avviso(`${n} aggiunto al piano`)
    }
    chiudi()
  }

  const anni = Array.from({ length: Math.max(s.profilo.durataAnni, anno) }, (_, i) => (i + 1) as AnnoCorso)

  return (
    <Foglio
      aperto={aperto}
      chiudi={chiudi}
      titolo={ins ? 'Modifica corso' : 'Nuovo corso'}
      azione={<button className="btn btn-ghost btn-sm" onClick={salva}>Salva</button>}
      piede={<button className="btn btn-primary btn-block" onClick={salva}>
        {ins ? 'Salva modifiche' : 'Aggiungi al piano'}
      </button>}
    >
      <div className="stack" style={{ gap: 18, paddingTop: 4 }}>
        <Campo label="Nome dell'insegnamento">
          <input
            className="input" value={nome} onChange={e => setNome(e.target.value)}
            placeholder="Analisi matematica I" autoFocus={!ins}
          />
        </Campo>

        <div className="field">
          <span className="field-label">CFU</span>
          <div className="row" style={{ gap: 8 }}>
            {CFU_COMUNI.map(v => (
              <button
                key={v} className="cfu-key num" aria-pressed={cfu === v}
                onClick={() => setCfu(v)}
              >{v}</button>
            ))}
            <input
              className="input num" type="number" min={1} max={40} value={cfu}
              onChange={e => setCfu(Math.max(1, Math.min(40, Number(e.target.value) || 1)))}
              style={{ width: 72, textAlign: 'center', flex: 'none' }}
              aria-label="CFU personalizzati"
            />
          </div>
        </div>

        <div className="field">
          <span className="field-label">Anno di corso</span>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {anni.map(a => (
              <button key={a} className="cfu-key num" aria-pressed={anno === a} onClick={() => setAnno(a)}>
                {a}°
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <span className="field-label">Periodo</span>
          <Segmentato
            valore={String(semestre)}
            cambia={v => setSemestre(Number(v) as Semestre)}
            opzioni={[
              { v: '1', l: 'I semestre' },
              { v: '2', l: 'II semestre' },
              { v: '0', l: 'Annuale' },
            ]}
          />
        </div>

        <Campo label="Tipo">
          <Selezione
            valore={tipo}
            cambia={v => setTipo(v as TipoInsegnamento)}
            opzioni={(Object.keys(LABEL_TIPO) as TipoInsegnamento[]).map(v => ({ v, l: LABEL_TIPO[v] }))}
          />
        </Campo>

        <div className="row" style={{ gap: 12 }}>
          <div className="grow"><Campo label="SSD" hint="Opzionale">
            <input className="input" value={ssd} onChange={e => setSsd(e.target.value.toUpperCase())} placeholder="MAT/05" />
          </Campo></div>
          <div className="grow"><Campo label="Docente" hint="Opzionale">
            <input className="input" value={docente} onChange={e => setDocente(e.target.value)} placeholder="Cognome" />
          </Campo></div>
        </div>

        <div className="field">
          <span className="field-label">Colore</span>
          <div className="tinte-row">
            {TINTE.map((t, i) => (
              <button
                key={i} className="tinta-key" aria-pressed={tintaIdx === i}
                aria-label={t.nome} style={tinta(i)} onClick={() => setTintaIdx(i)}
              >
                <span style={{ background: PIENO }} />
              </button>
            ))}
          </div>
        </div>

        <Campo label="Immagine di copertina" hint="Un URL: compare come poster in home al posto di quella a tema. Vale anche un'immagine generata con l'AI e caricata da qualche parte.">
          <input className="input" value={immagine} onChange={e => setImmagine(e.target.value)}
            placeholder="https://…/foto.jpg" inputMode="url" autoCapitalize="off" autoCorrect="off" />
        </Campo>

        {ins && (
          conferma ? (
            <div className="card card-pad stack" style={{ gap: 12, borderColor: 'var(--fail)' }}>
              <div className="stack" style={{ gap: 3 }}>
                <span className="callout strong">Eliminare «{ins.nome}»?</span>
                <span className="foot dimmer">
                  Spariscono anche il voto registrato, i suoi appelli e le sue lezioni.
                </span>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <button className="btn btn-secondary btn-sm grow" onClick={() => setConferma(false)}>Annulla</button>
                <button
                  className="btn btn-danger btn-sm grow"
                  onClick={() => { d({ t: 'ins.del', id: ins.id }); avviso('Corso eliminato'); chiudi() }}
                >Elimina</button>
              </div>
            </div>
          ) : (
            <button className="btn btn-danger btn-block" onClick={() => setConferma(true)}>
              <Icona nome="cestino" size={16} /> Elimina dal piano
            </button>
          )
        )}
      </div>
    </Foglio>
  )
}
