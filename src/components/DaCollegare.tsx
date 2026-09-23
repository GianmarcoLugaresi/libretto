/* ============================================================
   Esami arrivati da Infostud che non si agganciano da soli.

   L'app non sceglie per lo studente: mostra i candidati (se ce ne
   sono), permette di scegliere qualunque insegnamento del libretto,
   o di aggiungerne uno nuovo col codice ufficiale.
   ============================================================ */

import { useState } from 'react'
import { useApp } from '../lib/store'
import { Selezione } from './ui'
import { chiaveDaCodice } from '../lib/chiavi'
import { nomeLeggibile } from '../lib/daCatalogo'
import { TINTE, type Insegnamento, type RecordUfficiale } from '../lib/types'

export function DaCollegare() {
  const { s } = useApp()
  if (s.infostud.daCollegare.length === 0) return null
  return (
    <div className="stack" style={{ gap: 10 }}>
      <span className="field-label">Da collegare</span>
      <p className="caption dimmer" style={{ lineHeight: 1.5, marginTop: -4 }}>
        Questi esami sono su Infostud ma non trovo con certezza a quale voce
        del libretto corrispondono. Scegli tu: non indovino.
      </p>
      {s.infostud.daCollegare.map(x => (
        <Voce key={x.record.codice} record={x.record} candidati={x.candidati} />
      ))}
    </div>
  )
}

function Voce({ record, candidati }: { record: RecordUfficiale; candidati: string[] }) {
  const { s, d, avviso } = useApp()
  // Si può collegare solo a un insegnamento che non ha già un esame
  // ufficiale: due record sullo stesso esame si sovrascriverebbero.
  const liberi = s.insegnamenti.filter(i => !s.infostud.esami[i.id])
  const ordinati = [
    ...liberi.filter(i => candidati.includes(i.id)),
    ...liberi.filter(i => !candidati.includes(i.id)).sort((a, b) => a.nome.localeCompare(b.nome, 'it')),
  ]
  const [scelta, setScelta] = useState(ordinati[0]?.id ?? '')
  const voto = record.idoneita ? 'idoneo' : record.voto != null ? `${record.voto}${record.lode ? ' e lode' : ''}` : record.votoTesto ?? '—'

  function aggiungi() {
    const nuovo: Insegnamento = {
      id: chiaveDaCodice(record.codice),
      codice: record.codice,
      nome: nomeLeggibile(record.nome),
      cfu: record.cfu,
      // Anno e semestre Infostud non li dice: si mettono quelli in corso,
      // e si correggono dal libretto.
      anno: s.profilo.annoCorrente,
      semestre: 0,
      tipo: record.idoneita ? 'idoneita' : 'a_scelta',
      tinta: s.insegnamenti.length % TINTE.length,
    }
    d({ t: 'infostud.nuovo', codice: record.codice, ins: nuovo })
    avviso(`${nuovo.nome} aggiunto al libretto`)
  }

  return (
    <div className="card card-pad stack" style={{ gap: 10 }}>
      <div className="between" style={{ alignItems: 'flex-start', gap: 10 }}>
        <span className="stack" style={{ gap: 2 }}>
          <span className="callout strong">{nomeLeggibile(record.nome)}</span>
          <span className="foot dimmer num">{record.cfu} CFU · codice {record.codice}</span>
        </span>
        <span className="chip chip-pass" style={{ flex: 'none' }}>{voto}</span>
      </div>
      {ordinati.length > 0 && (
        <div className="row" style={{ gap: 8 }}>
          <div className="grow">
            <Selezione
              valore={scelta} cambia={setScelta}
              opzioni={ordinati.map(i => ({
                v: i.id,
                l: `${i.nome} · ${i.cfu} CFU${candidati.includes(i.id) ? ' · probabile' : ''}`,
              }))}
            />
          </div>
          <button className="btn btn-secondary btn-sm" style={{ flex: 'none' }} disabled={!scelta}
            onClick={() => { d({ t: 'infostud.collega', codice: record.codice, insegnamentoId: scelta }); avviso('Collegato') }}>
            Collega
          </button>
        </div>
      )}
      <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={aggiungi}>
        Non c’è: aggiungilo al libretto
      </button>
    </div>
  )
}
