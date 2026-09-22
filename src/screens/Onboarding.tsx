import { useMemo, useState } from 'react'
import { useApp } from '../lib/store'
import { CATALOGO, espandi, type CorsoLaurea } from '../lib/catalogo'
import { Icona } from '../components/Icona'
import { Campo } from '../components/ui'
import { annoAccademico } from '../lib/date'
import type { AnnoCorso } from '../lib/types'

export function Onboarding() {
  const { d } = useApp()
  const [passo, setPasso] = useState(0)
  const [nome, setNome] = useState('')
  const [cerca, setCerca] = useState('')
  const [corso, setCorso] = useState<CorsoLaurea | null>(null)
  const [daZero, setDaZero] = useState(false)
  const [imm, setImm] = useState(Number(annoAccademico().slice(0, 4)))
  const [anno, setAnno] = useState<AnnoCorso>(1)

  const risultati = useMemo(() => {
    const q = cerca.trim().toLowerCase()
    if (!q) return CATALOGO
    return CATALOGO.filter(c =>
      c.nome.toLowerCase().includes(q) ||
      c.facolta.toLowerCase().includes(q) ||
      c.classe.toLowerCase().includes(q))
  }, [cerca])

  const anniPossibili = corso?.anni ?? 3

  function concludi() {
    d({ t: 'profilo', v: {
      nome: nome.trim(),
      catalogoId: corso?.id,
      corsoDiLaurea: corso?.nome ?? 'Il mio corso',
      facolta: corso?.facolta ?? '',
      tipo: corso?.tipo ?? 'triennale',
      cfuTotali: corso?.cfu ?? 180,
      durataAnni: corso?.anni ?? 3,
      immatricolazione: imm,
      annoCorrente: anno,
    }})
    if (corso && !daZero) {
      for (const ins of espandi(corso)) d({ t: 'ins.add', v: ins })
    }
    d({ t: 'onboarding.fine' })
  }

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
          <h1 className="hero-xl" style={{ textTransform: 'none' }}>MySapienza</h1>
          <p className="body dim" style={{ maxWidth: 320 }}>
            Esami, appelli, orario e statistiche del tuo percorso alla Sapienza.
            Tutto sul telefono, niente account.
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
        </div>
      )}

      {/* ---- Passo 2: quale corso ---- */}
      {passo === 1 && (
        <div className="onb-body onb-body-lista">
          <div className="stack" style={{ gap: 6, width: '100%' }}>
            <h1 className="display-m">Che corso fai?</h1>
            <p className="sub dim">
              Se è in elenco ti riempio il libretto col piano ufficiale.
              Altrimenti si parte da zero e lo componi tu in pochi minuti.
            </p>
          </div>

          <div className="search" style={{ width: '100%', marginTop: 14 }}>
            <Icona nome="cerca" size={17} />
            <input
              value={cerca} onChange={e => setCerca(e.target.value)}
              placeholder="Cerca corso o facoltà" autoCorrect="off"
            />
            {cerca && (
              <button onClick={() => setCerca('')} aria-label="Pulisci">
                <Icona nome="chiudi" size={15} peso={2.2} />
              </button>
            )}
          </div>

          <div className="onb-lista">
            {risultati.map(c => (
              <button
                key={c.id} className="onb-corso"
                data-on={corso?.id === c.id && !daZero}
                onClick={() => { setCorso(c); setDaZero(false) }}
              >
                <div className="grow stack" style={{ gap: 3 }}>
                  <span className="callout strong">{c.nome}</span>
                  <span className="foot dimmer truncate">{c.classe} · {c.facolta}</span>
                  <span className="row" style={{ gap: 6, marginTop: 2 }}>
                    <span className="chip chip-pass">
                      <Icona nome="check" size={10} peso={3} />Piano ufficiale
                    </span>
                    <span className="caption dimmer num">{c.fonte.aa} · {c.cfu} CFU</span>
                  </span>
                </div>
              </button>
            ))}

            <button
              className="onb-corso" data-on={daZero}
              onClick={() => { setDaZero(true); setCorso(null) }}
            >
              <div className="grow stack" style={{ gap: 2 }}>
                <span className="callout strong">Il mio corso non è in elenco</span>
                <span className="foot dimmer">Parto da zero e aggiungo gli esami a mano</span>
              </div>
              <Icona nome="piu" size={18} peso={2} className="chev" />
            </button>

            <p className="caption dimmer" style={{ padding: '14px 4px 0', lineHeight: 1.5 }}>
              In elenco ci sono solo i piani trascritti dal catalogo ufficiale
              Sapienza e verificati CFU per CFU. Il tuo percorso individuale può
              comunque differire (canali, esami a scelta, convalide): tutto è
              modificabile dal Libretto.
            </p>
          </div>
        </div>
      )}

      {/* ---- Passo 3: a che punto sei ---- */}
      {passo === 2 && (
        <div className="onb-body">
          <div className="stack" style={{ gap: 6, width: '100%' }}>
            <h1 className="display-m">A che punto sei?</h1>
            <p className="sub dim">Serve a calcolare se sei in pari col percorso.</p>
          </div>

          <div className="stack" style={{ gap: 18, width: '100%', marginTop: 20 }}>
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

          {corso && !daZero && (
            <div className="card card-pad" style={{ width: '100%', marginTop: 22 }}>
              <div className="eyebrow" style={{ marginBottom: 8 }}>Riepilogo</div>
              <div className="stack" style={{ gap: 6 }}>
                <div className="between"><span className="sub dim">Corso</span><span className="sub strong">{corso.nome}</span></div>
                <div className="between"><span className="sub dim">Esami nel piano</span><span className="sub strong num">{corso.piano.length}</span></div>
                <div className="between"><span className="sub dim">CFU per la laurea</span><span className="sub strong num">{corso.cfu}</span></div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="onb-foot">
        {passo < 2 ? (
          <button
            className="btn btn-primary btn-block"
            disabled={passo === 1 && !corso && !daZero}
            onClick={() => setPasso(p => p + 1)}
          >
            Continua
          </button>
        ) : (
          <button className="btn btn-primary btn-block" onClick={concludi}>
            Apri il libretto
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
