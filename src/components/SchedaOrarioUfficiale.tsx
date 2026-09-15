/* ============================================================
   Importa l'orario pubblicato dalla facoltà.
   Gli insegnamenti canalizzati hanno orari diversi per canale e al
   terzo anno i laboratori sono alternativi: si sceglie una variante
   per insegnamento invece di riversare tutto nel calendario.
   ============================================================ */

import { useEffect, useMemo, useState } from 'react'
import { useApp, nuovoId } from '../lib/store'
import { Foglio, Campo, Segmentato } from './ui'
import { Icona } from './Icona'
import { CATALOGO, type CorsoLaurea, type VarianteOrario } from '../lib/catalogo'
import { GIORNI_BREVI, TINTE, type AnnoCorso, type Insegnamento } from '../lib/types'
import { giornoSettimana } from '../lib/date'
import { fmtData } from '../lib/date'
import { plurale } from '../lib/testo'

/** Il corso del catalogo da cui viene il profilo, se ne ha uno. */
export function corsoDelProfilo(catalogoId?: string, nome?: string): CorsoLaurea | undefined {
  if (catalogoId) {
    const c = CATALOGO.find(x => x.id === catalogoId)
    if (c) return c
  }
  return nome ? CATALOGO.find(x => x.nome === nome) : undefined
}

