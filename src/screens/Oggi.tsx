import { useApp } from '../lib/store'
import { Icona } from '../components/Icona'
import { Anello, AzioneNav, Schermo, Sezione, Vuoto } from '../components/ui'
import { tinta, PIENO, VELO, TESTO } from '../lib/tinte'
import {
  lezioniDel, lezioneInCorso, prossimaLezione, prenotazioni, daRegistrare,
} from '../lib/query'
import { riepilogo, fmtMedia, fmt110 } from '../lib/stats'
import {
  annoAccademico, durata, fmtData, minuti, oggi as dataOggi, oraOra, quando,
} from '../lib/date'
import { plurale } from '../lib/testo'
import type { Vista, Pila } from '../App'

function saluto(): string {
  const h = new Date().getHours()
  if (h < 5) return 'Buonanotte'
  if (h < 13) return 'Buongiorno'
  if (h < 18) return 'Buon pomeriggio'
  return 'Buonasera'
}

export function Oggi({ vai, apri }: {
  vai: (v: Vista) => void
  apri: (p: Exclude<Pila, null>) => void
}) {
  const { s } = useApp()
  const o = dataOggi()
  const lezioni = lezioniDel(s, o)
  const inCorso = lezioneInCorso(s)
  const prossima = prossimaLezione(s)
  const prenotati = prenotazioni(s)
  const sospesi = daRegistrare(s)
  const r = riepilogo(s)
  const ora = minuti(oraOra())

  const nome = s.profilo.nome.trim()

  return (
    <Schermo
      titolo={nome ? `${saluto()}, ${nome}` : saluto()}
      sottotitolo={<>{fmtData(o, 'giorno')} · anno accademico {annoAccademico()}</>}
      azioni={
        <>
          <AzioneNav icona="bussola" etichetta="Esplora i corsi" onClick={() => apri('esplora')} />
          <AzioneNav icona="ingranaggio" etichetta="Impostazioni" onClick={() => apri('impostazioni')} />
        </>
      }
    >
      {/* ---------- Da registrare: la cosa più urgente in assoluto ---------- */}
      {sospesi.length > 0 && (
        <Sezione stretto>
          <button className="card card-accent card-pad avviso-riga" onClick={() => vai('esami')}>
            <Icona nome="avviso" size={20} style={{ color: 'var(--accent)' }} />
            <div className="grow stack" style={{ gap: 2 }}>
              <span className="callout strong" style={{ color: 'var(--accent)' }}>
                {sospesi.length === 1 ? 'Un esito da registrare' : `${sospesi.length} esiti da registrare`}
              </span>
              <span className="foot" style={{ color: 'var(--accent)', opacity: 0.8 }}>
                {sospesi.slice(0, 2).map(x => x.ins.nome).join(', ')}
                {sospesi.length === 3 && ' e un altro'}
                {sospesi.length > 3 && ` e altri ${sospesi.length - 2}`}
              </span>
            </div>
            <Icona nome="chevron" size={17} peso={2.2} style={{ color: 'var(--accent)' }} />
          </button>
        </Sezione>
      )}

      {/* ---------- In aula adesso ---------- */}
      {inCorso && (
        <Sezione stretto>
          <div className="card ora-card" style={tinta(inCorso.ins.tinta)}>
            <div className="ora-barra" style={{ background: PIENO }} />
            <div className="card-pad stack" style={{ gap: 10 }}>
              <div className="row" style={{ gap: 7 }}>
                <span className="polso" style={{ background: PIENO }} />
                <span className="eyebrow" style={{ color: TESTO }}>Ora in aula</span>
              </div>
              <div className="stack" style={{ gap: 3 }}>
                <span className="title">{inCorso.ins.nome}</span>
                <span className="sub dim">
                  {inCorso.lezione.inizio}–{inCorso.lezione.fine}
                  {inCorso.lezione.aula && ` · ${inCorso.lezione.aula}`}
                  {inCorso.lezione.edificio && `, ${inCorso.lezione.edificio}`}
                </span>
              </div>
              <div className="stack" style={{ gap: 5, marginTop: 2 }}>
                <div className="bar">
                  <div className="bar-fill" style={{
                    background: PIENO,
                    width: `${Math.round(
                      ((ora - minuti(inCorso.lezione.inizio)) /
                       (minuti(inCorso.lezione.fine) - minuti(inCorso.lezione.inizio))) * 100)}%`,
                  }} />
                </div>
                <span className="caption dimmer num">
                  finisce fra {minuti(inCorso.lezione.fine) - ora} minuti
                </span>
              </div>
            </div>
          </div>
        </Sezione>
      )}

      {/* ---------- Prossima lezione (se non sei già in aula) ---------- */}
      {!inCorso && prossima && (
        <Sezione stretto>
          <button className="card card-pad prossima" style={tinta(prossima.r.ins.tinta)} onClick={() => vai('orario')}>
            <div className="prossima-ora" style={{ background: VELO, color: TESTO }}>
              <span className="headline num">{prossima.r.lezione.inizio}</span>
              <span className="caption num">{durata(prossima.r.lezione.inizio, prossima.r.lezione.fine)}</span>
            </div>
            <div className="grow stack" style={{ gap: 3 }}>
              <span className="eyebrow">
                {prossima.data === o ? 'Prossima lezione' : quando(prossima.data)}
              </span>
              <span className="headline truncate">{prossima.r.ins.nome}</span>
              <span className="foot dimmer truncate">
                {prossima.r.lezione.inizio}–{prossima.r.lezione.fine}
                {prossima.r.lezione.aula && ` · ${prossima.r.lezione.aula}`}
                {prossima.r.lezione.edificio && `, ${prossima.r.lezione.edificio}`}
              </span>
            </div>
            <Icona nome="chevron" size={17} peso={2.2} className="chev" />
          </button>
        </Sezione>
      )}

      {/* ---------- La giornata ---------- */}
      <Sezione
        titolo="La giornata"
        destra={lezioni.length > 0 && (
          <span className="foot dimmer num">{plurale(lezioni.length, 'lezione', 'lezioni')}</span>
        )}
      >
        {lezioni.length === 0 ? (
          <div className="card">
            <Vuoto
              icona="sole"
              titolo={s.lezioni.length === 0 ? 'Orario ancora vuoto' : 'Niente lezioni oggi'}
              testo={s.lezioni.length === 0
                ? 'Aggiungi le tue lezioni ricorrenti e le ritrovi qui ogni mattina.'
                : 'Giornata libera. Buon momento per un ripasso.'}
              azione={s.lezioni.length === 0 && (
                <button className="btn btn-secondary btn-sm" onClick={() => vai('orario')}>
                  <Icona nome="piu" size={15} peso={2.2} /> Compila l'orario
                </button>
              )}
            />
          </div>
        ) : (
          <ol className="timeline">
            {lezioni.map(({ lezione: l, ins }) => {
              const passata = minuti(l.fine) <= ora
              const attiva = minuti(l.inizio) <= ora && ora < minuti(l.fine)
              return (
                <li key={l.id} className="tl-riga" data-passata={passata} style={tinta(ins.tinta)}>
                  <div className="tl-ore num">
                    <span className="foot strong">{l.inizio}</span>
                    <span className="caption dimmer">{l.fine}</span>
                  </div>
                  <div className="tl-rail">
                    <span className="tl-pallino" style={{
                      background: attiva ? PIENO : 'var(--surface)',
                      borderColor: PIENO,
                    }} />
                  </div>
                  <div className="tl-card card" style={{
                    borderColor: attiva ? PIENO : undefined,
                    background: attiva ? VELO : undefined,
                  }}>
                    <span className="callout strong truncate">{ins.nome}</span>
                    {(l.aula || l.edificio) && (
                      <span className="foot dimmer row truncate" style={{ gap: 4, marginTop: 2 }}>
                        <Icona nome="luogo" size={13} peso={1.9} />
                        {[l.aula, l.edificio].filter(Boolean).join(', ')}
                      </span>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
        )}
      </Sezione>

      {/* ---------- Appelli prenotati ---------- */}
      {prenotati.length > 0 && (
        <Sezione titolo="Esami prenotati" destra={
          <button className="foot" style={{ color: 'var(--accent)' }} onClick={() => vai('esami')}>Vedi tutti</button>
        }>
          <div className="list">
            {prenotati.slice(0, 3).map(({ appello: a, ins, giorni }) => (
              <button key={a.id} className="list-row is-tappable" onClick={() => vai('esami')} style={tinta(ins.tinta)}>
                <div className="conta" data-vicino={giorni <= 3}>
                  <span className="display-m num">{giorni}</span>
                  <span className="caption">{giorni === 1 ? 'giorno' : 'giorni'}</span>
                </div>
                <div className="grow stack" style={{ gap: 2 }}>
                  <span className="callout strong truncate">{ins.nome}</span>
                  <span className="foot dimmer truncate">
                    {fmtData(a.data, 'giorno')}{a.ora && ` · ${a.ora}`}{a.aula && ` · ${a.aula}`}
                  </span>
                </div>
                <Icona nome="chevron" size={17} peso={2.2} className="chev" />
              </button>
            ))}
          </div>
        </Sezione>
      )}

      {/* ---------- Il percorso ---------- */}
      <Sezione titolo="Il tuo percorso" destra={
        <button className="foot" style={{ color: 'var(--accent)' }} onClick={() => vai('statistiche')}>Dettagli</button>
      }>
        <button className="card card-pad percorso" onClick={() => vai('statistiche')}>
          <Anello valore={r.percentuale} size={104} spessore={9}>
            <span className="display-m num">{r.cfuAcquisiti}</span>
            <span className="caption dimmer">di {r.cfuTotali}</span>
          </Anello>
          <div className="grow stack" style={{ gap: 12 }}>
            <div className="stack" style={{ gap: 1 }}>
              <span className="eyebrow">Media ponderata</span>
              <span className="display-m num">{fmtMedia(r.mediaPonderata)}</span>
            </div>
            <div className="row" style={{ gap: 18 }}>
              <div className="stack" style={{ gap: 1 }}>
                <span className="eyebrow">Esami</span>
                <span className="headline num">{r.esamiSuperati}<span className="dimmer">/{r.esamiTotali}</span></span>
              </div>
              <div className="stack" style={{ gap: 1 }}>
                <span className="eyebrow">Base laurea</span>
                <span className="headline num">{fmt110(r.votoPartenza)}<span className="dimmer">/110</span></span>
              </div>
            </div>
          </div>
        </button>
      </Sezione>
    </Schermo>
  )
}
