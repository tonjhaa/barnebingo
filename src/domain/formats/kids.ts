import type { FormatDefinition } from './definition'
import type { PrizeStageDef } from './types'

/**
 * Forenklet barnebingo. 4×4 med tallene 1-40, fire like kolonneområder slik at
 * brettet er sortert og lett å lete i. Ingen fri rute — en 6-åring skal ikke
 * måtte forstå hvorfor én rute er markert på forhånd.
 *
 * 16 tall av 40 gir en runde på rundt 25 trekk: lang nok til å bygge spenning,
 * kort nok til å holde på oppmerksomheten.
 */
export const kids: FormatDefinition = {
  id: 'kids',
  name: 'Barnebingo',
  numberRange: { min: 1, max: 40 },
  supportsFreeCenter: false,
  maxBoardsPerPlayer: 3,

  buildLayout() {
    return {
      rows: 4,
      cols: 4,
      cellsPerRow: 4,
      freeCenter: false,
      columnLabels: [],
      sortColumns: true,
      columnRanges: [
        { min: 1, max: 10 },
        { min: 11, max: 20 },
        { min: 21, max: 30 },
        { min: 31, max: 40 },
      ],
    }
  },

  availableStages(): PrizeStageDef[] {
    return [
      { id: 'row1', type: 'rows', requiredRows: 1, label: 'Én rad' },
      { id: 'row2', type: 'rows', requiredRows: 2, label: 'To rader' },
      { id: 'full', type: 'fullHouse', requiredRows: 4, label: 'Fullt brett' },
    ]
  },
}
