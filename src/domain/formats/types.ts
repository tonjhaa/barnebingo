/**
 * Regelprofilen er spillmotorens eneste kunnskapskilde. Motoren vet ikke hva
 * "75-bingo" er — den vet bare hva profilen sier. Nye formater legges til som
 * nye fabrikker, aldri som nye grener i motoren.
 */

export const FORMAT_IDS = ['kids', 'bingo75', 'bingo90'] as const
export type FormatId = (typeof FORMAT_IDS)[number]

export const DIFFICULTIES = ['nybegynner', 'enkel', 'normal', 'vanskelig'] as const
export type Difficulty = (typeof DIFFICULTIES)[number]

/** Antall brett en spiller kan få. Seks er en hel 90-talls strimmel. */
export type BoardCount = 1 | 2 | 3 | 4 | 5 | 6

export type MarkingMode = 'manual' | 'auto' | 'assisted'
export type WinMode = 'manual' | 'assisted' | 'autoWin'
export type DrawMode = 'manual' | 'auto' | 'autoConfirm'

/** Hvilke ruter et brett har, og hvilke tall som kan stå hvor. */
export interface BoardLayout {
  rows: number
  cols: number
  /** Ett område per kolonne. Gir 75-bingo sine B-I-N-G-O-kolonner og holder
   *  90-brettet sortert. Lengden må være lik `cols`. */
  columnRanges: ReadonlyArray<{ min: number; max: number }>
  /** Hvor mange av rutene i en rad som faktisk har tall. Mindre enn `cols`
   *  betyr tomme ruter mellom tallene, slik 90-formatet krever. */
  cellsPerRow: number
  /** Fri midtrute. Krever ulikt antall rader og kolonner. Telles alltid som
   *  markert — både for rad og for fullt brett. */
  freeCenter: boolean
  /** Kolonneoverskrifter, f.eks. B I N G O. Tom liste betyr ingen overskrifter. */
  columnLabels: readonly string[]
  /** Skal tallene i en kolonne stige nedover? Påbudt i 90-formatet, og en
   *  vennlighet mot barn som skal lete. Klassiske 75-brett er usorterte. */
  sortColumns: boolean
}

export type PrizeStageType = 'rows' | 'fullHouse'

export interface PrizeStageDef {
  id: string
  type: PrizeStageType
  /** Antall fullførte rader som kreves. Ignorert for `fullHouse`. */
  requiredRows: number
  /** Vises på hovedskjerm og mobil: "Vi spiller om to rader". */
  label: string
}

export interface RuleProfile {
  format: FormatId
  difficulty: Difficulty
  layout: BoardLayout
  numberRange: { min: number; max: number }
  /** Antall tall på ett brett. Utledet av layout, men lagret for enkel validering. */
  numbersPerBoard: number
  boardsPerPlayer: BoardCount

  markingMode: MarkingMode
  /** Permanent false i v1 (se ARKITEKTUR.md §9 Å3). Motoren skiller uansett
   *  mellom påståtte og gyldige markeringer, så flagget kan slås på senere. */
  allowInvalidMarks: boolean

  winMode: WinMode
  /** Hvor lenge etter første gyldige BINGO andre spillere kan rekke å bli
   *  medvinnere på samme trukne tall. Se ARKITEKTUR.md §9 K5. */
  bingoWindowMs: number
  allowRepeatWinners: boolean
  allowMultipleWinnersPerStage: boolean

  prizeStages: PrizeStageDef[]

  drawMode: DrawMode
  drawIntervalMs: number

  /** Utvidelsespunkter. Låst i v1, men motoren spør profilen framfor å anta. */
  linePattern: 'horizontal'
  crossBoardCombination: false

  speech: boolean
  showCurrentNumberOnPhone: boolean
  showDrawHistoryOnPhone: boolean
}

/**
 * Vertens rå valg fra oppsettskjermen. Alt utenom format og vanskelighetsgrad
 * er valgfritt — utelatte felt arver fra vanskelighetsgradens forhåndsinnstilling.
 */
export interface ConfigInput {
  format: FormatId
  difficulty: Difficulty
  boardsPerPlayer?: BoardCount
  freeCenter?: boolean
  enabledStageIds?: string[]
  markingMode?: MarkingMode
  winMode?: WinMode
  drawMode?: DrawMode
  drawIntervalMs?: number
  bingoWindowMs?: number
  allowRepeatWinners?: boolean
  allowMultipleWinnersPerStage?: boolean
  speech?: boolean
  showCurrentNumberOnPhone?: boolean
  showDrawHistoryOnPhone?: boolean
}

/** Hvor mange tall som må trekkes før brettet i teorien kan være fullt. */
export function minimumDrawsForFullBoard(profile: RuleProfile): number {
  return profile.numbersPerBoard
}
