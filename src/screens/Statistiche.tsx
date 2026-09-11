import { useMemo, useState } from 'react'
import { useApp } from '../lib/store'
import { Icona } from '../components/Icona'
import { Anello, Schermo, Sezione, Vuoto } from '../components/ui'
import {
  andamento, cfuPerAnno, cfuResiduiInMedia, distribuzione, fmt110, fmtMedia,
  mediaNecessaria, riepilogo, ritmo,
} from '../lib/stats'
import { esameDi } from '../lib/query'
import { fmtData } from '../lib/date'
import { coloreVoto, posizioneVoto } from '../lib/tinte'

export function Statistiche() {
  const { s, d } = useApp()
  const r = riepilogo(s)
  const serie = useMemo(() => andamento(s), [s])
  const dist = useMemo(() => distribuzione(s), [s])
  const anni = useMemo(() => cfuPerAnno(s), [s])
  const rit = useMemo(() => ritmo(s), [s])
  const residui = cfuResiduiInMedia(s)

  const [obiettivo, setObiettivo] = useState(105)
  const [scalaMedia, setScalaMedia] = useState<'30' | '110'>('30')

  // Media in trentesimi che serve sugli esami rimasti per chiudere
  // col voto di laurea desiderato, tolti i punti di tesi.
  const mediaBersaglio = ((obiettivo - s.impostazioni.puntiTesi) * 30) / 110
  const serve = mediaNecessaria(s, mediaBersaglio)

  if (r.esamiSuperati === 0) {
    return (
      <Schermo titolo="Statistiche" sottotitolo="Media, CFU e proiezioni">
        <Vuoto
          icona="grafico"
          titolo="Ancora nessun dato"
          testo="Registra il primo esame nel libretto e qui compaiono media, andamento e proiezione del voto di laurea."
        />
      </Schermo>
    )
  }

  return (
    <Schermo
      titolo="Statistiche"
      sottotitolo={<>{r.esamiSuperati} esami · <span className="num">{r.cfuAcquisiti}</span> CFU</>}
    >
      {/* ---------------- Sintesi ---------------- */}
      <Sezione stretto>
        <div className="card card-pad stack" style={{ gap: 18 }}>
          <div className="sintesi">
            <Anello valore={r.percentuale} size={112} spessore={10}>
              <span className="display-m num">{Math.round(r.percentuale * 100)}<span style={{ fontSize: 15 }}>%</span></span>
              <span className="caption dimmer num">{r.cfuAcquisiti}/{r.cfuTotali}</span>
            </Anello>
            <div className="grow stack" style={{ gap: 14 }}>
              <div className="stack" style={{ gap: 2 }}>
                <div className="between">
                  <span className="eyebrow">Media ponderata</span>
                  <button className="scala" onClick={() => setScalaMedia(v => (v === '30' ? '110' : '30'))}>
                    {scalaMedia === '30' ? '/30' : '/110'}
                  </button>
                </div>
                <span className="display-l num">
                  {scalaMedia === '30' ? fmtMedia(r.mediaPonderata) : fmt110(r.votoPartenza)}
                </span>
              </div>
              <div className="stack" style={{ gap: 2 }}>
                <span className="eyebrow">Media aritmetica</span>
                <span className="headline num">{fmtMedia(r.mediaAritmetica)}</span>
              </div>
            </div>
          </div>

          {r.mediaPonderata != null && (
            <div className="stack" style={{ gap: 6 }}>
              <div className="spettro-wrap">
                <div className="spettro" style={{ ['--pos' as string]: `${posizioneVoto(r.mediaPonderata)}%` }}>
                  <span className="spettro-knob">{fmtMedia(r.mediaPonderata, 1)}</span>
                </div>
              </div>
              <div className="between caption dimmer num"><span>18</span><span>24</span><span>30</span></div>
            </div>
          )}
        </div>
      </Sezione>

      {/* ---------------- Proiezione laurea ---------------- */}
      <Sezione titolo="Voto di laurea">
        <div className="card card-pad stack" style={{ gap: 14 }}>
          <div className="row" style={{ gap: 16, alignItems: 'flex-end' }}>
            <div className="stack" style={{ gap: 1 }}>
              <span className="eyebrow">Proiezione</span>
              <span className="display-xl num" style={{ color: 'var(--accent)' }}>
                {fmt110(r.proiezioneLaurea)}
              </span>
            </div>
            <span className="display-m dimmer" style={{ paddingBottom: 6 }}>/110</span>
          </div>

          <div className="scomposizione">
            <div className="row" style={{ gap: 8 }}>
              <span className="dot" style={{ background: 'var(--accent)' }} />
              <span className="foot grow">Base dalla media ponderata</span>
              <span className="foot strong num">{fmt110(r.votoPartenza)}</span>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <span className="dot" style={{ background: 'var(--gold)' }} />
              <span className="foot grow">Punti stimati per tesi e percorso</span>
              <span className="foot strong num">+{s.impostazioni.puntiTesi}</span>
            </div>
          </div>

          <div className="punti-tesi">
            <button
              className="punti-btn"
              onClick={() => d({ t: 'impostazioni', v: { puntiTesi: Math.max(0, s.impostazioni.puntiTesi - 1) } })}
              aria-label="Meno punti"
            >−</button>
            <input
              type="range" min={0} max={14} value={s.impostazioni.puntiTesi}
              onChange={e => d({ t: 'impostazioni', v: { puntiTesi: Number(e.target.value) } })}
              aria-label="Punti stimati alla proclamazione"
            />
            <button
              className="punti-btn"
              onClick={() => d({ t: 'impostazioni', v: { puntiTesi: Math.min(14, s.impostazioni.puntiTesi + 1) } })}
              aria-label="Più punti"
            >+</button>
          </div>

          <p className="caption dimmer" style={{ lineHeight: 1.5 }}>
            La base è media × 110 ÷ 30. I punti aggiuntivi dipendono dalla commissione
            e dal regolamento del tuo corso: quello qui sopra è solo il valore che
            stai ipotizzando.
          </p>
        </div>
      </Sezione>

      {/* ---------------- Simulatore ---------------- */}
      {residui > 0 && (
        <Sezione titolo="Se volessi laurearti con…">
          <div className="card card-pad stack" style={{ gap: 14 }}>
            <div className="obiettivo">
              <button className="punti-btn" onClick={() => setObiettivo(v => Math.max(66, v - 1))} aria-label="Meno">−</button>
              <div className="stack" style={{ alignItems: 'center', gap: 0 }}>
                <span className="display-l num">{obiettivo}</span>
                <span className="caption dimmer">su 110</span>
              </div>
              <button className="punti-btn" onClick={() => setObiettivo(v => Math.min(110, v + 1))} aria-label="Più">+</button>
            </div>

            <div className="esito-sim" data-stato={
              serve == null ? 'na' : serve > 30 ? 'no' : serve <= 18 ? 'gia' : 'ok'
            }>
              {serve == null ? (
                <span className="callout">Non restano esami con voto.</span>
              ) : serve > 30 ? (
                <>
                  <Icona nome="avviso" size={18} />
                  <span className="callout">
                    Fuori portata: servirebbe una media di <strong className="num">{fmtMedia(serve)}</strong> sui
                    {' '}<strong className="num">{residui}</strong> CFU rimasti.
                  </span>
                </>
              ) : serve <= 18 ? (
                <>
                  <Icona nome="check" size={18} peso={2.6} />
                  <span className="callout">
                    Ci sei già: ti basta superare i <strong className="num">{residui}</strong> CFU rimasti.
                  </span>
                </>
              ) : (
                <>
                  <Icona nome="bersaglio" size={18} />
                  <span className="callout">
                    Ti serve una media di <strong className="num">{fmtMedia(serve)}</strong> sui
                    {' '}<strong className="num">{residui}</strong> CFU che ti mancano.
                  </span>
                </>
              )}
            </div>
          </div>
        </Sezione>
      )}

      {/* ---------------- Andamento ---------------- */}
      {serie.length >= 2 && (
        <Sezione titolo="Andamento della media">
          <div className="card card-pad stack" style={{ gap: 10 }}>
            <Andamento serie={serie} />
            <div className="between">
              <span className="caption dimmer">{fmtData(serie[0].data, 'breve')}</span>
              <span className="caption dimmer">{fmtData(serie[serie.length - 1].data, 'breve')}</span>
            </div>
            {(() => {
              const delta = serie[serie.length - 1].media - serie[0].media
              // Sotto il decimo di punto non è una tendenza, è rumore:
              // dirlo "in discesa" farebbe sembrare l'app sciocca.
              const stabile = Math.abs(delta) < 0.1
              const colore = stabile ? 'var(--ink-3)' : delta > 0 ? 'var(--pass)' : 'var(--fail)'
              return (
                <div className="row" style={{ gap: 7 }}>
                  <Icona nome={stabile ? 'grafico' : delta > 0 ? 'salita' : 'grafico'} size={15}
                    style={{ color: colore }} />
                  <span className="foot dim">
                    {stabile ? (
                      <>Media stabile da quando hai cominciato.</>
                    ) : (
                      <>
                        {delta > 0 ? 'Salita' : 'Discesa'} di{' '}
                        <strong className="num">{fmtMedia(Math.abs(delta))}</strong> punti dal primo esame.
                      </>
                    )}
                  </span>
                </div>
              )
            })()}
          </div>
        </Sezione>
      )}

      {/* ---------------- Distribuzione ---------------- */}
      <Sezione titolo="Distribuzione dei voti">
        <div className="card card-pad">
          <Istogramma dati={dist} />
        </div>
      </Sezione>

      {/* ---------------- CFU per anno ---------------- */}
      <Sezione titolo="CFU per anno di corso">
        <div className="card card-pad stack" style={{ gap: 14 }}>
          {anni.map(a => (
            <div key={a.anno} className="stack" style={{ gap: 6 }}>
              <div className="between">
                <span className="foot strong">{a.anno}° anno</span>
                <span className="foot dimmer num">{a.fatti}/{a.totali} CFU</span>
              </div>
              <div className="bar">
                <div className="bar-fill" style={{ width: `${a.totali ? (a.fatti / a.totali) * 100 : 0}%` }} />
              </div>
            </div>
          ))}
        </div>
      </Sezione>

      {/* ---------------- Ritmo ---------------- */}
      <Sezione titolo="Il tuo ritmo">
        <div className="card card-pad stack" style={{ gap: 12 }}>
          <div className="row" style={{ gap: 10 }}>
            <span className="pastiglia" data-ok={rit.inPari !== false}>
              <Icona nome={rit.inPari !== false ? 'check' : 'avviso'} size={13} peso={2.6} />
              {rit.inPari !== false ? 'In pari' : 'Sotto il passo'}
            </span>
            <span className="foot dim">
              A questo punto del percorso il piano ne prevede{' '}
              <strong className="num">{rit.cfuAttesi}</strong>.
            </span>
          </div>
          <div className="dati-griglia">
            <Dato etichetta="CFU al mese" valore={rit.cfuPerMese ? rit.cfuPerMese.toFixed(1).replace('.', ',') : '—'} />
            <Dato etichetta="Esami rimasti" valore={String(r.esamiRimanenti)} />
            <Dato etichetta="Laurea stimata" valore={rit.meseStimatoFine ?? '—'} piccolo />
          </div>
        </div>
      </Sezione>

      {/* ---------------- Primati ---------------- */}
      <Sezione titolo="Primati">
        <div className="card card-pad dati-griglia">
          <Dato etichetta="Voto più alto" valore={r.votoMax != null ? String(r.votoMax) : '—'} />
          <Dato etichetta="Voto più basso" valore={r.votoMin != null ? String(r.votoMin) : '—'} />
          <Dato etichetta="Lodi" valore={String(r.lodi)} accento={r.lodi > 0} />
        </div>
        {(() => {
          const pesante = [...s.insegnamenti]
            .filter(i => esameDi(s, i.id).stato === 'superato')
            .sort((a, b) => b.cfu - a.cfu)[0]
          if (!pesante) return null
          const e = esameDi(s, pesante.id)
          return (
            <div className="card card-pad row" style={{ gap: 12, marginTop: 10 }}>
              <Icona nome="fuoco" size={20} style={{ color: 'var(--accent)' }} />
              <div className="grow stack" style={{ gap: 1 }}>
                <span className="eyebrow">Esame più pesante superato</span>
                <span className="callout strong truncate">{pesante.nome}</span>
              </div>
              <span className="stack" style={{ alignItems: 'flex-end' }}>
                <span className="headline num">{e.lode ? '30L' : e.voto}</span>
                <span className="caption dimmer num">{pesante.cfu} CFU</span>
              </span>
            </div>
          )
        })()}
      </Sezione>

      <p className="gut caption dimmer" style={{ marginTop: 26, lineHeight: 1.5 }}>
        La lode conta {s.impostazioni.valoreLode} nella media ponderata.
        Puoi cambiarlo dalle impostazioni se il tuo corso usa un valore diverso.
      </p>
    </Schermo>
  )
}

