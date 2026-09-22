import { useMemo, useState } from 'react'
import { useApp, nuovoId } from '../lib/store'
import { Icona } from '../components/Icona'
import { Schermo, Segmentato, Sezione, Vuoto } from '../components/ui'
import { CATALOGO, type CorsoLaurea } from '../lib/catalogo'
import { chiaveManuale } from '../lib/chiavi'
import { LABEL_TIPO, TINTE, type AnnoCorso, type Semestre } from '../lib/types'

/** Esplora i piani di studio degli altri corsi: utile per scegliere
 *  gli esami a scelta e per capire cosa fanno gli altri semestri. */
export function Esplora({ chiudi }: { chiudi: () => void }) {
  const [corso, setCorso] = useState<CorsoLaurea | null>(null)
  const [cerca, setCerca] = useState('')

  const risultati = useMemo(() => {
    const q = cerca.trim().toLowerCase()
    if (!q) return CATALOGO
    return CATALOGO.filter(c =>
      c.nome.toLowerCase().includes(q) ||
      c.facolta.toLowerCase().includes(q) ||
      c.classe.toLowerCase().includes(q) ||
      c.piano.some(r => r[0].toLowerCase().includes(q)))
  }, [cerca])

  const perFacolta = useMemo(() => {
    const m = new Map<string, CorsoLaurea[]>()
    for (const c of risultati) m.set(c.facolta, [...(m.get(c.facolta) ?? []), c])
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0], 'it'))
  }, [risultati])

  // Il return anticipato va dopo tutti gli hook, altrimenti al
  // secondo render se ne conta uno in meno e React si pianta.
  if (corso) return <Dettaglio corso={corso} chiudi={() => setCorso(null)} />

  return (
    <Schermo
      titolo="Esplora"
      sottotitolo="Piani di studio ufficiali, anno per anno"
      indietro={chiudi}
      sotto={
        <div className="gut">
          <div className="search">
            <Icona nome="cerca" size={17} />
            <input value={cerca} onChange={e => setCerca(e.target.value)}
              placeholder="Corso, facoltà o nome di un esame" />
            {cerca && (
              <button onClick={() => setCerca('')} aria-label="Pulisci">
                <Icona nome="chiudi" size={15} peso={2.2} />
              </button>
            )}
          </div>
        </div>
      }
    >
      {risultati.length === 0 ? (
        <Vuoto icona="cerca" titolo="Nessun corso trovato"
          testo={`Niente che corrisponda a «${cerca}».`} />
      ) : (
        perFacolta.map(([facolta, corsi]) => (
          <Sezione key={facolta} titolo={facolta}>
            <div className="list">
              {corsi.map(c => (
                <button key={c.id} className="list-row is-tappable" onClick={() => setCorso(c)}>
                  <div className="grow stack" style={{ gap: 2 }}>
                    <span className="callout strong">{c.nome}</span>
                    <span className="foot dimmer num">
                      {c.classe} · {c.anni} anni · {c.cfu} CFU · {c.piano.length} esami
                    </span>
                    <span className="caption dimmer">Piano ufficiale {c.fonte.aa}</span>
                  </div>
                  <Icona nome="chevron" size={16} peso={2.2} className="chev" />
                </button>
              ))}
            </div>
          </Sezione>
        ))
      )}

      <div className="gut" style={{ marginTop: 22 }}>
        <div className="card card-pad row" style={{ gap: 12 }}>
          <Icona nome="info" size={18} className="dimmer" />
          <span className="foot dim" style={{ lineHeight: 1.5 }}>
            Compaiono qui solo i corsi il cui piano è stato trascritto dal
            catalogo ufficiale e verificato CFU per CFU. Per gli altri conviene
            partire dal catalogo Sapienza e inserire gli esami a mano dal
            Libretto.
          </span>
        </div>
      </div>
    </Schermo>
  )
}

/* ---------------- Dettaglio di un corso ---------------- */

