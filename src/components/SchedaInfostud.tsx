/* ============================================================
   Sincronizzazione con Infostud, vista dallo studente.

   spiegazione → accesso e lettura → riepilogo (o errore comprensibile).
   Annullabile in ogni momento. Il testo di spiegazione è quello di
   PROMPT_MYSAPIENZA.md: prima di aprire le pagine ufficiali si dice
   chiaramente cosa l'app vede e cosa no.
   ============================================================ */

import { useEffect, useRef, useState } from 'react'
import { useApp } from '../lib/store'
import { useMioCorso } from '../lib/catalogoContesto'
import { Foglio } from './ui'
import { Icona } from './Icona'
import { DaCollegare } from './DaCollegare'
import type { FaseSync, InfostudProvider } from '../lib/infostud/provider'
import { messaggioErrore, sincronizza } from '../lib/infostud/sync'
import { testoRiepilogo, type Riepilogo } from '../lib/infostud/unisci'
import { nomeLeggibile } from '../lib/daCatalogo'

type Passo =
  | { p: 'spiega' }
  | { p: 'in-corso'; fase: FaseSync }
  | { p: 'fatto'; r: Riepilogo }
  | { p: 'errore'; titolo: string; testo: string }

const FASI: Record<FaseSync, string> = {
  accesso: 'Accedi con SPID o CIE sulle pagine ufficiali',
  lettura: 'Leggo esami e prenotazioni',
}