/* ---------------- Riquadro dato ---------------- */

function Dato({ etichetta, valore, accento, piccolo }: {
  etichetta: string; valore: string; accento?: boolean; piccolo?: boolean
}) {
  return (
    <div className="dato">
      <span className={piccolo ? 'callout strong' : 'display-m num'}
        style={accento ? { color: 'var(--gold)' } : undefined}>{valore}</span>
      <span className="caption dimmer">{etichetta}</span>
    </div>
  )
}

/* ---------------- Grafico dell'andamento ---------------- */

function Andamento({ serie }: { serie: { media: number; data: string; nome: string; voto: number }[] }) {
  const W = 320, H = 116, P = 6
  const valori = serie.map(p => p.media)
  // La scala si stringe attorno ai dati: su una scala 18–30 fissa
  // ogni carriera sembrerebbe piatta.
  const lo = Math.max(18, Math.floor(Math.min(...valori) - 0.6))
  const hi = Math.min(30, Math.ceil(Math.max(...valori) + 0.6))
  const span = Math.max(hi - lo, 1)

  const x = (i: number) => P + (i / Math.max(serie.length - 1, 1)) * (W - P * 2)
  const y = (v: number) => P + (1 - (v - lo) / span) * (H - P * 2)

  const linea = serie.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.media).toFixed(1)}`).join(' ')
  const area = `${linea} L${x(serie.length - 1).toFixed(1)},${H - P} L${x(0).toFixed(1)},${H - P} Z`
  const ultimo = serie[serie.length - 1]

  return (
    <div className="grafico">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: 116 }}>
        <defs>
          <linearGradient id="velo-andamento" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--cta)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--cta)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[lo, (lo + hi) / 2, hi].map(v => (
          <line key={v} x1={P} x2={W - P} y1={y(v)} y2={y(v)}
            stroke="var(--rule)" strokeWidth="1" strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />
        ))}
        <path d={area} fill="url(#velo-andamento)" />
        <path d={linea} fill="none" stroke="var(--cta)" strokeWidth="2"
          strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        <circle cx={x(serie.length - 1)} cy={y(ultimo.media)} r="4"
          fill="var(--cta)" stroke="var(--surface)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="grafico-hi caption num">{hi}</span>
      <span className="grafico-lo caption num">{lo}</span>
    </div>
  )
}

/* ---------------- Istogramma dei voti ---------------- */

function Istogramma({ dati }: { dati: { voto: number; conta: number }[] }) {
  const max = Math.max(1, ...dati.map(d => d.conta))
  const [scelto, setScelto] = useState<number | null>(null)
  const attivo = dati.find(d => d.voto === scelto)

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="isto">
        {dati.map(d => (
          <button
            key={d.voto} className="isto-col" aria-pressed={scelto === d.voto}
            onClick={() => setScelto(v => (v === d.voto ? null : d.voto))}
            aria-label={`${d.conta} esami con ${d.voto}`}
          >
            <span className="isto-barra" style={{
              height: `${(d.conta / max) * 100}%`,
              opacity: d.conta === 0 ? 0.22 : 1,
              ['--barra-colore' as string]: coloreVoto(d.voto),
            }} />
            <span className="isto-etichetta num">{d.voto}</span>
          </button>
        ))}
      </div>
      <div className="foot dim" style={{ minHeight: 20 }}>
        {attivo
          ? attivo.conta === 0
            ? <>Nessun esame con <strong className="num">{attivo.voto}</strong>.</>
            : <><strong className="num">{attivo.conta}</strong> {attivo.conta === 1 ? 'esame' : 'esami'} con <strong className="num">{attivo.voto}</strong>.</>
          : <span className="dimmer">Tocca una barra per il dettaglio.</span>}
      </div>
    </div>
  )
}
