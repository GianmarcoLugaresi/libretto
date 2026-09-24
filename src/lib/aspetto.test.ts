import { describe, it, expect, afterEach } from 'vitest'
import { applicaTema, temaEffettivo } from './aspetto'

/** Un telefono finto: dice se è in chiaro, e può cambiare idea. */
function telefono(chiaro: boolean) {
  const ascolti = new Set<() => void>()
  const mq = {
    get matches() { return chiaro },
    addEventListener: (_: string, f: () => void) => ascolti.add(f),
    removeEventListener: (_: string, f: () => void) => ascolti.delete(f),
  }
  window.matchMedia = (() => mq) as unknown as typeof window.matchMedia
  return {
    cambia(v: boolean) { chiaro = v; ascolti.forEach(f => f()) },
    ascolti,
  }
}

const tema = () => document.documentElement.getAttribute('data-theme')
const matchMediaVero = window.matchMedia
afterEach(() => {
  window.matchMedia = matchMediaVero
  document.documentElement.removeAttribute('data-theme')
})

describe('temaEffettivo', () => {
  it('una scelta esplicita vince sul telefono', () => {
    expect(temaEffettivo('chiaro', false)).toBe('chiaro')
    expect(temaEffettivo('scuro', true)).toBe('scuro')
  })
  it('in automatico segue il telefono', () => {
    expect(temaEffettivo('auto', true)).toBe('chiaro')
    expect(temaEffettivo('auto', false)).toBe('scuro')
  })
})

describe('applicaTema', () => {
  it('chiaro e scuro si applicano alla pagina', () => {
    telefono(false)
    applicaTema('chiaro')
    expect(tema()).toBe('light')
    applicaTema('scuro')
    expect(tema()).toBeNull()
  })

  it('in automatico cambia quando cambia il telefono, e smette quando gli si dice', () => {
    const t = telefono(false)
    const smetti = applicaTema('auto')
    expect(tema()).toBeNull()
    t.cambia(true)
    expect(tema()).toBe('light')
    smetti()
    expect(t.ascolti.size).toBe(0)
    t.cambia(false)
    expect(tema()).toBe('light')   // non ascolta più
  })

  it('con una scelta esplicita non ascolta il telefono', () => {
    const t = telefono(true)
    applicaTema('scuro')
    expect(t.ascolti.size).toBe(0)
    expect(tema()).toBeNull()
  })
})
