/* ============================================================
   Lezione ricorrente settimanale.
   ============================================================ */

import { useEffect, useState } from 'react'
import { useApp, nuovoId } from '../lib/store'
import { Foglio, Campo, Selezione } from './ui'
import { Icona } from './Icona'
import { minuti } from '../lib/date'
import { GIORNI_BREVI, type Giorno, type Lezione } from '../lib/types'

export function SchedaLezione({ lezione, aperto, chiudi, preGiorno }: {
  lezione: Lezione | null
  aperto: boolean
  chiudi: () => void
  preGiorno?: Giorno
}) {
  const { s, d, avviso } = useApp()
  const [insId, setInsId] = useState('')
  const [giorno, setGiorno] = useState<Giorno>(1)
  const [inizio, setInizio] = useState('09:00')
  const [fine, setFine] = useState('11:00')
  const [aula, setAula] = useState('')
  const [edificio, setEdificio] = useState('')
  const [dal, setDal] = useState('')
  const [al, setAl] = useState('')
  const [conferma, setConferma] = useState(false)

  const corsi = [...s.insegnamenti].sort(
    (a, b) => a.anno - b.anno || a.nome.localeCompare(b.nome, 'it'))

  useEffect(() => {
    if (!aperto) return
    setConferma(false)
    if (lezione) {
      setInsId(lezione.insegnamentoId); setGiorno(lezione.giorno)
      setInizio(lezione.inizio); setFine(lezione.fine)
      setAula(lezione.aula ?? ''); setEdificio(lezione.edificio ?? '')
      setDal(lezione.dal ?? ''); setAl(lezione.al ?? '')
    } else {
      setInsId(corsi[0]?.id ?? '')
      setGiorno(preGiorno ?? 1)
      setInizio('09:00'); setFine('11:00')
      setAula(''); setEdificio(''); setDal(''); setAl('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aperto, lezione?.id, preGiorno])

  function salva() {
    if (!insId) { avviso('Scegli un insegnamento'); return }
    if (minuti(fine) <= minuti(inizio)) { avviso("L'ora di fine deve venire dopo l'inizio"); return }
    const v = {
      insegnamentoId: insId, giorno, inizio, fine,
      aula: aula || undefined, edificio: edificio || undefined,
      dal: dal || undefined, al: al || undefined,
    }
    if (lezione) { d({ t: 'lezione.set', id: lezione.id, v }); avviso('Lezione aggiornata') }
    else { d({ t: 'lezione.add', v: { id: nuovoId(), ...v } }); avviso('Lezione aggiunta') }
    chiudi()
  }

  return (
    <Foglio
      aperto={aperto} chiudi={chiudi}
      titolo={lezione ? 'Lezione' : 'Nuova lezione'}
      azione={<button className="btn btn-ghost btn-sm" onClick={salva}>Salva</button>}
      piede={<button className="btn btn-primary btn-block" onClick={salva}>
        {lezione ? 'Salva modifiche' : 'Aggiungi lezione'}
      </button>}
    >
      <div className="stack" style={{ gap: 18, paddingTop: 4 }}>
        <Campo label="Insegnamento">
          {corsi.length === 0 ? (
            <div className="input row dimmer" style={{ alignItems: 'center' }}>
              Aggiungi prima un corso al libretto
            </div>
          ) : (
            <Selezione valore={insId} cambia={setInsId}
              opzioni={corsi.map(i => ({ v: i.id, l: i.nome }))} />
          )}
        </Campo>

        <div className="field">
          <span className="field-label">Giorno</span>
          <div className="giorni-grid">
            {([1, 2, 3, 4, 5, 6] as Giorno[]).map(g => (
              <button key={g} className="cfu-key" aria-pressed={giorno === g} onClick={() => setGiorno(g)}>
                {GIORNI_BREVI[g]}
              </button>
            ))}
          </div>
        </div>

        <div className="row" style={{ gap: 12 }}>
          <div className="grow"><Campo label="Inizio">
            <input type="time" className="input" value={inizio} onChange={e => setInizio(e.target.value)} step={300} />
          </Campo></div>
          <div className="grow"><Campo label="Fine">
            <input type="time" className="input" value={fine} onChange={e => setFine(e.target.value)} step={300} />
          </Campo></div>
        </div>

        <div className="row" style={{ gap: 12 }}>
          <div className="grow"><Campo label="Aula">
            <input className="input" value={aula} onChange={e => setAula(e.target.value)} placeholder="Aula 2" />
          </Campo></div>
          <div className="grow"><Campo label="Edificio">
            <input className="input" value={edificio} onChange={e => setEdificio(e.target.value)} placeholder="RM018" />
          </Campo></div>
        </div>

        <details className="dettagli">
          <summary className="callout strong">
            Periodo delle lezioni
            <Icona nome="chevron-giu" size={17} peso={2.2} className="chev" />
          </summary>
          <div className="row" style={{ gap: 12, marginTop: 12 }}>
            <div className="grow"><Campo label="Dal">
              <input type="date" className="input" value={dal} onChange={e => setDal(e.target.value)} />
            </Campo></div>
            <div className="grow"><Campo label="Al">
              <input type="date" className="input" value={al} onChange={e => setAl(e.target.value)} />
            </Campo></div>
          </div>
          <p className="caption dimmer" style={{ marginTop: 8 }}>
            Fuori da queste date la lezione sparisce dall'orario.
            Utile per non vedere i corsi del primo semestre ad aprile.
          </p>
        </details>

        {lezione && (
          conferma ? (
            <div className="card card-pad stack" style={{ gap: 12, borderColor: 'var(--fail)' }}>
              <span className="callout strong">Eliminare questa lezione?</span>
              <div className="row" style={{ gap: 8 }}>
                <button className="btn btn-secondary btn-sm grow" onClick={() => setConferma(false)}>Annulla</button>
                <button className="btn btn-danger btn-sm grow" onClick={() => {
                  d({ t: 'lezione.del', id: lezione.id }); avviso('Lezione eliminata'); chiudi()
                }}>Elimina</button>
              </div>
            </div>
          ) : (
            <button className="btn btn-danger btn-block" onClick={() => setConferma(true)}>
              <Icona nome="cestino" size={16} /> Elimina lezione
            </button>
          )
        )}
      </div>
    </Foglio>
  )
}
