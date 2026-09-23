import { useEffect, useMemo, useState } from 'react'
import { useApp, nuovoId } from '../lib/store'
import { useCatalogo, useFileCorso } from '../lib/catalogoContesto'
import { Icona } from '../components/Icona'
import { Schermo, Segmentato, Selezione, Sezione, Vuoto } from '../components/ui'
import {
  appelliDellaCoorte, cercaCorsi, codiceDellaCoorte, disponibilita,
  type Appelli, type Corso, type Orario, type Piano,
} from '../lib/dati'
import {
  anniDelPiano, cfuDelGruppo, insegnamentoDaCatalogo, nomeLeggibile, nomePersona, orarioDaCatalogo, tipoDa,
} from '../lib/daCatalogo'
import { chiaveManuale, normalizza } from '../lib/chiavi'
import { fmtData, fmtIstante, meseAnno, oggi } from '../lib/date'
import { plurale } from '../lib/testo'
import { GIORNI_BREVI, LABEL_TIPO, TINTE } from '../lib/types'
import type { VarianteOrario } from '../lib/catalogo'

/** Esplora i corsi del catalogo: piano, appelli e orario di
 *  qualunque corso, anche non il proprio. Utile per scegliere gli
 *  esami a scelta e per capire cosa fanno gli altri anni. */
export function Esplora({ chiudi }: { chiudi: () => void }) {
  const { s } = useApp()
  const { indice, stato, aggiornando, offline, aggiorna, aggiornatoIl } = useCatalogo()
  const [corso, setCorso] = useState<Corso | null>(null)
  const [cerca, setCerca] = useState('')

  const risultati = useMemo(
    () => (indice ? cercaCorsi(indice.corsi, cerca, normalizza) : []),
    [indice, cerca],
  )
  const mio = indice?.corsi.find(c => c.codice === s.profilo.codiceCorso)

  const perFamiglia = useMemo(() => {
    const m = new Map<string, Corso[]>()
    for (const c of risultati) {
      const f = famiglia(c.classe)
      m.set(f, [...(m.get(f) ?? []), c])
    }
    return ORDINE.filter(f => m.has(f)).map(f => [f, m.get(f)!] as const)
  }, [risultati])

  // Il return anticipato va dopo tutti gli hook, altrimenti al
  // secondo render se ne conta uno in meno e React si pianta.
  if (corso) return <DettaglioCorso corso={corso} chiudi={() => setCorso(null)} />

  return (
    <Schermo
      titolo="Esplora"
      sottotitolo={indice ? `${indice.corsi.length} corsi del catalogo Sapienza` : 'Il catalogo dei corsi Sapienza'}
      indietro={chiudi}
      sotto={indice && (
        <div className="gut">
          <div className="search">
            <Icona nome="cerca" size={17} />
            <input value={cerca} onChange={e => setCerca(e.target.value)}
              placeholder="Nome del corso, codice o classe" autoCorrect="off" />
            {cerca && (
              <button onClick={() => setCerca('')} aria-label="Pulisci">
                <Icona nome="chiudi" size={15} peso={2.2} />
              </button>
            )}
          </div>
        </div>
      )}
    >
      {!indice ? (
        <Vuoto
          icona="cerca"
          titolo={stato === 'avvio' || aggiornando ? 'Scarico il catalogo…' : 'Catalogo non ancora scaricato'}
          testo={offline
            ? 'Serve la connessione una volta sola: poi resta sul telefono e funziona anche offline.'
            : 'L’elenco dei corsi arriva dai dati pubblici del catalogo Sapienza.'}
          azione={!aggiornando && (
            <button className="btn btn-primary btn-sm" onClick={() => aggiorna(true)}>Riprova</button>
          )}
        />
      ) : risultati.length === 0 ? (
        <Vuoto icona="cerca" titolo="Nessun corso trovato"
          testo={`Niente che corrisponda a «${cerca}». Prova col codice del corso.`} />
      ) : (
        <>
          {mio && !cerca && (
            <Sezione titolo="Il tuo corso" stretto>
              <div className="list"><RigaCorso c={mio} apri={() => setCorso(mio)} /></div>
            </Sezione>
          )}
          {perFamiglia.map(([f, corsi]) => (
            <Sezione key={f} titolo={`${f} · ${corsi.length}`}>
              <div className="list">
                {corsi.map(c => <RigaCorso key={c.codice} c={c} apri={() => setCorso(c)} />)}
              </div>
            </Sezione>
          ))}
        </>
      )}

      {indice && <Aggiornato il={aggiornatoIl} />}
    </Schermo>
  )
}