export function SchedaInfostud({ aperto, chiudi, provider }: {
  aperto: boolean
  chiudi: () => void
  provider: InfostudProvider
}) {
  const { s, d } = useApp()
  const mioCorso = useMioCorso()
  const [passo, setPasso] = useState<Passo>({ p: 'spiega' })
  const annulla = useRef<AbortController | null>(null)

  useEffect(() => { if (aperto) setPasso({ p: 'spiega' }) }, [aperto])
  // Chiudere il foglio a metà vale come annullare.
  useEffect(() => () => annulla.current?.abort(), [])

  async function avvia() {
    const c = new AbortController()
    annulla.current = c
    setPasso({ p: 'in-corso', fase: 'accesso' })
    const esito = await sincronizza(provider, s, mioCorso.appelli?.alias ?? {}, {
      segnale: c.signal,
      fase: fase => setPasso({ p: 'in-corso', fase }),
    })
    annulla.current = null
    if (c.signal.aborted) return
    if (esito.ok) {
      d({ t: 'infostud.sync', infostud: esito.infostud, quando: esito.quando })
      setPasso({ p: 'fatto', r: esito.riepilogo })
    } else {
      setPasso({ p: 'errore', ...messaggioErrore(esito.errore) })
    }
  }

  function esci() {
    annulla.current?.abort()
    annulla.current = null
    chiudi()
  }

  return (
    <Foglio
      aperto={aperto} chiudi={esci}
      titolo="Infostud"
      piede={
        passo.p === 'spiega' ? (
          <button className="btn btn-primary btn-block" onClick={avvia}>
            {provider.nome === 'prova' ? 'Prova con dati finti' : 'Accedi a Infostud'}
          </button>
        ) : passo.p === 'in-corso' ? (
          <button className="btn btn-secondary btn-block" onClick={esci}>Annulla</button>
        ) : passo.p === 'errore' ? (
          <>
            <button className="btn btn-secondary grow" onClick={esci}>Chiudi</button>
            <button className="btn btn-primary grow" onClick={avvia}>Riprova</button>
          </>
        ) : (
          <button className="btn btn-primary btn-block" onClick={esci}>Fatto</button>
        )
      }
    >
      {passo.p === 'spiega' && (
        <div className="stack" style={{ gap: 14, marginTop: 6 }}>
          <div className="onb-mark" style={{ alignSelf: 'flex-start' }}><Icona nome="cappello" size={22} /></div>
          <p className="callout" style={{ lineHeight: 1.5 }}>
            Accederai con SPID o CIE sulle pagine ufficiali. L’app non vede né
            salva le tue credenziali. I dati restano sul telefono.
          </p>
          <div className="card card-pad stack" style={{ gap: 8 }}>
            <span className="foot dim" style={{ lineHeight: 1.5 }}>
              Leggo i tuoi esami verbalizzati e le prenotazioni, poi chiudo la
              pagina e cancello la sessione. Non resta niente con cui rientrare:
              la prossima volta si rifà l’accesso.
            </span>
            <span className="foot dim" style={{ lineHeight: 1.5 }}>
              Quello che hai scritto a mano non si tocca: dove Infostud ha un
              voto ufficiale, nelle statistiche vale quello.
            </span>
          </div>
          {provider.nome === 'prova' && (
            <p className="caption" style={{ color: 'var(--plan)', lineHeight: 1.5 }}>
              Modalità di prova: niente accesso vero, arrivano esami finti per
              vedere come funziona. Finiscono nel libretto come se fossero veri.
            </p>
          )}
        </div>
      )}

      {passo.p === 'in-corso' && (
        <div className="stack" style={{ gap: 12, marginTop: 10 }}>
          {(['accesso', 'lettura'] as FaseSync[]).map((f, i) => {
            const attuale = passo.fase === f
            const fatta = passo.fase === 'lettura' && f === 'accesso'
            return (
              <div key={f} className="row" style={{ gap: 12, opacity: attuale || fatta ? 1 : 0.45 }}>
                <span className="variante-check" data-on={fatta}>
                  {fatta ? <Icona nome="check" size={12} peso={3} /> : <span className="caption num">{i + 1}</span>}
                </span>
                <span className={attuale ? 'callout strong' : 'callout'}>{FASI[f]}{attuale && '…'}</span>
              </div>
            )
          })}
          <p className="caption dimmer" style={{ marginTop: 6, lineHeight: 1.5 }}>
            Puoi annullare in qualunque momento: non cambia niente.
          </p>
        </div>
      )}

      {passo.p === 'errore' && (
        <div className="stack" style={{ gap: 10, marginTop: 10 }}>
          <div className="row" style={{ gap: 8 }}>
            <Icona nome="avviso" size={18} style={{ color: 'var(--accent)' }} />
            <span className="headline">{passo.titolo}</span>
          </div>
          <p className="foot dim" style={{ lineHeight: 1.5 }}>{passo.testo}</p>
        </div>
      )}

      {passo.p === 'fatto' && (
        <div className="stack" style={{ gap: 14, marginTop: 10 }}>
          <span className="headline">{testoRiepilogo(passo.r)}</span>
          {passo.r.nuovi.length > 0 && <Elenco titolo="Nuovi" voci={passo.r.nuovi} />}
          {passo.r.aggiornati.length > 0 && <Elenco titolo="Aggiornati" voci={passo.r.aggiornati} />}
          {passo.r.nonPiuPresenti.length > 0 && (
            <div className="card card-pad stack" style={{ gap: 6 }}>
              <span className="foot strong">Non più su Infostud</span>
              <span className="foot dim" style={{ lineHeight: 1.5 }}>
                {passo.r.nonPiuPresenti.map(nomeLeggibile).join(', ')}. Non li ho tolti:
                continuano a contare finché non decidi tu, dal dettaglio dell’esame.
              </span>
            </div>
          )}
          {s.infostud.daCollegare.length > 0 && <DaCollegare />}
        </div>
      )}
    </Foglio>
  )
}

function Elenco({ titolo, voci }: { titolo: string; voci: string[] }) {
  return (
    <div className="stack" style={{ gap: 4 }}>
      <span className="field-label">{titolo}</span>
      {voci.map(v => <span key={v} className="foot">{nomeLeggibile(v)}</span>)}
    </div>
  )
}
