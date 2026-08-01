import type { BoardCount, BoardLayout, FormatId, PrizeStageDef } from './types'

/**
 * Alt et nytt bingoformat må oppgi. Å legge til et fjerde format skal kreve
 * én ny fil som implementerer dette — ingenting annet.
 */
export interface FormatDefinition {
  id: FormatId
  name: string
  numberRange: { min: number; max: number }
  /** Kan verten slå på fri midtrute for dette formatet? */
  supportsFreeCenter: boolean
  /**
   * Taket for `boardsPerPlayer`. For formater med `stripSize` telles dette i
   * **ark**, ikke i enkeltbrett — tre ark er atten brett.
   */
  maxBoardsPerPlayer: BoardCount
  /**
   * Hvor mange brett det er på ett ark, der hvert tall i området står nøyaktig
   * én gang. Slik selges 90-talls bingoark: seks brett per ark, nitti tall til
   * sammen. Et ark deles aldri opp — halve arket ville brutt løftet om at
   * hvert trukket tall står et sted.
   *
   * Utelates for formater der hvert brett står for seg.
   */
  stripSize?: number
  buildLayout(options: { freeCenter: boolean }): BoardLayout
  /** Alle lovlige stadier i riktig rekkefølge. Verten kan slå av enkelte,
   *  men aldri legge til noe som ikke står her. Det er slik 90-formatet
   *  hindrer et separat "tre rader"-stadium (ARKITEKTUR.md §9 K1). */
  availableStages(): PrizeStageDef[]
}

export function countNumbers(layout: BoardLayout): number {
  return layout.rows * layout.cellsPerRow - (layout.freeCenter ? 1 : 0)
}

/** Deler et tallområde i like store kolonneområder. Resten legges på siste kolonne. */
export function splitIntoColumns(
  min: number,
  max: number,
  cols: number,
): Array<{ min: number; max: number }> {
  const total = max - min + 1
  const per = Math.floor(total / cols)
  const ranges: Array<{ min: number; max: number }> = []
  let cursor = min
  for (let c = 0; c < cols; c++) {
    const isLast = c === cols - 1
    const end = isLast ? max : cursor + per - 1
    ranges.push({ min: cursor, max: end })
    cursor = end + 1
  }
  return ranges
}