const ORDINE = ['Triennali', 'Magistrali e a ciclo unico', 'Altri corsi']

/** Il gruppo dalla classe di laurea, che il catalogo dichiara: L- è
 *  triennale; LM- e LMG/ sono magistrali, a ciclo unico o no (la
 *  classe da sola non lo dice, quindi stanno insieme). */
function famiglia(classe?: string): string {
  if (classe && /^L-/i.test(classe)) return ORDINE[0]
  if (classe && /^LM/i.test(classe)) return ORDINE[1]
  return ORDINE[2]
}

function RigaCorso({ c, apri }: { c: Corso; apri: () => void }) {
  return (
    <button className="list-row is-tappable" onClick={apri}>
      <div className="grow stack" style={{ gap: 2, minWidth: 0 }}>
        <span className="callout strong">{c.nome}</span>
        <span className="foot dimmer num truncate">
          {[c.classe, `codice ${c.codice}`].filter(Boolean).join(' · ')}
        </span>
      </div>
      <Icona nome="chevron" size={16} peso={2.2} className="chev" />
    </button>
  )
}

function Aggiornato({ il }: { il?: string }) {
  return (
    <p className="gut caption dimmer" style={{ marginTop: 26, lineHeight: 1.5 }}>
      Dati pubblici del catalogo Sapienza (corsidilaurea.uniroma1.it)
      {il ? `, aggiornati il ${fmtIstante(il)}` : ''}.
      Fanno fede le pagine ufficiali.
    </p>
  )
}

/* ---------------- Dettaglio di un corso ---------------- */

type Scheda = 'piano' | 'appelli' | 'orario'

function DettaglioCorso({ corso, chiudi }: { corso: Corso; chiudi: () => void }) {
  const { s } = useApp()
  const { indice, aggiornatoIl } = useCatalogo()
  const mio = s.profilo.codiceCorso === corso.codice
  const disp = useMemo(() => disponibilita(indice, corso.codice), [indice, corso.codice])

  // La coorte: la propria se è il proprio corso, altrimenti la più
  // recente di cui c'è il piano.
  const coorti = corso.coorti.length ? corso.coorti.map(k => k.anno) : disp.piani
  const iniziale = mio && coorti.includes(s.profilo.immatricolazione)
    ? s.profilo.immatricolazione
    : disp.piani[0] ?? coorti[0]
  const [coorte, setCoorte] = useState<number | undefined>(iniziale)
  const [scheda, setScheda] = useState<Scheda>('piano')
  const f = useFileCorso(corso, coorte)
  const codiceCoorte = coorte != null ? codiceDellaCoorte(corso, coorte) : corso.codice

  return (
    <Schermo
      titolo={corso.nome}
      indietro={chiudi}
      sottotitolo={<>{[corso.classe, `codice ${corso.codice}`].filter(Boolean).join(' · ')}</>}
      sotto={
        <div className="gut">
          <Segmentato
            valore={scheda} cambia={setScheda}
            opzioni={[
              { v: 'piano', l: 'Piano' },
              { v: 'appelli', l: 'Appelli' },
              { v: 'orario', l: 'Orario' },
            ]}
          />
        </div>
      }
    >
      {coorti.length > 1 && scheda !== 'appelli' && (
        <Sezione stretto>
          <div className="field">
            <span className="field-label">Coorte (anno di immatricolazione)</span>
            {/* Oltre tre coorti il segmentato non ci sta in larghezza */}
            {coorti.length > 3 ? (
              <Selezione
                valore={String(coorte)} cambia={v => setCoorte(Number(v))}
                opzioni={coorti.map(a => ({ v: String(a), l: `${a}/${String((a + 1) % 100).padStart(2, '0')}` }))}
              />
            ) : (
              <Segmentato
                valore={String(coorte)} cambia={v => setCoorte(Number(v))}
                opzioni={coorti.map(a => ({ v: String(a), l: `${a}/${String((a + 1) % 100).padStart(2, '0')}` }))}
              />
            )}
          </div>
        </Sezione>
      )}

      {scheda === 'piano' && (
        f.piano
          ? <SchedaPiano piano={f.piano} mio={mio} />
          : <Mancante caricamento={f.caricamento} cosa="il piano di questa coorte" />
      )}
      {scheda === 'appelli' && (
        f.appelli
          ? <SchedaAppelli appelli={f.appelli} codiceCoorte={codiceCoorte} coorte={coorte} />
          : <Mancante caricamento={f.caricamento} cosa="gli appelli" />
      )}
      {scheda === 'orario' && (
        f.orario
          ? <SchedaOrario orario={f.orario} piano={f.piano} />
          : <Mancante
              caricamento={f.caricamento}
              cosa="un orario leggibile"
              link={`https://corsidilaurea.uniroma1.it/it/course/${codiceCoorte}/attendance/timetable`}
            />
      )}

      <Aggiornato il={aggiornatoIl} />
    </Schermo>
  )
}

