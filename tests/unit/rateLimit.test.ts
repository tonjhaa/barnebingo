import { describe, expect, it } from 'vitest'
import { BUCKETS, RateLimiter } from '@/infra/rateLimit'

const NÅ = 1_700_000_000_000

describe('rate limiting', () => {
  it('slipper gjennom opp til bøttas kapasitet', () => {
    const limiter = new RateLimiter()
    const { capacity } = BUCKETS.mark

    for (let i = 0; i < capacity; i++) {
      expect(limiter.take('socket-1', 'mark', NÅ)).toBe(true)
    }
    expect(limiter.take('socket-1', 'mark', NÅ)).toBe(false)
  })

  it('fyller på igjen over tid', () => {
    const limiter = new RateLimiter()
    const { capacity, refillPerSecond } = BUCKETS.mark

    for (let i = 0; i < capacity; i++) limiter.take('socket-1', 'mark', NÅ)
    expect(limiter.take('socket-1', 'mark', NÅ)).toBe(false)

    // Ett sekund senere er det plass til `refillPerSecond` nye.
    const senere = NÅ + 1000
    for (let i = 0; i < refillPerSecond; i++) {
      expect(limiter.take('socket-1', 'mark', senere)).toBe(true)
    }
    expect(limiter.take('socket-1', 'mark', senere)).toBe(false)
  })

  it('fyller aldri over kapasiteten, uansett hvor lenge det er stille', () => {
    const limiter = new RateLimiter()
    const { capacity } = BUCKETS.mark

    limiter.take('socket-1', 'mark', NÅ)
    const mye = NÅ + 60 * 60 * 1000

    for (let i = 0; i < capacity; i++) {
      expect(limiter.take('socket-1', 'mark', mye)).toBe(true)
    }
    expect(limiter.take('socket-1', 'mark', mye)).toBe(false)
  })

  it('holder bøttene adskilt per socket og per handling', () => {
    const limiter = new RateLimiter()
    for (let i = 0; i < BUCKETS.bingo.capacity; i++) {
      limiter.take('socket-1', 'bingo', NÅ)
    }

    expect(limiter.take('socket-1', 'bingo', NÅ)).toBe(false)
    // En annen telefon er upåvirket, og det samme er andre handlinger.
    expect(limiter.take('socket-2', 'bingo', NÅ)).toBe(true)
    expect(limiter.take('socket-1', 'mark', NÅ)).toBe(true)
  })

  it('glemmer en socket som er borte, så minnet ikke vokser', () => {
    const limiter = new RateLimiter()
    for (let i = 0; i < BUCKETS.bingo.capacity; i++) {
      limiter.take('socket-1', 'bingo', NÅ)
    }
    expect(limiter.take('socket-1', 'bingo', NÅ)).toBe(false)

    limiter.forget('socket-1')
    expect(limiter.take('socket-1', 'bingo', NÅ)).toBe(true)
  })

  it('gir trekk en romsligere bøtte enn andre vertskommandoer', () => {
    // En hel 90-runde trukket i full fart er legitimt; innstillinger som
    // endres 100 ganger på et sekund er det ikke.
    expect(BUCKETS.draw.capacity).toBeGreaterThanOrEqual(90)
    expect(BUCKETS.hostCommand.capacity).toBeLessThan(BUCKETS.draw.capacity)
  })

  it('er strengest på det som koster mest', () => {
    expect(BUCKETS.selfie.capacity).toBeLessThanOrEqual(BUCKETS.claim.capacity)
    expect(BUCKETS.bingo.refillPerSecond).toBeLessThan(BUCKETS.mark.refillPerSecond)
  })
})
