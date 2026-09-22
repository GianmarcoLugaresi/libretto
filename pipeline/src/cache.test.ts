// @vitest-environment node
import { it, expect, beforeEach } from 'vitest'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Cache } from './cache'

let dir: string
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'cache-')) })
const nuova = () => new Cache(join(dir, 'etag.json'))
const URL_ = 'https://corsidilaurea.uniroma1.it/it/course/33426'

it('ricorda un etag fra due esecuzioni', async () => {
  const a = nuova(); await a.carica()
  a.segna(URL_, { etag: 'W/"abc"' })
  await a.salva()

  const b = nuova(); await b.carica()
  expect(b.prendi(URL_).etag).toBe('W/"abc"')
})

it('un 304 senza etag non cancella quello che avevamo', async () => {
  const c = nuova(); await c.carica()
  c.segna(URL_, { etag: 'W/"abc"', lastModified: 'Mon, 01 Sep 2025 10:00:00 GMT' })
  c.segna(URL_, {})
  expect(c.prendi(URL_)).toEqual({ etag: 'W/"abc"', lastModified: 'Mon, 01 Sep 2025 10:00:00 GMT' })
})

it('una voce vecchia si ignora, così un cambiamento non resta nascosto', async () => {
  await writeFile(join(dir, 'etag.json'), JSON.stringify({
    [URL_]: { etag: 'W/"vecchio"', vista: '2020-01-01T00:00:00.000Z' },
  }), 'utf8')
  const c = nuova(); await c.carica()
  expect(c.prendi(URL_)).toEqual({})
  expect(c.prendi(URL_, 99_999).etag).toBe('W/"vecchio"')
})

it('un file corrotto non fa fallire il giro', async () => {
  await writeFile(join(dir, 'etag.json'), 'non json', 'utf8')
  const c = nuova()
  await expect(c.carica()).resolves.toBeUndefined()
  expect(c.dimensione).toBe(0)
})

it('un url mai visto non ha condizioni', async () => {
  const c = nuova(); await c.carica()
  expect(c.prendi('https://corsidilaurea.uniroma1.it/it')).toEqual({})
})