function Mancante({ caricamento, cosa, link }: { caricamento: boolean; cosa: string; link?: string }) {
  if (caricamento) {
    return (
      <div className="gut" style={{ marginTop: 22 }}>
        <div className="card card-pad row" style={{ gap: 10 }}>
          <Icona nome="orologio" size={17} className="dimmer" />
          <span className="foot dim">Scarico dal catalogo…</span>
        </div>
      </div>
    )
  }
  return (
    <Vuoto
      icona="info"
      titolo={`Per ora non c’è ${cosa}`}
      testo={link
        ? 'Non tutte le facoltà pubblicano l’orario in un formato che si possa leggere. Consulta la pagina ufficiale; le lezioni puoi aggiungerle a mano dall’Orario.'
        : 'Il catalogo non l’ha ancora pubblicato, oppure serve una connessione per scaricarlo la prima volta.'}
      azione={link && (
        <a className="btn btn-secondary btn-sm" href={link} target="_blank" rel="noreferrer">
          Pagina ufficiale
        </a>
      )}
    />
  )
}

/* ---------------- Piano ---------------- */

function SchedaPiano({ piano, mio }: { piano: Piano; mio: boolean }) {
  const { s, d, avviso } = useApp()
  const anni = anniDelPiano(piano)
  const [anno, setAnno] = useState(String(Math.min(s.profilo.annoCorrente || 1, anni)))
  useEffect(() => { if (Number(anno) > anni) setAnno('1') }, [anni])   // eslint-disable-line react-hooks/exhaustive-deps

  const voci = piano.insegnamenti.filter(i => String(i.anno) === anno)
  const cfuAnno = voci.filter(i => !i.gruppo).reduce((n, i) => n + i.cfu, 0)
    + piano.gruppi.filter(g => voci.some(i => i.gruppo === g.nome)).reduce((n, g) => n + cfuDelGruppo(piano, g), 0)

  // Già nel libretto: per codice, o per nome se è una voce a mano.
  const codici = new Set(s.insegnamenti.map(i => i.codice).filter(Boolean))
  const nomi = new Set(s.insegnamenti.map(i => normalizza(i.nome)))
  const presente = (i: Piano['insegnamenti'][number]) => codici.has(i.codice) || nomi.has(normalizza(i.nome))

  function aggiungi(i: Piano['insegnamenti'][number]) {
    const base = insegnamentoDaCatalogo(i, s.insegnamenti.length)
    // Dal proprio piano porta il codice ufficiale; da un altro corso è
    // una scelta personale, e il catalogo non deve toccarla.
    const v = mio ? base : { ...base, id: chiaveManuale(i.nome, nuovoId), tipo: 'a_scelta' as const }
    d({ t: 'ins.add', v })
    avviso(`${v.nome} aggiunto al libretto`)
  }

  const sezioni = [1, 2, 0]
    .map(sm => ({ sm, voci: voci.filter(i => i.semestre === sm) }))
    .filter(g => g.voci.length > 0)

  return (
    <>
      <Sezione stretto>
        {anni > 1 && (
          <Segmentato
            valore={anno} cambia={setAnno}
            opzioni={Array.from({ length: anni }, (_, i) => ({ v: String(i + 1), l: `${i + 1}°` }))}
          />
        )}
        <div className="card card-pad row" style={{ gap: 18, marginTop: 12 }}>
          <div className="stack" style={{ gap: 1 }}>
            <span className="eyebrow">CFU nell'anno</span>
            <span className="display-m num">{cfuAnno}</span>
          </div>
          <div className="stack" style={{ gap: 1 }}>
            <span className="eyebrow">Insegnamenti</span>
            <span className="display-m num">{voci.length}</span>
          </div>
          <div className="grow" />
          {mio && <span className="chip chip-accent">Il tuo corso</span>}
        </div>
      </Sezione>

      {sezioni.map(g => (
        <Sezione key={g.sm} titolo={g.sm === 0 ? 'Annuali' : g.sm === 1 ? 'Primo semestre' : 'Secondo semestre'}>
          <div className="list">
            {g.voci.map(i => (
              <div key={i.codice} className="list-row">
                <div className="grow stack" style={{ gap: 2, minWidth: 0 }}>
                  <span className="callout strong">{nomeLeggibile(i.nome)}</span>
                  <span className="foot dimmer num">
                    {[`${i.cfu} CFU`, ssdUnici(i.ssd), tipoDa(i) !== 'obbligatorio' ? LABEL_TIPO[tipoDa(i)] : null]
                      .filter(Boolean).join(' · ')}
                  </span>
                  {i.gruppo && <span className="caption" style={{ color: 'var(--plan)' }}>{gruppoEtichetta(piano, i.gruppo)}</span>}
                  {i.moduli.length > 0 && (
                    <span className="caption dimmer">{i.moduli.map(m => nomeLeggibile(m.nome)).join(' · ')}</span>
                  )}
                </div>
                {presente(i) ? (
                  <span className="chip chip-pass"><Icona nome="check" size={11} peso={3} />Nel libretto</span>
                ) : (
                  <button className="btn btn-secondary btn-sm" style={{ flex: 'none' }}
                    onClick={() => aggiungi(i)} aria-label={`Aggiungi ${nomeLeggibile(i.nome)} al libretto`}>
                    <Icona nome="piu" size={14} peso={2.4} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </Sezione>
      ))}

      <p className="gut caption dimmer" style={{ marginTop: 22, lineHeight: 1.5 }}>
        {mio
          ? 'Il «+» aggiunge l’insegnamento al libretto col suo codice ufficiale. Nei gruppi opzionali scegli tu quali.'
          : 'Il «+» aggiunge l’insegnamento al tuo libretto come esame a scelta.'}
      </p>
    </>
  )
}

/** Un integrato con due moduli dello stesso settore porta l'SSD due
 *  volte («PHYS-06/A, PHYS-06/A»): a schermo basta una. */
function ssdUnici(ssd?: string): string | undefined {
  return ssd ? [...new Set(ssd.split(/,\s*/))].join(', ') : undefined
}

function gruppoEtichetta(piano: Piano, nome: string): string {
  const g = piano.gruppi.find(x => x.nome === nome)
  return g ? `${nome} · ${cfuDelGruppo(piano, g)} CFU a scelta` : nome
}

/* ---------------- Appelli ---------------- */

function SchedaAppelli({ appelli, codiceCoorte, coorte }: {
  appelli: Appelli; codiceCoorte: string; coorte?: number
}) {
  const oggiIso = oggi()
  const voci = appelliDellaCoorte(appelli, codiceCoorte)
    .filter(a => a.data >= oggiIso)
    .sort((a, b) => a.data.localeCompare(b.data) || a.nome.localeCompare(b.nome, 'it'))

  const perMese = useMemo(() => {
    const m = new Map<string, typeof voci>()
    for (const a of voci) m.set(meseAnno(a.data), [...(m.get(meseAnno(a.data)) ?? []), a])
    return [...m.entries()]
  }, [voci])

  if (voci.length === 0) {
    return <Vuoto icona="calendario" titolo="Nessun appello in arrivo"
      testo="Il catalogo non elenca appelli futuri per questa coorte." />
  }

  return (
    <>
      <p className="gut foot dim" style={{ marginTop: 16, lineHeight: 1.5 }}>
        {plurale(voci.length, 'appello', 'appelli')} in arrivo
        {coorte != null && codiceCoorte !== appelli.codiceCorso ? ` per la coorte ${coorte} (codice ${codiceCoorte})` : ''}.
        Ci si prenota su Infostud, nelle finestre indicate.
      </p>
      {perMese.map(([mese, lista]) => (
        <Sezione key={mese} titolo={mese}>
          <div className="list">
            {lista.map((a, n) => (
              <div key={`${a.codice}-${a.data}-${n}`} className="list-row">
                <div className="stack" style={{ gap: 0, width: 44, flex: 'none' }}>
                  <span className="display-m num" style={{ lineHeight: 1 }}>{Number(a.data.slice(8, 10))}</span>
                  <span className="caption dimmer">{GIORNI_BREVI[new Date(`${a.data}T12:00:00`).getDay() || 7]}</span>
                </div>
                <div className="grow stack" style={{ gap: 2, minWidth: 0 }}>
                  <span className="callout strong">{nomeLeggibile(a.nome)}</span>
                  {a.docenti.length > 0 && <span className="foot dimmer truncate">{a.docenti.map(nomePersona).join(', ')}</span>}
                  {(a.prenotazioniDal || a.prenotazioniAl) && (
                    <span className="caption dimmer num">
                      Prenotazioni
                      {a.prenotazioniDal && ` dal ${fmtData(a.prenotazioniDal, 'breve')}`}
                      {a.prenotazioniAl && ` al ${fmtData(a.prenotazioniAl, 'breve')}`}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Sezione>
      ))}
    </>
  )
}

/* ---------------- Orario ---------------- */

function SchedaOrario({ orario, piano }: { orario: Orario; piano?: Piano }) {
  const { orario: o, senzaAnno, annoNelPiano } = useMemo(() => orarioDaCatalogo(orario, piano), [orario, piano])
  const anni = [...new Set(o.varianti.map(v => v.anno))].sort()
  const [anno, setAnno] = useState(String(anni[0] ?? 1))
  const varianti = o.varianti.filter(v => String(v.anno) === anno)

  return (
    <>
      <p className="gut foot dim" style={{ marginTop: 16, lineHeight: 1.5 }}>
        {o.semestre}° semestre {o.aa}
        {o.dal && o.al && `, lezioni dal ${fmtData(o.dal, 'breve')} al ${fmtData(o.al, 'medio')}`}.
        Gli orari cambiano spesso: fa fede la pagina ufficiale.
      </p>

      {anni.length > 1 && (
        <Sezione stretto>
          <Segmentato valore={anno} cambia={setAnno}
            opzioni={anni.map(a => ({ v: String(a), l: `${a}° anno` }))} />
        </Sezione>
      )}

      {varianti.length > 0 && (
        <Sezione titolo={anni.length ? `${anno}° anno` : undefined}>
          <div className="list">{varianti.map((v, i) => <RigaVariante key={i} v={v} />)}</div>
        </Sezione>
      )}

      {senzaAnno.length > 0 && (
        <Sezione titolo={`Senza anno dichiarato · ${senzaAnno.length}`}>
          <p className="caption dimmer" style={{ margin: '0 0 10px', lineHeight: 1.5, paddingInline: 4 }}>
            La fonte pubblica queste lezioni senza dire a quale anno o canale
            appartengono. Non le assegno a nessun anno: dove il piano dice
            l’anno dell’insegnamento, lo riporto solo come indicazione.
          </p>
          <div className="list">
            {senzaAnno.map((v, i) => (
              <RigaVariante key={i} v={v} nota={annoNelPiano[v.ins] ? `nel piano: ${annoNelPiano[v.ins]}° anno` : undefined} />
            ))}
          </div>
        </Sezione>
      )}
    </>
  )
}

function RigaVariante({ v, nota }: { v: VarianteOrario; nota?: string }) {
  return (
    <div className="list-row" style={{ alignItems: 'flex-start' }}>
      <span aria-hidden="true" style={{
        width: 4, alignSelf: 'stretch', borderRadius: 2, flex: 'none',
        background: `hsl(${TINTE[hash(v.ins) % TINTE.length].h} 45% 55%)`,
      }} />
      <div className="grow stack" style={{ gap: 3, minWidth: 0 }}>
        <span className="callout strong">{v.ins}</span>
        {(v.etichetta || v.docente || nota) && (
          <span className="foot dimmer">
            {[v.etichetta, v.docente, nota].filter(Boolean).join(' · ')}
          </span>
        )}
        {v.slot.map((sl, k) => (
          <span key={k} className="foot dim num">
            {GIORNI_BREVI[sl.giorno]} {sl.inizio}–{sl.fine}
            {sl.aula && ` · ${sl.aula}`}
            {sl.modulo && <span className="dimmer"> · {sl.modulo}</span>}
          </span>
        ))}
      </div>
    </div>
  )
}

/** Una tinta stabile per nome, così lo stesso insegnamento ha lo
 *  stesso colore in ogni anno e canale. */
function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return h
}