function Dettaglio({ corso, chiudi }: { corso: CorsoLaurea; chiudi: () => void }) {
  const { s, d, avviso } = useApp()
  const [anno, setAnno] = useState<string>('1')
  const mio = s.profilo.corsoDiLaurea === corso.nome

  const righe = corso.piano
    .map((r, i) => ({ i, nome: r[0], cfu: r[1], anno: r[2] as AnnoCorso, sem: r[3] as Semestre, tipo: r[4], ssd: r[5] }))
    .filter(r => String(r.anno) === anno)
    .sort((a, b) => (a.sem || 3) - (b.sem || 3) || a.nome.localeCompare(b.nome, 'it'))

  const cfuAnno = righe.reduce((n, r) => n + r.cfu, 0)
  const perSem = [1, 2, 0].map(sm => ({
    sm, voci: righe.filter(r => r.sem === sm),
  })).filter(g => g.voci.length > 0)

  // Nomi già nel mio piano: evita di aggiungere doppioni senza
  // accorgersene.
  const giaPresenti = new Set(s.insegnamenti.map(i => i.nome.toLowerCase()))

  function aggiungi(r: { nome: string; cfu: number; anno: AnnoCorso; sem: Semestre; tipo?: string; ssd?: string }) {
    d({ t: 'ins.add', v: {
      // viene da un altro corso: è una scelta personale, non parte
      // del piano, quindi porta una chiave manuale
      id: chiaveManuale(r.nome, nuovoId), nome: r.nome, cfu: r.cfu, anno: r.anno, semestre: r.sem,
      tipo: (r.tipo as never) ?? 'a_scelta', ssd: r.ssd,
      tinta: s.insegnamenti.length % TINTE.length,
    }})
    avviso(`${r.nome} aggiunto al tuo piano`)
  }

  return (
    <Schermo
      titolo={corso.nome}
      indietro={chiudi}
      sottotitolo={<>{corso.classe} · {corso.facolta}</>}
      sotto={
        <div className="gut">
          <Segmentato
            valore={anno} cambia={setAnno}
            opzioni={Array.from({ length: corso.anni }, (_, i) => ({ v: String(i + 1), l: `${i + 1}° anno` }))}
          />
        </div>
      }
    >
      <Sezione stretto>
        <div className="card card-pad row" style={{ gap: 18 }}>
          <div className="stack" style={{ gap: 1 }}>
            <span className="eyebrow">CFU nell'anno</span>
            <span className="display-m num">{cfuAnno}</span>
          </div>
          <div className="stack" style={{ gap: 1 }}>
            <span className="eyebrow">Esami</span>
            <span className="display-m num">{righe.length}</span>
          </div>
          <div className="grow" />
          {mio && <span className="chip chip-accent">Il tuo corso</span>}
        </div>
        <p className="caption dimmer" style={{ marginTop: 8, paddingInline: 4, lineHeight: 1.5 }}>
          Piano ufficiale {corso.fonte.aa} · {corso.fonte.url}
        </p>
      </Sezione>

      {perSem.map(g => (
        <Sezione key={g.sm} titolo={g.sm === 0 ? 'Annuali' : g.sm === 1 ? 'Primo semestre' : 'Secondo semestre'}>
          <div className="list">
            {g.voci.map(r => {
              const presente = giaPresenti.has(r.nome.toLowerCase())
              return (
                <div key={r.i} className="list-row">
                  <div className="grow stack" style={{ gap: 2 }}>
                    <span className="callout strong">{r.nome}</span>
                    <span className="foot dimmer num">
                      {r.cfu} CFU
                      {r.ssd && ` · ${r.ssd}`}
                      {r.tipo && ` · ${LABEL_TIPO[r.tipo as keyof typeof LABEL_TIPO] ?? r.tipo}`}
                    </span>
                  </div>
                  {presente ? (
                    <span className="chip chip-pass"><Icona nome="check" size={11} peso={3} />Nel piano</span>
                  ) : (
                    <button className="btn btn-secondary btn-sm" style={{ flex: 'none' }}
                      onClick={() => aggiungi(r)} aria-label={`Aggiungi ${r.nome} al mio piano`}>
                      <Icona nome="piu" size={14} peso={2.4} />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </Sezione>
      ))}

      <p className="gut caption dimmer" style={{ marginTop: 26, lineHeight: 1.5 }}>
        Il «+» aggiunge l'insegnamento al tuo libretto come esame a scelta.
        Lo puoi poi modificare o togliere dal Libretto.
      </p>
    </Schermo>
  )
}
