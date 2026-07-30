/**
 * Token bucket per (nøkkel, handling). Beskytter mot en telefon som henger i
 * en løkke eller et barn som hamrer på en knapp — ikke mot en angriper med
 * båndbredde, som uansett ikke er trusselbildet på et hjemmenettverk.
 */
export interface Bucket {
  capacity: number
  refillPerSecond: number
}

export const BUCKETS = {
  mark: { capacity: 20, refillPerSecond: 10 },
  bingo: { capacity: 3, refillPerSecond: 0.5 },
  claim: { capacity: 5, refillPerSecond: 0.2 },
  lookup: { capacity: 10, refillPerSecond: 1 },
  selfie: { capacity: 3, refillPerSecond: 0.05 },
  hostCommand: { capacity: 30, refillPerSecond: 10 },
  // Trekk får sin egen, romsligere bøtte: en hel 90-runde trukket i full fart
  // er helt legitimt, mens en løpsk klientløkke fortsatt bremses til 10 i
  // sekundet. Innstillinger endres derimot sjelden, så de blir liggende over.
  draw: { capacity: 100, refillPerSecond: 10 },
} as const satisfies Record<string, Bucket>

export type BucketName = keyof typeof BUCKETS

interface State {
  tokens: number
  updatedAt: number
}

export class RateLimiter {
  private states = new Map<string, State>()

  /** Returnerer true hvis handlingen slipper gjennom. */
  take(key: string, bucketName: BucketName, now: number): boolean {
    const bucket = BUCKETS[bucketName]
    const id = `${key}:${bucketName}`
    const state = this.states.get(id) ?? { tokens: bucket.capacity, updatedAt: now }

    const elapsedSeconds = Math.max(0, now - state.updatedAt) / 1000
    state.tokens = Math.min(
      bucket.capacity,
      state.tokens + elapsedSeconds * bucket.refillPerSecond,
    )
    state.updatedAt = now

    if (state.tokens < 1) {
      this.states.set(id, state)
      return false
    }
    state.tokens -= 1
    this.states.set(id, state)
    return true
  }

  forget(key: string): void {
    for (const id of this.states.keys()) {
      if (id.startsWith(`${key}:`)) this.states.delete(id)
    }
  }
}
