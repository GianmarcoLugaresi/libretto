import { useMemo, useState } from 'react'
import { useApp } from '../lib/store'
import { useCatalogo, useFileCorso } from '../lib/catalogoContesto'
import { CATALOGO, espandi, type CorsoLaurea } from '../lib/catalogo'
import { cercaCorsi, disponibilita, type Corso } from '../lib/dati'
import {
  anniDelPiano, cfuTotali, insegnamentiIniziali, tipoCorso,
} from '../lib/daCatalogo'
import { normalizza } from '../lib/chiavi'
import { DISCLAIMER, NOME_APP, PRIVACY_BREVE } from '../lib/app'
import { Icona } from '../components/Icona'
import { Campo } from '../components/ui'
import { annoAccademico } from '../lib/date'
import { plurale } from '../lib/testo'
import type { AnnoCorso } from '../lib/types'

/** Quanti corsi mostrare prima di chiedere di affinare la ricerca:
 *  318 righe scorrono, ma nessuno le legge. */
const MOSTRATI = 40

export function Onboarding() {
  const { d } = useApp()
  const { indice, stato, aggiornando, offline, aggiorna } = useCatalogo()
  const [passo, setPasso] = useState(0)
  const [nome, setNome] = useState('')
  const [cerca, setCerca] = useState('')
  // Il corso viene dal catalogo scaricato; se il catalogo non c'è
  // (primo avvio senza rete) resta il piano statico di Design.
  const [scelto, setScelto] = useState<Corso | null>(null)
  const [statico, setStatico] = useState<CorsoLaurea | null>(null)
  const [daZero, setDaZero] = useState(false)
  const annoOggi = Number(annoAccademico().slice(0, 4))
  const [imm, setImm] = useState(annoOggi)
  const [anno, setAnno] = useState<AnnoCorso>(1)

  const disp = useMemo(() => (scelto ? disponibilita(indice, scelto.codice) : null), [indice, scelto])
  const coorteScelta = scelto ? imm : undefined
  const file = useFileCorso(scelto ?? undefined, passo === 2 ? coorteScelta : undefined)

  const risultati = useMemo(
    () => (indice ? cercaCorsi(indice.corsi, cerca, normalizza) : []),
    [indice, cerca],
  )

  const pianoPronto = !!scelto && !!file.piano
  // Gli anni li dice il piano. Senza piano si va sul tipico della
  // classe (L- tre anni, LM due), che resta modificabile dal profilo.
  const anniPossibili = file.piano
    ? anniDelPiano(file.piano)
    : statico?.anni ?? (scelto && /^LM/i.test(scelto.classe ?? '') ? 2 : 3)
  const tipo = scelto ? tipoCorso(scelto.classe, anniPossibili) : statico?.tipo ?? 'triennale'
  const iniziali = useMemo(() => (file.piano ? insegnamentiIniziali(file.piano) : []), [file.piano])

  function scegli(c: Corso) {
    setScelto(c); setStatico(null); setDaZero(false)
    // La coorte proposta è la più recente di cui c'è il piano, se il
    // catalogo la conosce; altrimenti l'anno accademico in corso.
    const d = disponibilita(indice, c.codice)
    setImm(d.piani[0] ?? c.coorti[0]?.anno ?? annoOggi)
  }

  function concludi() {
    if (scelto) {
      d({ t: 'profilo', v: {
        nome: nome.trim(),
        codiceCorso: scelto.codice,
        catalogoId: undefined,
        corsoDiLaurea: scelto.nome,
        facolta: scelto.facolta ?? '',
        tipo,
        cfuTotali: cfuTotali(tipo, anniPossibili),
        durataAnni: anniPossibili,
        immatricolazione: imm,
        annoCorrente: anno,
      }})
      for (const ins of iniziali) d({ t: 'ins.add', v: ins })
    } else {
      d({ t: 'profilo', v: {
        nome: nome.trim(),
        catalogoId: statico?.id,
        corsoDiLaurea: statico?.nome ?? 'Il mio corso',
        facolta: statico?.facolta ?? '',
        tipo: statico?.tipo ?? 'triennale',
        cfuTotali: statico?.cfu ?? 180,
        durataAnni: statico?.anni ?? 3,
        immatricolazione: imm,
        annoCorrente: anno,
      }})
      if (statico && !daZero) for (const ins of espandi(statico)) d({ t: 'ins.add', v: ins })
    }
    d({ t: 'onboarding.fine' })
  }

  const puoContinuare = passo !== 1 || !!scelto || !!statico || daZero

  return (
    <div className="app onb">
      <div className="onb-top">
        <div className="onb-dots" role="presentation">
          {[0, 1, 2].map(i => (
            <span key={i} className="onb-dot" data-on={i <= passo} />
          ))}
        </div>
        {passo > 0 && (
          <button className="btn btn-ghost btn-sm" onClick={() => setPasso(p => p - 1)}>
            <Icona nome="indietro" size={16} peso={2.2} /> Indietro
          </button>
        )}
      </div>

      {/* ---- Passo 1: chi sei ---- */}
      {passo === 0 && (
        <div className="onb-body">
          <div className="onb-mark"><Icona nome="cappello" size={26} /></div>
          <h1 className="hero-xl" style={{ textTransform: 'none' }}>{NOME_APP}</h1>
          <p className="body dim" style={{ maxWidth: 320 }}>
            Esami, appelli, orario e statistiche del tuo percorso alla Sapienza.
            {' '}{PRIVACY_BREVE}
          </p>
          <div style={{ width: '100%', marginTop: 12 }}>
            <Campo label="Come ti chiami?" hint="Serve solo per il saluto in home.">
              <input
                className="input" value={nome} onChange={e => setNome(e.target.value)}
                placeholder="Il tuo nome" autoFocus autoComplete="given-name"
                onKeyDown={e => { if (e.key === 'Enter') setPasso(1) }}
              />
            </Campo>
          </div>
          <p className="caption dimmer" style={{ marginTop: 18, maxWidth: 320, lineHeight: 1.5 }}>
            {DISCLAIMER}
          </p>
        </div>
      )}

      {/* ---- Passo 2: quale corso ---- */}
      {passo === 1 && (
        <div className="onb-body onb-body-lista">
          <div className="stack" style={{ gap: 6, width: '100%' }}>
            <h1 className="display-m">Che corso fai?</h1>
            <p className="sub dim">
              {indice
                ? `Tutti i ${indice.corsi.length} corsi del catalogo Sapienza. Ti riempio il libretto col piano ufficiale.`
                : 'Ti riempio il libretto col piano ufficiale del tuo corso.'}
            </p>
          </div>

          {indice && (
            <div className="search" style={{ width: '100%', marginTop: 14 }}>
              <Icona nome="cerca" size={17} />
              <input
                value={cerca} onChange={e => setCerca(e.target.value)}
                placeholder="Nome del corso, codice o classe (L-4)" autoCorrect="off"
              />
              {cerca && (
                <button onClick={() => setCerca('')} aria-label="Pulisci">
                  <Icona nome="chiudi" size={15} peso={2.2} />
                </button>
              )}
            </div>
          )}

          <div className="onb-lista">
            {!indice && (stato === 'avvio' || aggiornando) && (
              <div className="card card-pad row" style={{ gap: 10, marginTop: 14 }}>
                <Icona nome="orologio" size={17} className="dimmer" />
                <span className="foot dim">Scarico l'elenco dei corsi…</span>
              </div>
            )}

            {!indice && stato === 'vuoto' && !aggiornando && (
              <>
                <div className="card card-pad stack" style={{ gap: 10, marginTop: 14 }}>
                  <span className="callout strong">
                    {offline ? 'Serve la connessione, solo questa volta' : 'Il catalogo non è ancora disponibile'}
                  </span>
                  <span className="foot dim" style={{ lineHeight: 1.5 }}>
                    L'elenco dei corsi si scarica una volta e poi resta sul telefono.
                    Intanto puoi partire da Design o da zero.
                  </span>
                  <button className="btn btn-secondary btn-sm" style={{ alignSelf: 'flex-start' }}
                    onClick={() => aggiorna(true)}>
                    Riprova
                  </button>
                </div>
                {CATALOGO.map(c => (
                  <button
                    key={c.id} className="onb-corso"
                    data-on={statico?.id === c.id && !daZero}
                    onClick={() => { setStatico(c); setScelto(null); setDaZero(false) }}
                  >
                    <div className="grow stack" style={{ gap: 3 }}>
                      <span className="callout strong">{c.nome}</span>
                      <span className="foot dimmer truncate">{c.classe} · {c.facolta} · piano {c.fonte.aa}</span>
                    </div>
                  </button>
                ))}
              </>
            )}

            {risultati.slice(0, MOSTRATI).map(c => (
              <button
                key={c.codice} className="onb-corso"
                data-on={scelto?.codice === c.codice}
                onClick={() => scegli(c)}
              >
                <div className="grow stack" style={{ gap: 3 }}>
                  <span className="callout strong">{c.nome}</span>
                  <span className="foot dimmer truncate num">
                    {[c.classe, `codice ${c.codice}`].filter(Boolean).join(' · ')}
                  </span>
                </div>
              </button>
            ))}

            {indice && risultati.length > MOSTRATI && (
              <p className="caption dimmer" style={{ padding: '12px 4px 0' }}>
                E altri {risultati.length - MOSTRATI}: scrivi qualche lettera in più.
              </p>
            )}
            {indice && cerca && risultati.length === 0 && (
              <p className="foot dim" style={{ padding: '14px 4px 0' }}>
                Nessun corso per «{cerca}». Prova col codice, che trovi su Infostud.
              </p>
            )}

            <button
              className="onb-corso" data-on={daZero}
              onClick={() => { setDaZero(true); setScelto(null); setStatico(null) }}
            >
              <div className="grow stack" style={{ gap: 2 }}>
                <span className="callout strong">Preferisco partire da zero</span>
                <span className="foot dimmer">Aggiungo gli esami a mano</span>
              </div>
              <Icona nome="piu" size={18} peso={2} className="chev" />
            </button>
          </div>
        </div>
      )}

      {/* ---- Passo 3: coorte e anno ---- */}
      {passo === 2 && (
        <div className="onb-body">
          <div className="stack" style={{ gap: 6, width: '100%' }}>
            <h1 className="display-m">A che punto sei?</h1>
            <p className="sub dim">
              {scelto
                ? 'Il piano cambia con l’anno in cui ti sei iscritto: scegli il tuo.'
                : 'Serve a calcolare se sei in pari col percorso.'}
            </p>
          </div>

          <div className="stack" style={{ gap: 18, width: '100%', marginTop: 20 }}>
            {scelto && scelto.coorti.length > 0 ? (
              <div className="field">
                <span className="field-label">Anno di immatricolazione</span>
                <div className="stack" style={{ gap: 6 }}>
                  {scelto.coorti.map(k => {
                    const conPiano = disp?.piani.includes(k.anno)
                    return (
                      <button key={k.anno} className="onb-corso" data-on={imm === k.anno}
                        onClick={() => setImm(k.anno)}>
                        <div className="grow stack" style={{ gap: 2 }}>
                          <span className="callout strong num">{k.etichetta}</span>
                          <span className="foot dimmer">
                            {conPiano ? 'Piano disponibile' : 'Piano non ancora nel catalogo'}
                          </span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : (
              <Campo label="Anno di immatricolazione" hint={`Anno accademico ${imm}/${String((imm + 1) % 100).padStart(2, '0')}`}>
                <div className="stepper">
                  <button onClick={() => setImm(v => v - 1)} aria-label="Anno precedente">
                    <Icona nome="chevron" size={18} peso={2.2} style={{ transform: 'rotate(180deg)' }} />
                  </button>
                  <span className="display-m num">{imm}</span>
                  <button onClick={() => setImm(v => v + 1)} aria-label="Anno successivo">
                    <Icona nome="chevron" size={18} peso={2.2} />
                  </button>
                </div>
              </Campo>
            )}

            <div className="field">
              <span className="field-label">Anno che stai frequentando</span>
              <div className="anni-grid">
                {Array.from({ length: anniPossibili }, (_, i) => (i + 1) as AnnoCorso).map(a => (
                  <button
                    key={a} className="anno-key" aria-pressed={anno === a}
                    onClick={() => setAnno(a)}
                  >
                    <span className="display-m num">{a}</span>
                    <span className="caption">anno</span>
                  </button>
                ))}
                <button
                  className="anno-key" aria-pressed={anno > anniPossibili}
                  onClick={() => setAnno((anniPossibili + 1) as AnnoCorso)}
                >
                  <span className="headline">Fuori</span>
                  <span className="caption">corso</span>
                </button>
              </div>
            </div>
          </div>

          {(scelto || (statico && !daZero)) && (
            <div className="card card-pad" style={{ width: '100%', marginTop: 22 }}>
              <div className="eyebrow" style={{ marginBottom: 8 }}>Riepilogo</div>
              <div className="stack" style={{ gap: 6 }}>
                <div className="between"><span className="sub dim">Corso</span><span className="sub strong">{scelto?.nome ?? statico?.nome}</span></div>
                {scelto && !pianoPronto && (
                  <p className="foot dim" style={{ lineHeight: 1.5, marginTop: 4 }}>
                    {file.caricamento
                      ? 'Scarico il piano…'
                      : 'Il piano di questa coorte non è ancora nel catalogo: il libretto parte vuoto, e si riempie a mano.'}
                  </p>
                )}
                {(pianoPronto || statico) && (
                  <>
                    <div className="between">
                      <span className="sub dim">Esami nel libretto</span>
                      <span className="sub strong num">{scelto ? iniziali.length : statico!.piano.length}</span>
                    </div>
                    <div className="between">
                      <span className="sub dim">CFU per la laurea</span>
                      <span className="sub strong num">{scelto ? cfuTotali(tipo, anniPossibili) : statico!.cfu}</span>
                    </div>
                  </>
                )}
                {pianoPronto && file.piano!.gruppi.length > 0 && (
                  <p className="caption dimmer" style={{ lineHeight: 1.5, marginTop: 4 }}>
                    {plurale(file.piano!.gruppi.length, 'gruppo opzionale', 'gruppi opzionali')} da
                    scegliere più avanti: li trovi in Esplora, dal profilo.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="onb-foot">
        {passo < 2 ? (
          <button
            className="btn btn-primary btn-block"
            disabled={!puoContinuare}
            onClick={() => setPasso(p => p + 1)}
          >
            Continua
          </button>
        ) : (
          <button
            className="btn btn-primary btn-block" onClick={concludi}
            disabled={!!scelto && file.caricamento && !file.piano}
          >
            {scelto && file.caricamento && !file.piano ? 'Scarico il piano…' : 'Apri il libretto'}
          </button>
        )}
        {passo === 0 && (
          <button className="btn btn-ghost btn-block" onClick={() => setPasso(1)}>
            Salta
          </button>
        )}
      </div>
    </div>
  )
}
