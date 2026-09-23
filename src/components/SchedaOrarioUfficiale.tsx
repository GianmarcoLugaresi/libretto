/* ============================================================
   Importa l'orario pubblicato dalla facoltà.
   Gli insegnamenti canalizzati hanno orari diversi per canale e al
   terzo anno i laboratori sono alternativi: si sceglie una variante
   per insegnamento invece di riversare tutto nel calendario.

   La fonte può essere l'orario trascritto a mano (Design, da
   app.arc) o quello del catalogo pubblico: il foglio è lo stesso.
   ============================================================ */

import { useEffect, useMemo, useState } from 'react'
import { useApp, nuovoId } from '../lib/store'
import { chiaveDaPiano, chiaveManuale, normalizza } from '../lib/chiavi'
import { Foglio, Campo, Segmentato } from './ui'
import { Icona } from './Icona'
import { CATALOGO, type CorsoLaurea, type OrarioUfficiale, type VarianteOrario } from '../lib/catalogo'
import { insegnamentoDaCatalogo, orarioDaCatalogo, trovaNelPiano } from '../lib/daCatalogo'
import type { Orario, Piano } from '../lib/dati'
import { GIORNI_BREVI, TINTE, type AnnoCorso, type Insegnamento } from '../lib/types'
import { giornoSettimana } from '../lib/date'
import { fmtData } from '../lib/date'
import { plurale } from '../lib/testo'

/** Tutto ciò che serve al foglio, qualunque sia la fonte. */
export interface FonteOrario {
  nomeCorso: string
  anni: number
  orario: OrarioUfficiale
  /** Lezioni che la fonte non attribuisce a nessun anno */
  senzaAnno: VarianteOrario[]
  /** L'anno che il piano dà a un insegnamento, solo come indicazione */
  annoNelPiano: Record<string, number>
  /** L'insegnamento da mettere nel libretto se non c'è ancora */
  modello: (v: VarianteOrario, anno: AnnoCorso, tinta: number) => Insegnamento
}

/** Il corso del catalogo statico da cui viene il profilo, se ne ha uno. */
export function corsoDelProfilo(catalogoId?: string, nome?: string): CorsoLaurea | undefined {
  if (catalogoId) {
    const c = CATALOGO.find(x => x.id === catalogoId)
    if (c) return c
  }
  return nome ? CATALOGO.find(x => x.nome === nome) : undefined
}

/** L'orario trascritto a mano, per i corsi che ce l'hanno. */
export function fonteStatica(corso: CorsoLaurea): FonteOrario | undefined {
  const orario = corso.orario
  if (!orario) return undefined
  return {
    nomeCorso: corso.nome, anni: corso.anni, orario, senzaAnno: [], annoNelPiano: {},
    modello: (v, anno, tinta) => {
      const riga = corso.piano.find(r => r[0] === v.ins)
      return {
        // viene dal piano del corso, quindi porta la chiave del piano
        id: chiaveDaPiano(corso.id, v.ins),
        nome: v.ins,
        cfu: riga?.[1] ?? 6,
        anno: (riga?.[2] ?? anno) as AnnoCorso,
        semestre: (riga?.[3] ?? orario.semestre) as Insegnamento['semestre'],
        tipo: riga?.[4] ?? 'caratterizzante',
        ssd: riga?.[5],
        tinta,
      }
    },
  }
}

/** L'orario del catalogo pubblico. Un insegnamento che il piano non
 *  conosce entra come voce personale, senza CFU: non si inventano. */
export function fonteCatalogo(o: Orario, piano: Piano | undefined, nomeCorso: string, anni: number): FonteOrario {
  const { orario, senzaAnno, annoNelPiano } = orarioDaCatalogo(o, piano)
  return {
    nomeCorso, anni, orario, senzaAnno, annoNelPiano,
    modello: (v, anno, tinta) => {
      const trovato = trovaNelPiano(piano, v.ins, v.codice)
      if (trovato) return insegnamentoDaCatalogo(trovato.ins, tinta)
      return {
        id: chiaveManuale(v.ins, nuovoId), nome: v.ins, cfu: 0, anno,
        semestre: orario.semestre, tipo: 'a_scelta', tinta,
      }
    },
  }
}

