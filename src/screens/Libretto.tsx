import { useMemo, useState } from 'react'
import { useApp } from '../lib/store'
import { Icona } from '../components/Icona'
import { AzioneNav, Schermo, Segmentato, Vuoto } from '../components/ui'
import { SchedaEsame } from '../components/SchedaEsame'
import { SchedaInsegnamento } from '../components/SchedaInsegnamento'
import { esameDi, perAnno } from '../lib/query'
import { portaCfu, riepilogo, fmtMedia } from '../lib/stats'
import { quando } from '../lib/date'
import { LABEL_TIPO, type Insegnamento } from '../lib/types'
import { tinta, PIENO } from '../lib/tinte'

type Filtro = 'tutti' | 'dafare' | 'fatti'

export function Libretto() {
  const { s } = useApp()
  const [filtro, setFiltro] = useState<Filtro>('tutti')
  const [cerca, setCerca] = useState('')
  const [mostraCerca, setMostraCerca] = useState(false)
  const [aperto, setAperto] = useState<Insegnamento | null>(null)
  const [modifica, setModifica] = useState<Insegnamento | null>(null)
  const [nuovo, setNuovo] = useState(false)

  const r = riepilogo(s)

  const filtrati = useMemo(() => {
    const q = cerca.trim().toLowerCase()
    return s.insegnamenti.filter(i => {
      const e = esameDi(s, i.id)
      if (filtro === 'fatti' && !portaCfu(e)) return false
      if (filtro === 'dafare' && portaCfu(e)) return false
      if (!q) return true
      return i.nome.toLowerCase().includes(q)
        || (i.ssd ?? '').toLowerCase().includes(q)
        || (i.docente ?? '').toLowerCase().includes(q)
    })
  }, [s, filtro, cerca])

  const gruppi = useMemo(() => perAnno(filtrati), [filtrati])

  return (
    <>
      <Schermo
        titolo="Libretto"
        sottotitolo={
          <>
            <span className="num">{r.cfuAcquisiti}</span> CFU su <span className="num">{r.cfuTotali}</span>
            {r.mediaPonderata != null && <> · media <span className="num">{fmtMedia(r.mediaPonderata)}</span></>}
          </>
        }
        azioni={
          <>
            <AzioneNav icona="cerca" etichetta="Cerca" onClick={() => setMostraCerca(v => !v)} />
            <AzioneNav icona="piu" etichetta="Aggiungi corso" onClick={() => setNuovo(true)} />
          </>
        }
        sotto={
          <div className="gut stack" style={{ gap: 10 }}>
            {mostraCerca && (
              <div className="search">
                <Icona nome="cerca" size={17} />
                <input
                  value={cerca} onChange={e => setCerca(e.target.value)}
                  placeholder="Cerca per nome, SSD o docente" autoFocus
                />
                {cerca && (
                  <button onClick={() => setCerca('')} aria-label="Pulisci">
                    <Icona nome="chiudi" size={15} peso={2.2} />
                  </button>
                )}
              </div>
            )}
            <Segmentato
              valore={filtro} cambia={setFiltro}
              opzioni={[
                { v: 'tutti', l: `Tutti ${s.insegnamenti.length}` },
                { v: 'dafare', l: `Da fare ${r.esamiRimanenti}` },
                { v: 'fatti', l: `Fatti ${r.esamiSuperati}` },
              ]}
            />
          </div>
        }
      >
        {s.insegnamenti.length === 0 ? (
          <Vuoto
            icona="libro"
            titolo="Piano di studi vuoto"
            testo="Aggiungi i tuoi insegnamenti: da qui registri voti, prenotazioni e CFU."
            azione={
              <button className="btn btn-primary btn-sm" onClick={() => setNuovo(true)}>
                <Icona nome="piu" size={15} peso={2.2} /> Aggiungi il primo
              </button>
            }
          />
        ) : filtrati.length === 0 ? (
          <Vuoto
            icona="cerca"
            titolo="Nessun risultato"
            testo={cerca ? `Niente che corrisponda a «${cerca}».` : 'Nessun esame in questo filtro.'}
          />
        ) : (
          gruppi.map(g => {
            const tot = g.voci.reduce((n, i) => n + i.cfu, 0)
            const fatti = g.voci.reduce((n, i) => n + (portaCfu(esameDi(s, i.id)) ? i.cfu : 0), 0)
            return (
              <section key={g.anno} className="gut" style={{ marginTop: 22 }}>
                <div className="anno-hdr">
                  <div className="between">
                    <span className="eyebrow">{g.anno}° anno</span>
                    <span className="foot dimmer num">{fatti}/{tot} CFU</span>
                  </div>
                  <div className="bar" style={{ height: 4, marginTop: 7 }}>
                    <div className="bar-fill" style={{ width: `${tot ? (fatti / tot) * 100 : 0}%` }} />
                  </div>
                </div>

                <div className="list" style={{ marginTop: 10 }}>
                  {g.voci.map(i => (
                    <RigaEsame key={i.id} ins={i} onClick={() => setAperto(i)} />
                  ))}
                </div>
              </section>
            )
          })
        )}

        <p className="gut caption dimmer" style={{ marginTop: 26, lineHeight: 1.5 }}>
          Tocca un esame per registrare il voto o prenotarti.
          Le idoneità portano CFU ma non entrano in media.
        </p>
      </Schermo>

      <SchedaEsame
        ins={aperto}
        chiudi={() => setAperto(null)}
        apriModifica={i => { setAperto(null); setModifica(i) }}
      />
      <SchedaInsegnamento
        ins={modifica} aperto={!!modifica} chiudi={() => setModifica(null)}
      />
      <SchedaInsegnamento
        ins={null} aperto={nuovo} chiudi={() => setNuovo(false)}
      />
    </>
  )
}

