// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest'
import { scarica, azzeraRitmo, HostNonConsentito, UA } from './http'

const URL_OK = 'https://corsidilaurea.uniroma1.it/it/course/33426'

function risposta(stato: number, corpo = 'ok', h: Record<string, string> = {}) {
  return new Response(stato === 304 ? null : corpo, { status: stato, headers: h })
}

beforeEach(() => azzeraRitmo())

describe('host', () => {
  it('rifiuta gli host il cui robots.txt non consente l\'accesso', async () => {
    await expect(scarica('https://app.arc.uniroma1.it/didattica/orario/de', { attesaMs: 0 }))
      .rejects.toBeInstanceOf(HostNonConsentito)
    await expect(scarica('https://gomp.uniroma1.it/qualcosa', { attesaMs: 0 }))
      .rejects.toThrow(/robots\.txt/)
  })

  it('rifiuta anche gli host semplicemente non previsti', async () => {
    await expect(scarica('https://example.com/x', { attesaMs: 0 }))
      .rejects.toBeInstanceOf(HostNonConsentito)
  })
})

describe('richiesta', () => {
  it('si presenta con User-Agent e contatto', async () => {
    let visti: Headers | undefined
    await scarica(URL_OK, {
      attesaMs: 0,
      fetchImpl: async (_u, init) => { visti = new Headers(init?.headers); return risposta(200) },
    })
    expect(visti!.get('user-agent')).toBe(UA)
    expect(UA).toMatch(/contatto:/)
  })

  it('manda ETag e Last-Modified quando li ha', async () => {
    let visti: Headers | undefined
    await scarica(URL_OK, {
      attesaMs: 0, etag: 'W/"abc"', lastModified: 'Mon, 01 Jan 2026 00:00:00 GMT',
      fetchImpl: async (_u, init) => { visti = new Headers(init?.headers); return risposta(200) },
    })
    expect(visti!.get('if-none-match')).toBe('W/"abc"')
    expect(visti!.get('if-modified-since')).toBe('Mon, 01 Jan 2026 00:00:00 GMT')
  })

  it('un 304 non è un errore: dice solo che la copia va ancora bene', async () => {
    const r = await scarica(URL_OK, {
      attesaMs: 0, etag: 'W/"abc"',
      fetchImpl: async () => risposta(304),
    })
    expect(r.stato).toBe(304)
    expect(r.corpo).toBeNull()
    expect(r.etag).toBe('W/"abc"')
  })

  it('restituisce corpo ed etag di una risposta buona', async () => {
    const r = await scarica(URL_OK, {
      attesaMs: 0,
      fetchImpl: async () => risposta(200, '<html>ciao</html>', { etag: 'W/"nuovo"' }),
    })
    expect(r.corpo).toBe('<html>ciao</html>')
    expect(r.etag).toBe('W/"nuovo"')
  })
})

describe('ritmo e backoff', () => {
  it('fra due richieste allo stesso host aspetta il crawl-delay', async () => {
    const t0 = Date.now()
    const f = async () => risposta(200)
    await scarica(URL_OK, { attesaMs: 60, fetchImpl: f })
    await scarica(URL_OK, { attesaMs: 60, fetchImpl: f })
    expect(Date.now() - t0).toBeGreaterThanOrEqual(55)
  })

  it('ritenta su 429 e poi riesce', async () => {
    let n = 0
    const r = await scarica(URL_OK, {
      attesaMs: 0,
      fetchImpl: async () => (++n === 1 ? risposta(429) : risposta(200, 'finalmente')),
    })
    expect(n).toBe(2)
    expect(r.corpo).toBe('finalmente')
  })

  it('ritenta sui 5xx e si arrende dicendo quanti tentativi ha fatto', async () => {
    let n = 0
    await expect(scarica(URL_OK, {
      attesaMs: 0, tentativi: 2,
      fetchImpl: async () => { n++; return risposta(503) },
    })).rejects.toThrow(/2 tentativi/)
    expect(n).toBe(2)
  })

  it('un 403 non si ritenta: è un divieto, non un intoppo', async () => {
    let n = 0
    await expect(scarica(URL_OK, {
      attesaMs: 0,
      fetchImpl: async () => { n++; return risposta(403) },
    })).rejects.toBeInstanceOf(HostNonConsentito)
    expect(n).toBe(1)
  })

  it('rispetta Retry-After quando il server lo indica', async () => {
    let n = 0
    const t0 = Date.now()
    await scarica(URL_OK, {
      attesaMs: 0,
      fetchImpl: async () => (++n === 1 ? risposta(429, 'x', { 'retry-after': '0.05' }) : risposta(200)),
    })
    expect(Date.now() - t0).toBeGreaterThanOrEqual(40)
  })
})
