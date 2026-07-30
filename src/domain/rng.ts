/**
 * Seedbar tilfeldighet. Domenelaget kaller aldri Math.random direkte — all
 * tilfeldighet kommer inn som en Rng slik at brettgenerering og trekkrekkefølge
 * kan reproduseres eksakt i tester.
 */
export type Rng = () => number

/** mulberry32: liten, rask, god nok fordeling for spill. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function randomSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0
}

/** Fisher-Yates. Returnerer en ny liste; muterer ikke input. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** Trekker n unike elementer uten å endre input. */
export function sample<T>(items: readonly T[], n: number, rng: Rng): T[] {
  if (n > items.length) {
    throw new Error(`Kan ikke trekke ${n} av ${items.length} elementer`)
  }
  return shuffle(items, rng).slice(0, n)
}

/** Heltall fra..til, begge inklusive. */
export function range(from: number, to: number): number[] {
  const out: number[] = []
  for (let i = from; i <= to; i++) out.push(i)
  return out
}
