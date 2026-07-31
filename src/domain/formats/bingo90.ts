import type { FormatDefinition } from './definition'
import type { PrizeStageDef } from './types'

/**
 * Klassisk 90-tallsbingo. 3 rader × 9 kolonner, fem tall per rad, altså 15 tall
 * og 12 tomme ruter. Kolonne 0 dekker 1-9, kolonne 8 dekker 80-90, resten ti hver.
 *
 * Merk at det bevisst ikke finnes et "tre rader"-stadium: brettet har bare tre
 * rader, så tre fulle rader *er* fullt brett (ARKITEKTUR.md §9 K1).
 */
export const bingo90: FormatDefinition = {
  id: 'bingo90',
  name: '90-tallsbingo',
  numberRange: { min: 1, max: 90 },
  supportsFreeCenter: false,
  maxBoardsPerPlayer: 6,
  // Et helt bingoark: seks brett som deler alle 90 tallene mellom seg.
  stripSize: 6,

  buildLayout() {
    return {
      rows: 3,
      cols: 9,
      cellsPerRow: 5,
      freeCenter: false,
      columnLabels: [],
      sortColumns: true,
      columnRanges: [
        { min: 1, max: 9 },
        { min: 10, max: 19 },
        { min: 20, max: 29 },
        { min: 30, max: 39 },
        { min: 40, max: 49 },
        { min: 50, max: 59 },
        { min: 60, max: 69 },
        { min: 70, max: 79 },
        { min: 80, max: 90 },
      ],
    }
  },

  availableStages(): PrizeStageDef[] {
    return [
      { id: 'row1', type: 'rows', requiredRows: 1, label: 'Én rad' },
      { id: 'row2', type: 'rows', requiredRows: 2, label: 'To rader' },
      { id: 'full', type: 'fullHouse', requiredRows: 3, label: 'Fullt brett' },
    ]
  },
}
