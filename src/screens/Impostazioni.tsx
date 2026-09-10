import { useRef, useState } from 'react'
import { useApp, esporta, importa, cancellaTutto } from '../lib/store'
import { Icona } from '../components/Icona'
import { Campo, Riga, Schermo, Segmentato, Selezione, Sezione } from '../components/ui'
import { riepilogo } from '../lib/stats'
import { annoAccademico } from '../lib/date'
import type { AnnoCorso, TipoCorsoLaurea } from '../lib/types'

export function Impostazioni({ chiudi }: { chiudi: () => void }) {
  const { s, d, avviso } = useApp()
  const r = riepilogo(s)
  const file = useRef<HTMLInputElement>(null)
  const [azzera, setAzzera] = useState(false)

  function scarica() {
    const blob = new Blob([esporta(s)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `libretto-${new Date().toISOString().slice(0, 10)}.json`
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
    <Schermo titolo="Impostazioni" indietro={chiudi}>
      {/* ---------------- Profilo ---------------- */}
      <Sezione titolo="Profilo" stretto>
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

      {/* ---------------- Aspetto ---------------- */}
      <Sezione titolo="Aspetto">
        <div className="field">
          <Segmentato
            valore={s.impostazioni.tema}
            cambia={v => d({ t: 'impostazioni', v: { tema: v as 'auto' | 'chiaro' | 'scuro' } })}
            opzioni={[
              { v: 'auto', l: 'Automatico' },
              { v: 'chiaro', l: 'Chiaro' },
              { v: 'scuro', l: 'Scuro' },
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
      <Sezione titolo="Libretto">
        <div className="card card-pad stack" style={{ gap: 6 }}>
          <span className="foot dim">Anno accademico in corso: {annoAccademico()}</span>
          <span className="foot dim">
            I piani di studio proposti all'avvio sono trascritti dal catalogo
            ufficiale Sapienza e verificati CFU per CFU, ma restano una
            fotografia di un anno accademico: il tuo percorso individuale può
            differire. Fa fede sempre Infostud.
          </span>
        </div>
      </Sezione>
    </Schermo>
  )
}