/* ---------------- Riga del libretto ---------------- */

function RigaEsame({ ins, onClick }: { ins: Insegnamento; onClick: () => void }) {
  const { s } = useApp()
  const e = esameDi(s, ins.id)
  const appello = e.appelloId ? s.appelli.find(a => a.id === e.appelloId) : undefined

  const periodo = ins.semestre === 0 ? 'annuale' : ins.semestre === 1 ? 'I sem' : 'II sem'
  const meta = [`${ins.cfu} CFU`, periodo]
  if (ins.tipo === 'a_scelta' || ins.tipo === 'tirocinio' || ins.tipo === 'prova_finale' || ins.tipo === 'lingua') {
    meta.push(LABEL_TIPO[ins.tipo])
  }

  return (
    <button className="list-row is-tappable" onClick={onClick} style={tinta(ins.tinta)}>
      <span className="riga-tinta" style={{ background: PIENO }} />
      <div className="grow stack" style={{ gap: 2 }}>
        <span className="callout strong clamp-2">{ins.nome}</span>
        <span className="foot dimmer truncate">
          {meta.join(' · ')}
          {e.stato === 'prenotato' && appello && ` · ${quando(appello.data)}`}
        </span>
      </div>
      <EsitoEsame stato={e.stato} voto={e.voto} lode={e.lode} escluso={e.escludiDaMedia} />
      <Icona nome="chevron" size={16} peso={2.2} className="chev" />
    </button>
  )
}

export function EsitoEsame({ stato, voto, lode, escluso }: {
  stato: string; voto?: number; lode?: boolean; escluso?: boolean
}) {
  if (stato === 'superato' && voto != null) {
    return (
      <span className="esito" data-lode={!!lode} data-escluso={!!escluso}>
        <span className="display-m num esito-voto">{voto}</span>
        {lode && <Icona nome="stella" size={11} pieno className="esito-lode" />}
      </span>
    )
  }
  if (stato === 'idoneo') return <span className="chip chip-pass">Idoneo</span>
  if (stato === 'prenotato') return <span className="chip chip-plan">Prenotato</span>
  if (stato === 'respinto') return <span className="chip chip-fail">Ritentare</span>
  return null
}
