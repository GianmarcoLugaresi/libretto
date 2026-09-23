import { useMemo, useRef, useState } from 'react'
import { useApp, esporta, importa, cancellaTutto, nuovoId } from '../lib/store'
import { useCatalogo } from '../lib/catalogoContesto'
import { codiceDellaCoorte, type Corso } from '../lib/dati'
import { ricollega, type Ricollegamento } from '../lib/daCatalogo'
import { normalizza } from '../lib/chiavi'
import { DISCLAIMER, NOME_APP, PRIVACY_BREVE } from '../lib/app'
import { fmtIstante } from '../lib/date'
import { plurale } from '../lib/testo'
import { SchedaInfostud } from '../components/SchedaInfostud'
import { DaCollegare } from '../components/DaCollegare'
import { MockInfostudProvider, type InfostudProvider, type Scenario } from '../lib/infostud/provider'
import { WebViewInfostudProvider, webviewDisponibile } from '../lib/infostud/webview'
import { IN_PROVA } from '../lib/infostud/config'
import { Icona } from '../components/Icona'
import { Campo, Riga, Schermo, Segmentato, Selezione, Sezione } from '../components/ui'
import { riepilogo } from '../lib/stats'
import { annoAccademico } from '../lib/date'
import { NATIVO, NOTIFICHE_DEFAULT, elencoNotifiche } from '../lib/notifiche'
import { Interruttore } from '../components/ui'
import type { AnnoCorso, TipoCorsoLaurea } from '../lib/types'

