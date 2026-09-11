/* ============================================================
   Notifiche locali — solo nell'app nativa (Capacitor).
   Sul sito non esistono notifiche programmate senza un server:
   qui invece si scrivono direttamente nel telefono, che le mostra
   anche ad app chiusa. Si rigenerano ogni volta che cambiano i
   dati o che l'app torna in primo piano, così la finestra dei
   sette giorni scorre da sola.
   ============================================================ */

import { Capacitor } from '@capacitor/core'
import type { Stato } from './types'
import { lezioniDel, prenotazioni } from './query'
import { addGiorni, daISO, minuti, oggi } from './date'

export const NATIVO = Capacitor.isNativePlatform()

/** iOS accetta al massimo 64 notifiche in attesa: teniamo margine. */
const MASSIMO = 60

export interface OpzioniNotifiche {
  lezioni: boolean
  esami: boolean
  /** Minuti di preavviso prima della lezione */
  minutiPrima: number
}

export const NOTIFICHE_DEFAULT: OpzioniNotifiche = { lezioni: true, esami: true, minutiPrima: 15 }

export async function permessoNotifiche(): Promise<boolean> {
  if (!NATIVO) return false
  const { LocalNotifications } = await import('@capacitor/local-notifications')
  let s = await LocalNotifications.checkPermissions()
  if (s.display === 'prompt' || s.display === 'prompt-with-rationale') s = await LocalNotifications.requestPermissions()
  return s.display === 'granted'
}

interface Voce { at: Date; title: string; body: string }

function alle(iso: string, hhmm: string): Date {
  const d = daISO(iso)
  const [h, m] = hhmm.split(':').map(Number)
  d.setHours(h, m, 0, 0)
  return d
}

/** Costruisce l'elenco delle notifiche da programmare. */
export function elencoNotifiche(s: Stato, o: OpzioniNotifiche, adesso = new Date()): Voce[] {
  const voci: Voce[] = []
  const inizio = oggi()

  if (o.lezioni) {
    for (let i = 0; i < 7; i++) {
      const giorno = addGiorni(inizio, i)
      for (const { lezione: l, ins } of lezioniDel(s, giorno)) {
        const at = alle(giorno, l.inizio)
        at.setMinutes(at.getMinutes() - o.minutiPrima)
        if (at <= adesso) continue
        const dove = [l.aula, l.edificio].filter(Boolean).join(', ')
        voci.push({
          at,
          title: `Fra ${o.minutiPrima} minuti: ${ins.nome}`,
          body: `${l.inizio}–${l.fine}${dove ? ` · ${dove}` : ''}`,
        })
      }
    }
  }

  if (o.esami) {
    for (const { appello: a, ins } of prenotazioni(s)) {
      const dove = [a.aula, a.edificio].filter(Boolean).join(', ')
      const quando = a.ora ? `alle ${a.ora}` : ''
      // La sera prima alle 20
      const sera = alle(addGiorni(a.data, -1), '20:00')
      if (sera > adesso) voci.push({
        at: sera, title: `Domani: esame di ${ins.nome}`,
        body: [quando, dove].filter(Boolean).join(' · ') || 'In bocca al lupo.',
      })
      // La mattina alle 7:30
      const mattina = alle(a.data, '07:30')
      if (mattina > adesso && (!a.ora || minuti(a.ora) > 7 * 60 + 30)) voci.push({
        at: mattina, title: `Oggi: esame di ${ins.nome}`,
        body: [quando, dove].filter(Boolean).join(' · ') || 'In bocca al lupo.',
      })
      // Il giorno dopo alle 18: ricorda di registrare l'esito
      const dopo = alle(addGiorni(a.data, 1), '18:00')
      if (dopo > adesso) voci.push({
        at: dopo, title: `Com’è andata a ${ins.nome}?`,
        body: 'Registra l’esito nel libretto.',
      })
    }
  }

  voci.sort((x, y) => x.at.getTime() - y.at.getTime())
  return voci.slice(0, MASSIMO)
}

/** Sostituisce tutte le notifiche in attesa con quelle attuali.
 *  Restituisce quante ne ha programmate (0 anche senza permesso). */
export async function pianificaNotifiche(s: Stato, o: OpzioniNotifiche): Promise<number> {
  if (!NATIVO) return 0
  const { LocalNotifications } = await import('@capacitor/local-notifications')
  const in_attesa = await LocalNotifications.getPending()
  if (in_attesa.notifications.length) await LocalNotifications.cancel(in_attesa)
  if (!o.lezioni && !o.esami) return 0
  if (!(await permessoNotifiche())) return 0

  const voci = elencoNotifiche(s, o)
  if (!voci.length) return 0
  await LocalNotifications.schedule({
    notifications: voci.map((v, i) => ({
      id: 1000 + i,
      title: v.title,
      body: v.body,
      schedule: { at: v.at, allowWhileIdle: true },
      sound: undefined,
    })),
  })
  return voci.length
}
