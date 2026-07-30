import { describe, expect, it } from 'vitest'
import { range, sample, seededRng, shuffle } from '@/domain/rng'

describe('seedet tilfeldighet', () => {
  it('gir identisk resultat for samme seed', () => {
    const a = shuffle(range(1, 90), seededRng(42))
    const b = shuffle(range(1, 90), seededRng(42))
    expect(a).toEqual(b)
  })

  it('gir ulikt resultat for ulike seed', () => {
    const a = shuffle(range(1, 90), seededRng(1))
    const b = shuffle(range(1, 90), seededRng(2))
    expect(a).not.toEqual(b)
  })

  it('mister eller dupliserer aldri elementer', () => {
    const original = range(1, 75)
    const stokket = shuffle(original, seededRng(7))
    expect(stokket).toHaveLength(75)
    expect(new Set(stokket).size).toBe(75)
    expect([...stokket].sort((x, y) => x - y)).toEqual(original)
  })

  it('muterer ikke listen som sendes inn', () => {
    const original = range(1, 10)
    shuffle(original, seededRng(3))
    expect(original).toEqual(range(1, 10))
  })

  it('trekker unike elementer med sample', () => {
    const trukket = sample(range(1, 40), 16, seededRng(9))
    expect(trukket).toHaveLength(16)
    expect(new Set(trukket).size).toBe(16)
  })

  it('nekter å trekke flere elementer enn som finnes', () => {
    expect(() => sample(range(1, 5), 6, seededRng(1))).toThrow()
  })

  it('fordeler rimelig jevnt over hele området', () => {
    const rng = seededRng(123)
    const bøtter = new Array(10).fill(0)
    for (let i = 0; i < 10000; i++) bøtter[Math.floor(rng() * 10)]++
    for (const antall of bøtter) {
      expect(antall).toBeGreaterThan(800)
      expect(antall).toBeLessThan(1200)
    }
  })
})