export function Impostazioni({ chiudi, apriEsplora }: { chiudi: () => void; apriEsplora: () => void }) {
  const { s, d, avviso } = useApp()
  const r = riepilogo(s)
  const file = useRef<HTMLInputElement>(null)
  const [azzera, setAzzera] = useState(false)

  function scarica() {
    const blob = new Blob([esporta(s)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `mysapienza-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    avviso('Backup scaricato')
  }

  async function carica(f: File) {
    try {
      const stato = importa(await f.text())
      d({ t: 'carica', stato })
      avviso('Backup ripristinato')
    } catch (e) {
      avviso(e instanceof Error ? e.message : 'File non valido')
    }
  }

  return (
    <Schermo titolo="Profilo" indietro={chiudi}>
      <Sezione stretto>
        <div className="list">
          <Riga
            titolo="Esplora i corsi"
            sotto="Piani, appelli e orari di tutti i corsi"
            icona={<Icona nome="bussola" size={20} className="dim" />}
            onClick={apriEsplora} chevron
          />
        </div>
      </Sezione>

      <SezioneInfostud />

      <DatiPubblici />

      {/* ---------------- Profilo ---------------- */}
      <Sezione titolo="Chi sei">
        <div className="stack" style={{ gap: 16 }}>
          <Campo label="Nome">
            <input className="input" value={s.profilo.nome}
              onChange={e => d({ t: 'profilo', v: { nome: e.target.value } })}
              placeholder="Il tuo nome" />
          </Campo>
          <div className="row" style={{ gap: 12 }}>
            <div className="grow"><Campo label="Matricola" hint="Opzionale">
              <input className="input num" value={s.profilo.matricola ?? ''}
                onChange={e => d({ t: 'profilo', v: { matricola: e.target.value } })}
                placeholder="1234567" inputMode="numeric" />
            </Campo></div>
          </div>
          <Campo label="Corso di laurea">
            <input className="input" value={s.profilo.corsoDiLaurea}
              onChange={e => d({ t: 'profilo', v: { corsoDiLaurea: e.target.value } })} />
          </Campo>
          <Campo label="Facoltà" hint="Opzionale">
            <input className="input" value={s.profilo.facolta ?? ''}
              onChange={e => d({ t: 'profilo', v: { facolta: e.target.value } })} />
          </Campo>
        </div>
      </Sezione>

      {/* ---------------- Percorso ---------------- */}
      <Sezione titolo="Percorso">
        <div className="stack" style={{ gap: 16 }}>
          <div className="field">
            <span className="field-label">Tipo di corso</span>
            <Segmentato
              valore={s.profilo.tipo}
              cambia={v => {
                const t = v as TipoCorsoLaurea
                d({ t: 'profilo', v: {
                  tipo: t,
                  // I default tipici: così non devi reinserirli a mano.
                  cfuTotali: t === 'triennale' ? 180 : t === 'magistrale' ? 120 : 300,
                  durataAnni: t === 'triennale' ? 3 : t === 'magistrale' ? 2 : 5,
                }})
              }}
              opzioni={[
                { v: 'triennale', l: 'Triennale' },
                { v: 'magistrale', l: 'Magistrale' },
                { v: 'ciclo_unico', l: 'Ciclo unico' },
              ]}
            />
          </div>

          <div className="row" style={{ gap: 12 }}>
            <div className="grow"><Campo label="CFU per la laurea">
              <input className="input num" type="number" min={30} max={400}
                value={s.profilo.cfuTotali}
                onChange={e => d({ t: 'profilo', v: { cfuTotali: Number(e.target.value) || 180 } })} />
            </Campo></div>
            <div className="grow"><Campo label="Durata (anni)">
              <input className="input num" type="number" min={1} max={6}
                value={s.profilo.durataAnni}
                onChange={e => d({ t: 'profilo', v: { durataAnni: Number(e.target.value) || 3 } })} />
            </Campo></div>
          </div>

          <div className="row" style={{ gap: 12 }}>
            <div className="grow"><Campo label="Immatricolazione"
              hint={`A.A. ${s.profilo.immatricolazione}/${String((s.profilo.immatricolazione + 1) % 100).padStart(2, '0')}`}>
              <input className="input num" type="number" min={2000} max={2100}
                value={s.profilo.immatricolazione}
                onChange={e => d({ t: 'profilo', v: { immatricolazione: Number(e.target.value) || 2025 } })} />
            </Campo></div>
            <div className="grow"><Campo label="Anno attuale">
              <Selezione
                valore={String(s.profilo.annoCorrente)}
                cambia={v => d({ t: 'profilo', v: { annoCorrente: Number(v) as AnnoCorso } })}
                opzioni={Array.from({ length: 6 }, (_, i) => ({ v: String(i + 1), l: `${i + 1}° anno` }))}
              />
            </Campo></div>
          </div>
        </div>
      </Sezione>

      {/* ---------------- Calcolo ---------------- */}
      <Sezione titolo="Come calcolo la media">
        <div className="stack" style={{ gap: 16 }}>
          <div className="field">
            <span className="field-label">Quanto vale la lode</span>
            <Segmentato
              valore={String(s.impostazioni.valoreLode)}
              cambia={v => d({ t: 'impostazioni', v: { valoreLode: Number(v) as 30 | 31 | 32 } })}
              opzioni={[{ v: '30', l: '30' }, { v: '31', l: '31' }, { v: '32', l: '32' }]}
            />
            <span className="field-hint">
              Sapienza di norma conta la lode 30. Alcuni corsi la valorizzano
              di più nel calcolo del voto di partenza.
            </span>
          </div>

          <Campo label="Punti stimati per la tesi"
            hint="Entra nella proiezione del voto di laurea, non nella media.">
            <input className="input num" type="number" min={0} max={14}
              value={s.impostazioni.puntiTesi}
              onChange={e => d({ t: 'impostazioni', v: { puntiTesi: Math.max(0, Math.min(14, Number(e.target.value) || 0)) } })} />
          </Campo>

          <Campo label="Preavviso esami (giorni)"
            hint="Entro quanti giorni un appello prenotato è “imminente”.">
            <input className="input num" type="number" min={1} max={60}
              value={s.impostazioni.preavvisoGiorni}
              onChange={e => d({ t: 'impostazioni', v: { preavvisoGiorni: Math.max(1, Number(e.target.value) || 7) } })} />
          </Campo>
        </div>
      </Sezione>

      {/* ---------------- Notifiche (solo app) ---------------- */}
      {NATIVO && (() => {
        const n = { ...NOTIFICHE_DEFAULT, ...s.impostazioni.notifiche }
        const quante = elencoNotifiche(s, n).length
        const imposta = (v: Partial<typeof n>) => d({ t: 'impostazioni', v: { notifiche: { ...n, ...v } } })
        return (
          <Sezione titolo="Notifiche">
            <div className="list">
              <div className="list-row">
                <div className="grow stack" style={{ gap: 2 }}>
                  <span className="callout strong">Lezioni</span>
                  <span className="foot dimmer">Un avviso prima di ogni lezione</span>
                </div>
                <Interruttore acceso={n.lezioni} cambia={v => imposta({ lezioni: v })} etichetta="Notifiche lezioni" />
              </div>
              <div className="list-row">
                <div className="grow stack" style={{ gap: 2 }}>
                  <span className="callout strong">Esami</span>
                  <span className="foot dimmer">La sera prima, la mattina, e un promemoria per l'esito</span>
                </div>
                <Interruttore acceso={n.esami} cambia={v => imposta({ esami: v })} etichetta="Notifiche esami" />
              </div>
            </div>
            {n.lezioni && (
              <div className="field" style={{ marginTop: 14 }}>
                <span className="field-label">Preavviso lezioni</span>
                <Segmentato
                  valore={String(n.minutiPrima)}
                  cambia={v => imposta({ minutiPrima: Number(v) })}
                  opzioni={[5, 10, 15, 30].map(m => ({ v: String(m), l: `${m} min` }))}
                />
              </div>
            )}
            <p className="caption dimmer" style={{ marginTop: 10, lineHeight: 1.5 }}>
              {quante === 0 ? 'Nessuna notifica in programma.' : `${quante} notifiche in programma nei prossimi sette giorni.`}
              {' '}Si aggiornano da sole quando cambi orario o appelli.
            </p>
          </Sezione>
        )
      })()}

      {/* ---------------- Aspetto ---------------- */}
      <Sezione titolo="Aspetto">
        <div className="field">
          <Segmentato
            valore={s.impostazioni.tema === 'chiaro' ? 'chiaro' : 'scuro'}
            cambia={v => d({ t: 'impostazioni', v: { tema: v as 'chiaro' | 'scuro' } })}
            opzioni={[
              { v: 'scuro', l: 'Scuro' },
              { v: 'chiaro', l: 'Chiaro' },
            ]}
          />
        </div>
      </Sezione>

      {/* ---------------- Dati ---------------- */}
      <Sezione titolo="I tuoi dati">
        <div className="list">
          <Riga
            titolo="Scarica un backup"
            sotto={`${s.insegnamenti.length} esami, ${s.appelli.length} appelli, ${s.lezioni.length} lezioni`}
            icona={<Icona nome="scarica" size={20} className="dim" />}
            onClick={scarica} chevron
          />
          <Riga
            titolo="Ripristina da backup"
            sotto="Sostituisce tutto il contenuto attuale"
            icona={<Icona nome="carica" size={20} className="dim" />}
            onClick={() => file.current?.click()} chevron
          />
        </div>
        <input
          ref={file} type="file" accept="application/json,.json" className="sr-only"
          onChange={e => { const f = e.target.files?.[0]; if (f) carica(f); e.target.value = '' }}
        />

        <div className="card card-pad stack" style={{ gap: 8, marginTop: 10 }}>
          <div className="row" style={{ gap: 8 }}>
            <Icona nome="info" size={16} className="dimmer" />
            <span className="foot strong">Dove stanno i dati</span>
          </div>
          <p className="foot dim" style={{ lineHeight: 1.5 }}>
            Tutto resta nella memoria di questo browser: niente server, niente
            account, nessun dato che esce dal telefono. Il rovescio della medaglia
            è che se cancelli i dati del sito perdi il libretto — scarica un
            backup di tanto in tanto.
          </p>
        </div>
      </Sezione>

      {/* ---------------- Azzeramento ---------------- */}
      <Sezione titolo="Zona rossa">
        {azzera ? (
          <div className="card card-pad stack" style={{ gap: 12, borderColor: 'var(--fail)' }}>
            <div className="stack" style={{ gap: 3 }}>
              <span className="callout strong">Cancellare tutto?</span>
              <span className="foot dimmer">
                Spariscono {s.insegnamenti.length} esami, {r.cfuAcquisiti} CFU registrati,
                appelli e orario. Non si torna indietro.
              </span>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn btn-secondary grow" onClick={() => setAzzera(false)}>Annulla</button>
              <button className="btn btn-danger grow" onClick={() => {
                cancellaTutto(); location.reload()
              }}>Cancella tutto</button>
            </div>
          </div>
        ) : (
          <button className="btn btn-danger btn-block" onClick={() => setAzzera(true)}>
            <Icona nome="cestino" size={16} /> Ricomincia da zero
          </button>
        )}
      </Sezione>

      {/* ---------------- Info ---------------- */}
      <Sezione titolo={NOME_APP}>
        <div className="card card-pad stack" style={{ gap: 6 }}>
          <span className="foot strong">{DISCLAIMER}</span>
          <span className="foot dim">{PRIVACY_BREVE}</span>
          <span className="foot dim">Anno accademico in corso: {annoAccademico()}</span>
          <span className="foot dim">
            Piani, appelli e orari vengono dalle pagine pubbliche del catalogo
            Sapienza, lette ogni notte senza interpretarle: il tuo percorso
            individuale può comunque differire. Fa fede sempre Infostud.
          </span>
        </div>
      </Sezione>
    </Schermo>
  )
}

/* ---------------- Dati pubblici ---------------- */

function DatiPubblici() {
  const { s, d, avviso } = useApp()
  const { cat, indice, aggiornatoIl, aggiornando, offline, aggiorna, prepara } = useCatalogo()
  const [proposta, setProposta] = useState<{ corso: Corso; r?: Ricollegamento; senzaPiano?: boolean } | null>(null)
  const [preparo, setPreparo] = useState(false)

  // Un libretto nato prima del catalogo (piano statico, o scritto a
  // mano) si può agganciare al corso che ha esattamente lo stesso nome.
  const candidati = useMemo(() => {
    if (s.profilo.codiceCorso || !indice) return []
    const n = normalizza(s.profilo.corsoDiLaurea)
    return indice.corsi.filter(c => normalizza(c.nome) === n)
  }, [indice, s.profilo.codiceCorso, s.profilo.corsoDiLaurea])

  const mio = indice?.corsi.find(c => c.codice === s.profilo.codiceCorso)

  async function proponi(corso: Corso) {
    if (!cat) return
    setPreparo(true)
    try {
      await prepara(corso, s.profilo.immatricolazione)
      const piano = await cat.piano(codiceDellaCoorte(corso, s.profilo.immatricolazione), s.profilo.immatricolazione)
      setProposta(piano ? { corso, r: ricollega(s, piano, nuovoId) } : { corso, senzaPiano: true })
    } finally {
      setPreparo(false)
    }
  }

  function conferma() {
    if (!proposta) return
    const base = proposta.r?.stato ?? s
    d({ t: 'carica', stato: { ...base, profilo: { ...base.profilo, codiceCorso: proposta.corso.codice } } })
    avviso(proposta.r ? `${plurale(proposta.r.collegati, 'esame collegato', 'esami collegati')} al catalogo` : 'Corso collegato')
    setProposta(null)
  }

  return (
    <Sezione titolo="Dati pubblici">
      <div className="card card-pad stack" style={{ gap: 8 }}>
        <div className="between">
          <span className="callout strong">Catalogo Sapienza</span>
          {mio && <span className="chip chip-accent">{mio.nome}</span>}
        </div>
        <span className="foot dim num">
          {aggiornando
            ? 'Controllo se ci sono novità…'
            : aggiornatoIl
              ? `Aggiornato il ${fmtIstante(aggiornatoIl)}`
              : 'Non ancora scaricato'}
          {offline && !aggiornando && ' · ultimo tentativo senza rete'}
        </span>
        <span className="foot dimmer" style={{ lineHeight: 1.5 }}>
          Piani, appelli e orari arrivano dalle pagine pubbliche del catalogo,
          aggiornate ogni notte, e restano sul telefono. I tuoi esami e voti
          non passano di qui.
        </span>
        <button className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start', marginTop: 4 }}
          disabled={aggiornando} onClick={() => aggiorna(true)}>
          Aggiorna ora
        </button>
      </div>

      {candidati.length > 0 && !proposta && (
        <div className="card card-accent card-pad stack" style={{ gap: 10, marginTop: 12 }}>
          <span className="callout strong">Collega il libretto al catalogo</span>
          <span className="foot" style={{ lineHeight: 1.5, opacity: 0.85 }}>
            Il tuo libretto è nato prima del catalogo. Collegandolo, gli esami
            prendono il codice ufficiale e compaiono gli appelli e l'orario della
            tua coorte ({s.profilo.immatricolazione}/{String((s.profilo.immatricolazione + 1) % 100).padStart(2, '0')}).
            Voti e note restano tutti.
          </span>
          {candidati.map(c => (
            <button key={c.codice} className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-start' }}
              disabled={preparo} onClick={() => proponi(c)}>
              {preparo ? 'Preparo…' : `Collega a ${c.nome} · ${c.codice}`}
            </button>
          ))}
        </div>
      )}

      {proposta && (
        <div className="card card-pad stack" style={{ gap: 10, marginTop: 12 }}>
          <span className="callout strong">Prima di confermare</span>
          {proposta.senzaPiano ? (
            <span className="foot dim" style={{ lineHeight: 1.5 }}>
              Il piano della tua coorte non è ancora nel catalogo. Collego solo il
              corso, per appelli e orario: gli esami del libretto restano come sono.
            </span>
          ) : (
            <div className="stack" style={{ gap: 6 }}>
              <span className="foot dim" style={{ lineHeight: 1.5 }}>
                {plurale(proposta.r!.collegati, 'esame prende', 'esami prendono')} il codice ufficiale.
              </span>
              {proposta.r!.personali.length > 0 && (
                <span className="foot dim" style={{ lineHeight: 1.5 }}>
                  {plurale(proposta.r!.personali.length, 'resta', 'restano')} come voce personale, perché
                  nel piano ufficiale non c'è con lo stesso nome e gli stessi CFU:{' '}
                  <span className="strong">{proposta.r!.personali.join(', ')}</span>.
                </span>
              )}
              {proposta.r!.ambigui.length > 0 && (
                <span className="foot dim" style={{ lineHeight: 1.5 }}>
                  Non collego, perché hanno più corrispondenze possibili:{' '}
                  <span className="strong">{proposta.r!.ambigui.join(', ')}</span>.
                </span>
              )}
              <span className="caption dimmer">Voti, note, appelli e lezioni restano tutti al loro posto.</span>
            </div>
          )}
          <div className="row" style={{ gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={() => setProposta(null)}>Annulla</button>
            <button className="btn btn-primary btn-sm" onClick={conferma}>Collega</button>
          </div>
        </div>
      )}
    </Sezione>
  )
}

/* ---------------- Infostud ---------------- */

function SezioneInfostud() {
  const { s } = useApp()
  const [provider, setProvider] = useState<InfostudProvider | null>(null)
  const [scenario, setScenario] = useState<Scenario>('esami')
  const nativo = webviewDisponibile()
  const ufficiali = Object.values(s.infostud.esami)
  const sparite = ufficiali.filter(u => u.nonPiuPresente).length

  return (
    <Sezione titolo="Infostud">
      <div className="card card-pad stack" style={{ gap: 8 }}>
        <span className="callout strong">Esami verbalizzati</span>
        <span className="foot dim num">
          {s.sync.infostudIl ? `Ultima sincronizzazione il ${fmtIstante(s.sync.infostudIl)}` : 'Mai sincronizzato'}
          {ufficiali.length > 0 && ` · ${plurale(ufficiali.length, 'esame ufficiale', 'esami ufficiali')}`}
          {sparite > 0 && ` · ${sparite} non più su Infostud`}
        </span>
        <span className="foot dimmer" style={{ lineHeight: 1.5 }}>
          Accedi con SPID o CIE solo quando vuoi aggiornare, di solito dopo un
          esame. Il resto del tempo i dati restano sul telefono e non serve
          nessun accesso.
        </span>
        {nativo ? (
          <button className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-start', marginTop: 4 }}
            onClick={() => setProvider(new WebViewInfostudProvider())}>
            Aggiorna da Infostud
          </button>
        ) : (
          <span className="foot dim" style={{ lineHeight: 1.5 }}>
            Si fa dall’app per iPhone: il browser non può aprire l’accesso di
            Infostud né leggerne i dati. Qui puoi continuare a mano.
          </span>
        )}
        {IN_PROVA && (
          <span className="caption" style={{ color: 'var(--plan)' }}>
            Build di prova: l’accesso va sull’Infostud finto del server di sviluppo.
          </span>
        )}
        {import.meta.env.DEV && (
          <div className="stack" style={{ gap: 8, marginTop: 6 }}>
            <span className="field-label" style={{ margin: 0 }}>Solo in sviluppo: provider di prova</span>
            <Selezione valore={scenario} cambia={v => setScenario(v as Scenario)} opzioni={[
              { v: 'esami', l: 'Quattro esami finti' },
              { v: 'vuoto', l: 'Carriera vuota' },
              { v: 'accesso-fallito', l: 'Accesso non riuscito' },
              { v: 'irraggiungibile', l: 'Infostud irraggiungibile' },
              { v: 'formato-cambiato', l: 'Formato cambiato' },
            ]} />
            <button className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }}
              onClick={() => setProvider(new MockInfostudProvider(scenario))}>
              Prova con dati finti
            </button>
          </div>
        )}
      </div>

      {s.infostud.daCollegare.length > 0 && (
        <div className="card card-pad" style={{ marginTop: 12 }}><DaCollegare /></div>
      )}

      {provider && <SchedaInfostud aperto provider={provider} chiudi={() => setProvider(null)} />}
    </Sezione>
  )
}
