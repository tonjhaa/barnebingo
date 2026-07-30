import type { RuleProfile } from '../formats/types'
import { range, shuffle, type Rng } from '../rng'

/**
 * Trekkmotoren. Hele rekkefølgen bestemmes én gang ved rundestart, og trekk
 * nummer n er ganske enkelt element n i lista. Duplikater er dermed ikke noe
 * vi må vokte oss mot — de er strukturelt umulige. Bonusen er at en runde kan
 * spilles om igjen bit for bit i en test ved å gjenbruke seeden.
 */
export function createDrawOrder(profile: RuleProfile, rng: Rng): number[] {
  return shuffle(range(profile.numberRange.min, profile.numberRange.max), rng)
}

/**
 * Bokstaven som hører til et tall, f.eks. B for 12 i 75-formatet. Tom streng
 * for formater uten kolonneoverskrifter.
 */
export function columnLabelFor(profile: RuleProfile, value: number): string {
  const { columnLabels, columnRanges } = profile.layout
  if (columnLabels.length === 0) return ''
  const index = columnRanges.findIndex((r) => value >= r.min && value <= r.max)
  return index === -1 ? '' : (columnLabels[index] ?? '')
}

/** Slik tallet skal leses og vises: «B 12» eller «Nummer 68». */
export function announce(profile: RuleProfile, value: number): string {
  const letter = columnLabelFor(profile, value)
  return letter ? `${letter} ${value}` : `Nummer ${value}`
}
