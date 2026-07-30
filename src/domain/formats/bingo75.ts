import type { FormatDefinition } from './definition'
import type { PrizeStageDef } from './types'

/**
 * Klassisk 75-tallsbingo. 5×5, kolonnene B-I-N-G-O med hvert sitt tallområde,
 * valgfri fri midtrute. Fem rader betyr at "tre rader" er et ekte stadium her,
 * i motsetning til 90-formatet.
 */
export const bingo75: FormatDefinition = {
  id: 'bingo75',
  name: '75-tallsbingo',
  numberRange: { min: 1, max: 75 },
  supportsFreeCenter: true,
  maxBoardsPerPlayer: 3,

  buildLayout({ freeCenter }) {
    return {
      rows: 5,
      cols: 5,
      cellsPerRow: 5,
      freeCenter,
      columnLabels: ['B', 'I', 'N', 'G', 'O'],
      sortColumns: false,
      columnRanges: [
        { min: 1, max: 15 },
        { min: 16, max: 30 },
        { min: 31, max: 45 },
        { min: 46, max: 60 },
        { min: 61, max: 75 },
      ],
    }
  },

  availableStages(): PrizeStageDef[] {
    return [
      { id: 'row1', type: 'rows', requiredRows: 1, label: 'Én rad' },
      { id: 'row2', type: 'rows', requiredRows: 2, label: 'To rader' },
      { id: 'row3', type: 'rows', requiredRows: 3, label: 'Tre rader' },
      { id: 'full', type: 'fullHouse', requiredRows: 5, label: 'Fullt brett' },
    ]
  },
}
