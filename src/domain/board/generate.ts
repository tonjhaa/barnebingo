import type { BoardLayout, RuleProfile } from '../formats/types'
import { generateId } from '../ids'
import { range, sample, shuffle, type Rng } from '../rng'
import { boardNumbers, type Board, type Cell } from './board'

/**
 * Brettgenerering for alle formater. Den er bevisst format-agnostisk: den leser
 * layouten fra regelprofilen og kjenner verken B-I-N-G-O eller 90-tallsregler.
 *
 * To tilfeller faller ut av samme algoritme:
 *   – Fullt rutenett (barnebingo, 75): hver kolonne har like mange tall som
 *     brettet har rader, og hver rute er fylt.
 *   – Glissent rutenett (90): fem tall per rad fordelt over ni kolonner, med
 *     tomme ruter imellom. Hver kolonne må ha minst ett tall.
 */

/** Hvor mange forsøk radfordelingen får før vi gir opp med en tydelig feil. */
const MAX_ATTEMPTS = 50

interface Grid {
  freeRow: number
  freeCol: number
  rowCapacity: number[]
  total: number
}

function describeGrid(layout: BoardLayout): Grid {
  const freeRow = layout.freeCenter ? (layout.rows - 1) / 2 : -1
  const freeCol = layout.freeCenter ? (layout.cols - 1) / 2 : -1

  const rowCapacity = new Array<number>(layout.rows).fill(layout.cellsPerRow)
  // Den frie ruta opptar en plass i sin rad, men trenger ikke noe tall.
  if (layout.freeCenter) rowCapacity[freeRow] -= 1

  return {
    freeRow,
    freeCol,
    rowCapacity,
    total: rowCapacity.reduce((sum, n) => sum + n, 0),
  }
}

/**
 * Hvor mange tall hver kolonne skal ha. Ved fullt rutenett er svaret gitt; ved
 * glissent rutenett starter alle kolonner på ett tall, og resten fordeles
 * tilfeldig uten at noen kolonne får flere tall enn brettet har rader.
 */
function chooseColumnCounts(layout: BoardLayout, grid: Grid, rng: Rng): number[] {
  const fullGrid = layout.cellsPerRow === layout.cols

  if (fullGrid) {
    return range(0, layout.cols - 1).map((col) =>
      col === grid.freeCol ? layout.rows - 1 : layout.rows,
    )
  }

  const counts = new Array<number>(layout.cols).fill(1)
  let remaining = grid.total - layout.cols

  while (remaining > 0) {
    const candidates = range(0, layout.cols - 1).filter((col) => counts[col] < layout.rows)
    if (candidates.length === 0) {
      throw new Error('Layouten har ikke plass til så mange tall')
    }
    counts[shuffle(candidates, rng)[0]] += 1
    remaining -= 1
  }

  return counts
}

/**
 * Plasserer hver kolonnes tall i rader slik at hver rad får nøyaktig så mange
 * tall som layouten sier. De mest krevende kolonnene går først, og blant like
 * gode rader velges den med mest ledig plass — det er det som holder de siste
 * kolonnene fra å male seg inn i et hjørne.
 */
function assignRows(
  layout: BoardLayout,
  grid: Grid,
  counts: number[],
  rng: Rng,
): number[][] | null {
  const remaining = grid.rowCapacity.slice()
  const placement: number[][] = counts.map(() => [])

  const order = shuffle(range(0, layout.cols - 1), rng).sort(
    (a, b) => counts[b] - counts[a],
  )

  for (const col of order) {
    const allowed = range(0, layout.rows - 1).filter(
      (row) => remaining[row] > 0 && !(row === grid.freeRow && col === grid.freeCol),
    )
    if (allowed.length < counts[col]) return null

    const chosen = shuffle(allowed, rng)
      .sort((a, b) => remaining[b] - remaining[a])
      .slice(0, counts[col])

    for (const row of chosen) remaining[row] -= 1
    placement[col] = chosen.sort((a, b) => a - b)
  }

  return remaining.every((n) => n === 0) ? placement : null
}

export function generateBoard(
  profile: RuleProfile,
  playerId: string,
  rng: Rng,
): Board {
  const { layout } = profile
  const grid = describeGrid(layout)

  let placement: number[][] | null = null
  let counts: number[] = []
  for (let attempt = 0; attempt < MAX_ATTEMPTS && !placement; attempt++) {
    counts = chooseColumnCounts(layout, grid, rng)
    placement = assignRows(layout, grid, counts, rng)
  }
  if (!placement) {
    throw new Error(
      `Klarte ikke å fordele tallene på et ${layout.rows} × ${layout.cols}-brett`,
    )
  }

  const cells: Cell[][] = range(0, layout.rows - 1).map((row) =>
    range(0, layout.cols - 1).map((col) => ({
      value: null,
      isFree: row === grid.freeRow && col === grid.freeCol,
    })),
  )

  for (let col = 0; col < layout.cols; col++) {
    const { min, max } = layout.columnRanges[col]
    const picked = sample(range(min, max), counts[col], rng)
    // Ved sortering stiger tallene nedover kolonnen; ellers står de som trukket.
    const values = layout.sortColumns ? picked.slice().sort((a, b) => a - b) : picked
    placement[col].forEach((row, index) => {
      cells[row][col].value = values[index]
    })
  }

  return {
    id: generateId('board'),
    playerId,
    cells,
    marks: new Set<number>(),
  }
}

/** Brettets tall som en stabil nøkkel, brukt til å hindre to like brett. */
export function boardFingerprint(board: Board): string {
  return boardNumbers(board)
    .slice()
    .sort((a, b) => a - b)
    .join(',')
}

/**
 * Deler ut brett til én spiller. `taken` samler alle brett som allerede er delt
 * ut i runden, slik at ingen to spillere får identiske brett — to like brett
 * ville betydd at de to alltid vant samtidig.
 */
export function generateBoards(
  profile: RuleProfile,
  playerId: string,
  rng: Rng,
  taken: Set<string>,
): Board[] {
  const boards: Board[] = []

  for (let i = 0; i < profile.boardsPerPlayer; i++) {
    let board = generateBoard(profile, playerId, rng)
    for (let attempt = 0; attempt < MAX_ATTEMPTS && taken.has(boardFingerprint(board)); attempt++) {
      board = generateBoard(profile, playerId, rng)
    }
    taken.add(boardFingerprint(board))
    boards.push(board)
  }

  return boards
}