export function SchedaOrarioUfficiale({ fonte, aperto, chiudi }: {
  fonte: FonteOrario
  aperto: boolean
  chiudi: () => void
}) {
  const { s, d, avviso } = useApp()
  const { orario } = fonte

  const [anno, setAnno] = useState<AnnoCorso>(s.profilo.annoCorrente)
  const [scelte, setScelte] = useState<Record<string, number>>({})
  const [dal, setDal] = useState('')
  const [al, setAl] = useState('')
  const [mostraSenzaAnno, setMostraSenzaAnno] = useState(false)

  // Varianti dell'anno scelto, raggruppate per insegnamento. Le
  // lezioni senza anno hanno una chiave loro, così non si confondono
  // con quelle dell'anno anche quando l'insegnamento è lo stesso.
  const gruppi = useMemo(() => raggruppa(orario.varianti.filter(v => v.anno === anno), ''), [orario, anno])
  const gruppiSenzaAnno = useMemo(() => raggruppa(fonte.senzaAnno, 'senza:'), [fonte.senzaAnno])
  const tutti = useMemo(() => [...gruppi, ...gruppiSenzaAnno], [gruppi, gruppiSenzaAnno])

  useEffect(() => {
    if (!aperto) return
    setDal(orario.dal); setAl(orario.al)
    setAnno(s.profilo.annoCorrente)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aperto])

  // Dove c'è una sola possibilità non c'è niente da scegliere:
  // si preseleziona e si lascia decidere solo sui canali. Le lezioni
  // senza anno non si preselezionano mai: le sceglie lo studente.
  useEffect(() => {
    const iniziali: Record<string, number> = {}
    for (const [chiave, varianti] of gruppi) if (varianti.length === 1) iniziali[chiave] = 0
    setScelte(iniziali)
  }, [gruppi])

  const totaleLezioni = useMemo(
    () => tutti.reduce((n, [chiave, varianti]) => {
      const i = scelte[chiave]
      return n + (i == null ? 0 : varianti[i].slot.length)
    }, 0),
    [tutti, scelte],
  )

  function importa() {
    if (totaleLezioni === 0) { avviso('Scegli almeno un insegnamento'); return }
    if (dal && al && al < dal) { avviso('Il periodo finisce prima di iniziare'); return }

    let aggiunte = 0
    const creati: Insegnamento[] = []
    for (const [chiave, varianti] of tutti) {
      const idx = scelte[chiave]
      if (idx == null) continue
      const v = varianti[idx]

      // Aggancia l'insegnamento già nel libretto: prima per codice,
      // poi per nome normalizzato (le fonti scrivono lo stesso nome
      // con accenti e apostrofi diversi). Se manca lo crea.
      const tuttiIns = [...s.insegnamenti, ...creati]
      let ins: Insegnamento | undefined =
        (v.codice ? tuttiIns.find(i => i.codice === v.codice) : undefined)
        ?? tuttiIns.find(i => normalizza(i.nome) === normalizza(v.ins))

      if (!ins) {
        ins = fonte.modello(v, anno, (s.insegnamenti.length + creati.length) % TINTE.length)
        creati.push(ins)
        d({ t: 'ins.add', v: ins })
      }
      if (v.docente && !ins.docente) d({ t: 'ins.set', id: ins.id, v: { docente: v.docente } })

      // Via le lezioni già presenti per questo corso: reimportare
      // non deve raddoppiare le righe in calendario.
      for (const vecchia of s.lezioni.filter(l => l.insegnamentoId === ins!.id)) {
        d({ t: 'lezione.del', id: vecchia.id })
      }
      for (const sl of v.slot) {
        // Le date saltate: quelle della fascia se la fonte le dà una
        // per una, altrimenti i giorni di sospensione comuni che cadono
        // nel suo giorno della settimana.
        const saltate = sl.saltate ?? orario.sospese.filter(g => giornoSettimana(g) === sl.giorno)
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

  const daScegliere = gruppi.filter(([k, v]) => v.length > 1 && scelte[k] == null).length
  const sceltiSenzaAnno = gruppiSenzaAnno.filter(([k]) => scelte[k] != null).length

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
          {fonte.nomeCorso} · {orario.semestre}° semestre {orario.aa}, come pubblicato
          dalla facoltà. Gli orari sono provvisori e cambiano: verificali su{' '}
          <span className="strong">{orario.fonte}</span>.
        </span>
      </div>

      {fonte.anni > 1 && (
        <div className="field" style={{ marginTop: 18 }}>
          <span className="field-label">Anno di corso</span>
          <Segmentato
            valore={String(anno)}
            cambia={v => setAnno(Number(v) as AnnoCorso)}
            opzioni={Array.from({ length: fonte.anni }, (_, i) => ({ v: String(i + 1), l: fonte.anni > 3 ? `${i + 1}°` : `${i + 1}° anno` }))}
          />
        </div>
      )}

      {daScegliere > 0 && (
        <p className="foot" style={{ color: 'var(--plan)', marginTop: 14 }}>
          {daScegliere === 1
            ? 'Un insegnamento ha più canali: scegli il tuo.'
            : `${daScegliere} insegnamenti hanno più canali: scegli i tuoi.`}
        </p>
      )}

      {gruppi.length === 0 && (
        <p className="foot dim" style={{ marginTop: 16, lineHeight: 1.5 }}>
          Per il {anno}° anno la fonte non dichiara lezioni.
          {gruppiSenzaAnno.length > 0 && ' Guarda fra quelle senza anno qui sotto.'}
        </p>
      )}

      <div className="stack" style={{ gap: 18, marginTop: 16 }}>
        {gruppi.map(([chiave, varianti]) => (
          <GruppoVarianti key={chiave} chiave={chiave} varianti={varianti} scelte={scelte} setScelte={setScelte} />
        ))}
      </div>

      {gruppiSenzaAnno.length > 0 && (
        <div className="stack" style={{ gap: 12, marginTop: 24 }}>
          <button className="between" style={{ width: '100%', textAlign: 'left' }}
            onClick={() => setMostraSenzaAnno(v => !v)} aria-expanded={mostraSenzaAnno}>
            <span className="stack" style={{ gap: 2 }}>
              <span className="field-label" style={{ margin: 0 }}>
                Senza anno dichiarato · {gruppiSenzaAnno.length}
                {sceltiSenzaAnno > 0 && ` · ${sceltiSenzaAnno} scelti`}
              </span>
            </span>
            <Icona nome="chevron" size={16} peso={2.2}
              style={{ transform: mostraSenzaAnno ? 'rotate(90deg)' : undefined, transition: 'transform .2s' }} />
          </button>
          {mostraSenzaAnno && (
            <>
              <p className="caption dimmer" style={{ lineHeight: 1.5 }}>
                La fonte non dice a quale anno o canale appartengono queste
                lezioni, e non le assegno io: aggiungi solo quelle che sai
                essere tue.
              </p>
              {gruppiSenzaAnno.map(([chiave, varianti]) => (
                <GruppoVarianti key={chiave} chiave={chiave} varianti={varianti} scelte={scelte} setScelte={setScelte}
                  nota={fonte.annoNelPiano[varianti[0].ins] ? `Nel piano: ${fonte.annoNelPiano[varianti[0].ins]}° anno` : undefined} />
              ))}
            </>
          )}
        </div>
      )}

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
          Queste due date sono la finestra delle lezioni pubblicate, non una
          data ufficiale: correggile sul calendario didattico della facoltà.
          Fuori da qui le lezioni spariscono dall'orario.
          {dal && al && <> Ora: {fmtData(dal, 'breve')} – {fmtData(al, 'medio')}.</>}
        </p>
      </div>
    </Foglio>
  )
}

function raggruppa(varianti: VarianteOrario[], prefisso: string): [string, VarianteOrario[]][] {
  const m = new Map<string, VarianteOrario[]>()
  for (const v of varianti) {
    const k = prefisso + v.ins
    m.set(k, [...(m.get(k) ?? []), v])
  }
  return Array.from(m.entries())
}

function GruppoVarianti({ chiave, varianti, scelte, setScelte, nota }: {
  chiave: string
  varianti: VarianteOrario[]
  scelte: Record<string, number>
  setScelte: (f: (p: Record<string, number>) => Record<string, number>) => void
  nota?: string
}) {
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="between" style={{ alignItems: 'flex-start', gap: 8 }}>
        <span className="stack" style={{ gap: 1 }}>
          <span className="callout strong">{varianti[0].titolo ?? varianti[0].ins}</span>
          {nota && <span className="caption dimmer">{nota}</span>}
        </span>
        {varianti.length > 1 && scelte[chiave] == null && !chiave.startsWith('senza:') && (
          <span className="chip chip-plan" style={{ flex: 'none' }}>Da scegliere</span>
        )}
      </div>
      <div className="stack" style={{ gap: 6 }}>
        {varianti.map((v, i) => {
          const attiva = scelte[chiave] === i
          return (
            <button
              key={i} className="variante" data-on={attiva}
              onClick={() => setScelte(p => {
                // Ritoccare la stessa variante la toglie: si può
                // anche non importare un insegnamento.
                const n = { ...p }
                if (attiva) delete n[chiave]
                else n[chiave] = i
                return n
              })}
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
  )
}