export function SchedaOrarioUfficiale({ corso, aperto, chiudi }: {
  corso: CorsoLaurea
  aperto: boolean
  chiudi: () => void
}) {
  const { s, d, avviso } = useApp()
  const orario = corso.orario!

  const [anno, setAnno] = useState<AnnoCorso>(s.profilo.annoCorrente)
  const [scelte, setScelte] = useState<Record<string, number>>({})
  const [dal, setDal] = useState('')
  const [al, setAl] = useState('')

  // Varianti dell'anno scelto, raggruppate per insegnamento.
  const gruppi = useMemo(() => {
    const m = new Map<string, VarianteOrario[]>()
    for (const v of orario.varianti) {
      if (v.anno !== anno) continue
      m.set(v.ins, [...(m.get(v.ins) ?? []), v])
    }
    return Array.from(m.entries())
  }, [orario, anno])

  useEffect(() => {
    if (!aperto) return
    setDal(orario.dal); setAl(orario.al)
    setAnno(s.profilo.annoCorrente)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aperto])

  // Dove c'è una sola possibilità non c'è niente da scegliere:
  // si preseleziona e si lascia decidere solo sui canali.
  useEffect(() => {
    const iniziali: Record<string, number> = {}
    for (const [ins, varianti] of gruppi) if (varianti.length === 1) iniziali[ins] = 0
    setScelte(iniziali)
  }, [gruppi])

  const totaleLezioni = useMemo(
    () => gruppi.reduce((n, [ins, varianti]) => {
      const i = scelte[ins]
      return n + (i == null ? 0 : varianti[i].slot.length)
    }, 0),
    [gruppi, scelte],
  )

  function importa() {
    if (totaleLezioni === 0) { avviso('Scegli almeno un insegnamento'); return }
    if (dal && al && al < dal) { avviso('Il periodo finisce prima di iniziare'); return }

    let aggiunte = 0
    for (const [nomeIns, varianti] of gruppi) {
      const idx = scelte[nomeIns]
      if (idx == null) continue
      const v = varianti[idx]

      // Aggancia l'insegnamento già nel libretto; se manca (per
      // esempio l'hai cancellato) lo ricrea dal piano ufficiale.
      let ins: Insegnamento | undefined =
        s.insegnamenti.find(i => i.nome.toLowerCase() === nomeIns.toLowerCase())

      if (!ins) {
        const riga = corso.piano.find(r => r[0] === nomeIns)
        ins = {
          id: nuovoId(),
          nome: nomeIns,
          cfu: riga?.[1] ?? 6,
          anno: (riga?.[2] ?? anno) as AnnoCorso,
          semestre: (riga?.[3] ?? orario.semestre) as Insegnamento['semestre'],
          tipo: riga?.[4] ?? 'caratterizzante',
          ssd: riga?.[5],
          tinta: (s.insegnamenti.length + aggiunte) % TINTE.length,
        }
        d({ t: 'ins.add', v: ins })
      }
      if (v.docente && !ins.docente) d({ t: 'ins.set', id: ins.id, v: { docente: v.docente } })

      // Via le lezioni già presenti per questo corso: reimportare
      // non deve raddoppiare le righe in calendario.
      for (const vecchia of s.lezioni.filter(l => l.insegnamentoId === ins!.id)) {
        d({ t: 'lezione.del', id: vecchia.id })
      }
      for (const sl of v.slot) {
        // I giorni di sospensione del suo giorno della settimana
        // diventano date saltate: il calendario combacia con quello vero.
        const saltate = orario.sospese.filter(g => giornoSettimana(g) === sl.giorno)
        d({ t: 'lezione.add', v: {
          id: nuovoId(), insegnamentoId: ins.id,
          giorno: sl.giorno, inizio: sl.inizio, fine: sl.fine,
          aula: sl.aula, edificio: sl.edificio, modulo: sl.modulo,
          dal: dal || undefined, al: al || undefined,
          saltate: saltate.length ? saltate : undefined,
        }})
        aggiunte++
      }
    }
    avviso(`${plurale(aggiunte, 'lezione', 'lezioni')} in calendario`)
    chiudi()
  }

  const daScegliere = gruppi.filter(([ins, v]) => v.length > 1 && scelte[ins] == null).length

  return (
    <Foglio
      aperto={aperto} chiudi={chiudi}
      titolo="Orario ufficiale"
      piede={
        <button className="btn btn-primary btn-block" onClick={importa} disabled={totaleLezioni === 0}>
          {totaleLezioni === 0
            ? 'Scegli gli insegnamenti'
            : `Aggiungi ${plurale(totaleLezioni, 'lezione', 'lezioni')}`}
        </button>
      }
    >
      <div className="card card-pad row" style={{ gap: 10, marginTop: 4 }}>
        <Icona nome="info" size={17} className="dimmer" />
        <span className="foot dim" style={{ lineHeight: 1.45 }}>
          {corso.nome} · {orario.semestre}° semestre {orario.aa}, dal calendario
          ufficiale del catalogo. Gli orari possono cambiare in corso d'anno:
          la fonte è <span className="strong">{orario.fonte}</span>.
        </span>
      </div>

      <div className="field" style={{ marginTop: 18 }}>
        <span className="field-label">Anno di corso</span>
        <Segmentato
          valore={String(anno)}
          cambia={v => setAnno(Number(v) as AnnoCorso)}
          opzioni={Array.from({ length: corso.anni }, (_, i) => ({ v: String(i + 1), l: `${i + 1}° anno` }))}
        />
      </div>

      {daScegliere > 0 && (
        <p className="foot" style={{ color: 'var(--plan)', marginTop: 14 }}>
          {daScegliere === 1
            ? 'Un insegnamento ha più canali: scegli il tuo.'
            : `${daScegliere} insegnamenti hanno più canali: scegli i tuoi.`}
        </p>
      )}

      <div className="stack" style={{ gap: 18, marginTop: 16 }}>
        {gruppi.map(([nomeIns, varianti]) => (
          <div key={nomeIns} className="stack" style={{ gap: 8 }}>
            <div className="between" style={{ alignItems: 'flex-start', gap: 8 }}>
              <span className="callout strong">{varianti[0].titolo ?? nomeIns}</span>
              {varianti.length > 1 && scelte[nomeIns] == null && (
                <span className="chip chip-plan" style={{ flex: 'none' }}>Da scegliere</span>
              )}
            </div>
            <div className="stack" style={{ gap: 6 }}>
              {varianti.map((v, i) => {
                const attiva = scelte[nomeIns] === i
                return (
                  <button
                    key={i} className="variante" data-on={attiva}
                    onClick={() => setScelte(p => ({
                      ...p,
                      // Ritoccare la stessa variante la toglie: si può
                      // anche non importare un insegnamento.
                      [nomeIns]: attiva ? (undefined as unknown as number) : i,
                    }))}
                  >
                    <span className="variante-check" data-on={attiva}>
                      {attiva && <Icona nome="check" size={12} peso={3} />}
                    </span>
                    <span className="grow stack" style={{ gap: 3, minWidth: 0 }}>
                      {(v.etichetta || v.docente) && (
                        <span className="foot strong truncate">
                          {v.etichetta}
                          {v.etichetta && v.docente && ' · '}
                          {v.docente}
                        </span>
                      )}
                      {v.slot.map((sl, k) => (
                        <span key={k} className="foot dimmer num">
                          {GIORNI_BREVI[sl.giorno]} {sl.inizio}–{sl.fine}
                          {sl.aula && ` · ${sl.aula}`}
                          {sl.modulo && <span className="dim"> · {sl.modulo}</span>}
                        </span>
                      ))}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="stack" style={{ gap: 12, marginTop: 22 }}>
        <span className="field-label">Periodo delle lezioni</span>
        <div className="row" style={{ gap: 12 }}>
          <div className="grow"><Campo label="Dal">
            <input type="date" className="input" value={dal} onChange={e => setDal(e.target.value)} />
          </Campo></div>
          <div className="grow"><Campo label="Al">
            <input type="date" className="input" value={al} onChange={e => setAl(e.target.value)} />
          </Campo></div>
        </div>
        <p className="caption dimmer" style={{ lineHeight: 1.5 }}>
          Primo e ultimo giorno di lezione pubblicati nel calendario ufficiale
          {dal && al && <> ({fmtData(dal, 'breve')} – {fmtData(al, 'medio')})</>}; i ponti e
          le vacanze di Natale vengono saltati da soli. Fuori da qui le lezioni
          spariscono dall'orario.
        </p>
      </div>
    </Foglio>
  )
}
