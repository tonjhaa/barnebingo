import type { BoardCount, Difficulty, DrawMode, MarkingMode, WinMode } from './types'

export interface DifficultyPreset {
  label: string
  description: string
  boardsPerPlayer: BoardCount
  markingMode: MarkingMode
  winMode: WinMode
  drawMode: DrawMode
  drawIntervalMs: number
  bingoWindowMs: number
  speech: boolean
  showCurrentNumberOnPhone: boolean
  showDrawHistoryOnPhone: boolean
}

/**
 * Forhåndsinnstillinger fra kravspesifikasjonen §6. Verten kan overstyre hvert
 * enkelt felt etterpå — dette er startpunktet, ikke en tvangstrøye.
 *
 * De to letteste gradene bruker manuell trekking framfor «langsom trekning»:
 * spesifikasjonen ber om begge deler (§6 og §11), og med små barn er det verten
 * som ser når alle er ferdige med å lete, ikke en timer. `drawIntervalMs` er
 * likevel satt lavt-og-langsomt, så automatisk trekking blir riktig hvis verten
 * bytter underveis.
 *
 * Opplesning er på i alle gradene. Med en ekte programlederstemme er det ikke
 * lenger støy, men selve rammen rundt spillet — og for et barn som ennå leser
 * tall langsomt er opplesningen forskjellen på å henge med og å gi opp. Verten
 * kan slå den av i oppsettet eller med høyttalerknappen under spill.
 */
export const DIFFICULTY_PRESETS: Record<Difficulty, DifficultyPreset> = {
  nybegynner: {
    label: 'Nybegynner',
    description: 'Appen markerer og roper bingo selv. Barnet trenger bare å følge med.',
    boardsPerPlayer: 1,
    markingMode: 'auto',
    winMode: 'autoWin',
    drawMode: 'manual',
    drawIntervalMs: 15000,
    bingoWindowMs: 2500,
    speech: true,
    showCurrentNumberOnPhone: true,
    showDrawHistoryOnPhone: true,
  },
  enkel: {
    label: 'Enkel',
    description: 'Barnet markerer selv, men får hjelp til å oppdage bingo.',
    boardsPerPlayer: 1,
    markingMode: 'manual',
    winMode: 'assisted',
    drawMode: 'manual',
    drawIntervalMs: 12000,
    bingoWindowMs: 2500,
    speech: true,
    showCurrentNumberOnPhone: true,
    showDrawHistoryOnPhone: true,
  },
  normal: {
    label: 'Normal',
    description: 'Vanlig bingo. Du markerer selv og roper bingo selv.',
    boardsPerPlayer: 1,
    markingMode: 'manual',
    winMode: 'manual',
    drawMode: 'auto',
    drawIntervalMs: 8000,
    bingoWindowMs: 1500,
    speech: true,
    showCurrentNumberOnPhone: true,
    showDrawHistoryOnPhone: true,
  },
  vanskelig: {
    label: 'Vanskelig',
    description: 'Tre brett, raskt tempo og ingen hjelp på telefonen.',
    boardsPerPlayer: 3,
    markingMode: 'manual',
    winMode: 'manual',
    drawMode: 'auto',
    drawIntervalMs: 5000,
    bingoWindowMs: 1500,
    speech: true,
    showCurrentNumberOnPhone: false,
    showDrawHistoryOnPhone: false,
  },
}
