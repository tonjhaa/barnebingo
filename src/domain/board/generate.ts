import { getFormat } from '../formats/registry'
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

/**
 * En strimmel: brettene som selges sammen på ett ark.
 *
 * Slik ser et ekte 90-talls bingoark ut. Seks brett deler alle 90 tallene
 * mellom seg, hvert tall nøyaktig én gang — og har man hele arket, står hvert
 * eneste trukne tall et sted. Det er hele poenget med en strimmel, og grunnen
 * til at brettene ikke kan lages hver for seg.
 *
 * Kolonnene fylles etter tiere: kolonne 0 har 1-9 (ni tall), kolonne 8 har
 * 80-90 (elleve), resten ti hver. Til sammen 90.
 */
export function generateStrip(profile: RuleProfile, playerId: string, rng: Rng): Board[] {
  const { layout } = profile
  const antall = getStripSize(profile)
  const kolonneStørrelser = layout.columnRanges.map((r) => r.max - r.min + 1)

  const fordeling = fordelKolonnerPåBrett(antall, layout, kolonneStørrelser, rng)
  const tall = delUtTall(antall, layout, fordeling, rng)

  return range(0, antall - 1).map((brett) => {
    const counts = fordeling[brett]
    const grid = describeGrid(layout)

    let placement: number[][] | null = null
    for (let attempt = 0; attempt < MAX_ATTEMPTS && !placement; attempt++) {
      placement = assignRows(layout, grid, counts, rng)
    }
    if (!placement) {
      throw new Error('Klarte ikke å fordele tallene på et brett i strimmelen')
    }

    const cells: Cell[][] = range(0, layout.rows - 1).map(() =>
      range(0, layout.cols - 1).map(() => ({ value: null, isFree: false })),
    )

    for (let col = 0; col < layout.cols; col++) {
      placement[col].forEach((row, index) => {
        cells[row][col].value = tall[brett][col][index]
      })
    }

    return { id: generateId('board'), playerId, cells, marks: new Set<number>() }
  })
}

/**
 * Hvilke tall hvert brett får, per kolonne.
 *
 * Tallene i en kolonne deles ut tilfeldig mellom brettene, ikke i rekkefølge —
 * ellers ville brett 1 alltid fått de laveste tallene og brett 6 de høyeste, og
 * arket sett sortert ut i stedet for tilfeldig. Fordi tallene deles ut stigende,
 * står hver kolonne likevel sortert på det enkelte brettet.
 */
function delUtTall(
  antall: number,
  layout: BoardLayout,
  fordeling: number[][],
  rng: Rng,
): number[][][] {
  const tall: number[][][] = range(0, antall - 1).map(() =>
    range(0, layout.cols - 1).map(() => []),
  )

  for (let col = 0; col < layout.cols; col++) {
    const plasser = shuffle(
      fordeling.flatMap((counts, brett) => new Array<number>(counts[col]).fill(brett)),
      rng,
    )
    const { min, max } = layout.columnRanges[col]
    range(min, max).forEach((verdi, i) => tall[plasser[i]][col].push(verdi))
  }

  return tall
}

export function getStripSize(profile: RuleProfile): number {
  return getFormat(profile.format).stripSize ?? 0
}

/**
 * Hvor mange tall hvert brett får fra hver kolonne.
 *
 * Kravene som må gå opp samtidig: hvert brett har 15 tall, hver kolonne deles
 * ut i sin helhet, og ingen kolonne på ett brett har mer enn tre tall eller
 * mindre enn ett. Fordelingen starter derfor med ett tall i hver rute og
 * deler ut resten til de brettene som har mest plass igjen.
 */
function fordelKolonnerPåBrett(
  antall: number,
  layout: BoardLayout,
  kolonneStørrelser: number[],
  rng: Rng,
): number[][] {
  const perBrett = layout.rows * layout.cellsPerRow
  const maksPerKolonne = layout.rows

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const fordeling = range(0, antall - 1).map(() =>
      new Array<number>(layout.cols).fill(1),
    )
    const restPerBrett = new Array<number>(antall).fill(perBrett - layout.cols)
    const restPerKolonne = kolonneStørrelser.map((n) => n - antall)

    let ok = true
    for (const col of shuffle(range(0, layout.cols - 1), rng)) {
      let igjen = restPerKolonne[col]
      const mottakere = shuffle(range(0, antall - 1), rng).sort(
        (a, b) => restPerBrett[b] - restPerBrett[a],
      )

      for (const brett of mottakere) {
        if (igjen === 0) break
        const plass = Math.min(
          maksPerKolonne - fordeling[brett][col],
          restPerBrett[brett],
          igjen,
        )
        if (plass <= 0) continue
        fordeling[brett][col] += plass
        restPerBrett[brett] -= plass
        igjen -= plass
      }

      if (igjen > 0) {
        ok = false
        break
      }
    }

    if (ok && restPerBrett.every((n) => n === 0)) return fordeling
  }

  throw new Error('Klarte ikke å sette sammen en strimmel')
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
 *
 * For formater som selges i ark teller `boardsPerPlayer` **ark**, ikke enkelte
 * brett. Ett ark er alltid helt: seks brett som til sammen har alle nitti
 * tallene. Det er slik bingoark faktisk selges, og et halvt ark ville brutt
 * løftet om at hvert trukket tall står et sted.
 */
export function generateBoards(
  profile: RuleProfile,
  playerId: string,
  rng: Rng,
  taken: Set<string>,
): Board[] {
  if (getStripSize(profile) > 0) {
    const ark = range(1, profile.boardsPerPlayer).flatMap(() =>
      generateStrip(profile, playerId, rng),
    )
    for (const board of ark) taken.add(boardFingerprint(board))
    return ark
  }

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
