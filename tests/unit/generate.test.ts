import { describe, expect, it } from 'vitest'
import { boardNumbers, type Board } from '@/domain/board/board'
import {
  boardFingerprint,
  generateBoard,
  generateBoards,
  generateStrip,
} from '@/domain/board/generate'
import { buildProfile } from '@/domain/formats/registry'
import { FORMAT_IDS, type FormatId, type RuleProfile } from '@/domain/formats/types'
import { seededRng } from '@/domain/rng'

function profileFor(format: FormatId, freeCenter?: boolean): RuleProfile {
  return buildProfile({ format, difficulty: 'normal', freeCenter })
}

function make(format: FormatId, seed = 1, freeCenter?: boolean): Board {
  return generateBoard(profileFor(format, freeCenter), 'p1', seededRng(seed))
}

/** Alt som må være sant om ethvert brett, uansett format. */
function expectValidBoard(board: Board, profile: RuleProfile) {
  const { layout } = profile

  expect(board.cells).toHaveLength(layout.rows)
  for (const row of board.cells) expect(row).toHaveLength(layout.cols)

  const numbers = boardNumbers(board)
  expect(numbers).toHaveLength(profile.numbersPerBoard)
  expect(new Set(numbers).size).toBe(numbers.length)

  // Hver rad har nøyaktig så mange tall som layouten sier.
  for (const row of board.cells) {
    const filled = row.filter((cell) => cell.value !== null).length
    const free = row.filter((cell) => cell.isFree).length
    expect(filled + free).toBe(layout.cellsPerRow)
  }

  // Hvert tall ligger i sin kolonnes område.
  board.cells.forEach((row) => {
    row.forEach((cell, col) => {
      if (cell.value === null) return
      const { min, max } = layout.columnRanges[col]
      expect(cell.value).toBeGreaterThanOrEqual(min)
      expect(cell.value).toBeLessThanOrEqual(max)
    })
  })

  if (layout.sortColumns) {
    for (let col = 0; col < layout.cols; col++) {
      const column = board.cells
        .map((row) => row[col].value)
        .filter((v): v is number => v !== null)
      expect(column).toEqual([...column].sort((a, b) => a - b))
    }
  }
}

describe('brettgenerering, felles krav', () => {
  it.each(FORMAT_IDS)('%s gir et gyldig brett', (format) => {
    expectValidBoard(make(format), profileFor(format))
  })

  it.each(FORMAT_IDS)('%s gir samme brett for samme seed', (format) => {
    const a = boardNumbers(make(format, 42))
    const b = boardNumbers(make(format, 42))
    expect(a).toEqual(b)
  })

  it.each(FORMAT_IDS)('%s gir ulike brett for ulike seed', (format) => {
    const a = boardNumbers(make(format, 1))
    const b = boardNumbers(make(format, 2))
    expect(a).not.toEqual(b)
  })

  it.each(FORMAT_IDS)('%s tåler 300 brett på rad uten å feile', (format) => {
    const profile = profileFor(format)
    const rng = seededRng(7)
    for (let i = 0; i < 300; i++) {
      expectValidBoard(generateBoard(profile, 'p1', rng), profile)
    }
  })
})

describe('75-tallsbrett', () => {
  it('har 24 tall og en fri midtrute', () => {
    const board = make('bingo75', 3, true)
    expect(boardNumbers(board)).toHaveLength(24)
    expect(board.cells[2][2].isFree).toBe(true)
    expect(board.cells[2][2].value).toBeNull()
  })

  it('har 25 tall uten fri midtrute', () => {
    const board = make('bingo75', 3, false)
    expect(boardNumbers(board)).toHaveLength(25)
    expect(board.cells.flat().every((cell) => !cell.isFree)).toBe(true)
  })

  it('holder B-I-N-G-O-kolonnene innenfor sine femtenere', () => {
    const board = make('bingo75', 5, true)
    const grenser = [
      [1, 15],
      [16, 30],
      [31, 45],
      [46, 60],
      [61, 75],
    ]
    grenser.forEach(([min, max], col) => {
      board.cells.forEach((row) => {
        if (row[col].value === null) return
        expect(row[col].value).toBeGreaterThanOrEqual(min)
        expect(row[col].value).toBeLessThanOrEqual(max)
      })
    })
  })

  it('fyller hver rute utenom den frie', () => {
    const board = make('bingo75', 8, true)
    const tomme = board.cells.flat().filter((cell) => cell.value === null && !cell.isFree)
    expect(tomme).toHaveLength(0)
  })

  it('lar kolonnene stå usortert, slik klassiske brett gjør', () => {
    // Med tjue brett skal minst én kolonne et sted være usortert.
    const rng = seededRng(11)
    const profile = profileFor('bingo75', true)
    const noenUsortert = Array.from({ length: 20 }, () =>
      generateBoard(profile, 'p1', rng),
    ).some((board) =>
      Array.from({ length: 5 }, (_, col) =>
        board.cells.map((row) => row[col].value).filter((v): v is number => v !== null),
      ).some((column) => column.join() !== [...column].sort((a, b) => a - b).join()),
    )
    expect(noenUsortert).toBe(true)
  })
})

describe('barnebingobrett', () => {
  it('har 16 tall i et 4 × 4-rutenett', () => {
    const board = make('kids')
    expect(board.cells).toHaveLength(4)
    expect(boardNumbers(board)).toHaveLength(16)
  })

  it('har sorterte kolonner, så et barn kan lete oppover og nedover', () => {
    const board = make('kids', 4)
    for (let col = 0; col < 4; col++) {
      const column = board.cells.map((row) => row[col].value as number)
      expect(column).toEqual([...column].sort((a, b) => a - b))
    }
  })
})

describe('90-tallsbrett', () => {
  const profile = profileFor('bingo90')

  it('har 15 tall fordelt på 3 × 9', () => {
    const board = make('bingo90')
    expect(board.cells).toHaveLength(3)
    expect(board.cells[0]).toHaveLength(9)
    expect(boardNumbers(board)).toHaveLength(15)
  })

  it('har nøyaktig fem tall i hver rad', () => {
    const rng = seededRng(21)
    for (let i = 0; i < 200; i++) {
      const board = generateBoard(profile, 'p1', rng)
      for (const row of board.cells) {
        expect(row.filter((cell) => cell.value !== null)).toHaveLength(5)
      }
    }
  })

  it('gir hver kolonne mellom ett og tre tall', () => {
    const rng = seededRng(22)
    for (let i = 0; i < 200; i++) {
      const board = generateBoard(profile, 'p1', rng)
      for (let col = 0; col < 9; col++) {
        const antall = board.cells.filter((row) => row[col].value !== null).length
        expect(antall).toBeGreaterThanOrEqual(1)
        expect(antall).toBeLessThanOrEqual(3)
      }
    }
  })

  it('lar tallene stige nedover hver kolonne', () => {
    const rng = seededRng(23)
    for (let i = 0; i < 100; i++) {
      const board = generateBoard(profile, 'p1', rng)
      for (let col = 0; col < 9; col++) {
        const column = board.cells
          .map((row) => row[col].value)
          .filter((v): v is number => v !== null)
        expect(column).toEqual([...column].sort((a, b) => a - b))
      }
    }
  })
})

describe('90-talls strimmel', () => {
  const profile = profileFor('bingo90')

  function strimmel(seed: number) {
    return generateStrip(profile, 'p1', seededRng(seed))
  }

  it('består av seks brett, slik et ekte bingoark gjør', () => {
    expect(strimmel(1)).toHaveLength(6)
  })

  it('har hvert tall fra 1 til 90 nøyaktig én gang', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const alle = strimmel(seed).flatMap(boardNumbers)
      expect(alle).toHaveLength(90)
      expect([...alle].sort((a, b) => a - b)).toEqual(
        Array.from({ length: 90 }, (_, i) => i + 1),
      )
    }
  })

  it('gir hvert brett i strimmelen samme form som et enkeltbrett', () => {
    for (let seed = 1; seed <= 20; seed++) {
      for (const board of strimmel(seed)) expectValidBoard(board, profile)
    }
  })

  it('sprer tallene i en kolonne mellom brettene', () => {
    // Uten spredning ville brett 1 alltid fått de laveste tallene i hver
    // kolonne og brett 6 de høyeste, og arket sett sortert ut i stedet for
    // tilfeldig. Det første brettet skal derfor ikke alltid ha kolonnens
    // laveste tall.
    const førstetall = Array.from({ length: 20 }, (_, i) =>
      Math.min(...boardNumbers(strimmel(i + 1)[0])),
    )
    expect(new Set(førstetall).size).toBeGreaterThan(1)
  })

  it('lager ulike strimler for ulike seed', () => {
    const a = strimmel(1).map(boardFingerprint)
    const b = strimmel(2).map(boardFingerprint)
    expect(a).not.toEqual(b)
  })

  it('gir spilleren de første brettene når verten velger færre enn seks', () => {
    for (const antall of [1, 2, 3, 4, 5, 6] as const)
      expect(
        generateBoards(
          buildProfile({ format: 'bingo90', difficulty: 'normal', boardsPerPlayer: antall }),
          'p1',
          seededRng(5),
          new Set(),
        ),
      ).toHaveLength(antall)
  })

  it('gir aldri samme tall to ganger hos én spiller', () => {
    const p = buildProfile({
      format: 'bingo90',
      difficulty: 'normal',
      boardsPerPlayer: 4,
    })
    const rng = seededRng(17)
    for (let i = 0; i < 30; i++) {
      const tall = generateBoards(p, 'p1', rng, new Set()).flatMap(boardNumbers)
      expect(new Set(tall).size).toBe(tall.length)
    }
  })
})

describe('flere brett per spiller', () => {
  it.each([1, 2, 3] as const)('deler ut %i brett', (antall) => {
    const profile = buildProfile({
      format: 'bingo75',
      difficulty: 'normal',
      boardsPerPlayer: antall,
    })
    const boards = generateBoards(profile, 'p1', seededRng(9), new Set())
    expect(boards).toHaveLength(antall)
    expect(new Set(boards.map((b) => b.id)).size).toBe(antall)
  })

  it('gir aldri to spillere det samme brettet', () => {
    const profile = buildProfile({
      format: 'kids',
      difficulty: 'enkel',
      boardsPerPlayer: 3,
    })
    const rng = seededRng(13)
    const taken = new Set<string>()
    const alle = ['p1', 'p2', 'p3', 'p4'].flatMap((id) =>
      generateBoards(profile, id, rng, taken),
    )

    expect(alle).toHaveLength(12)
    expect(new Set(alle.map(boardFingerprint)).size).toBe(12)
  })

  it('knytter hvert brett til riktig spiller', () => {
    const profile = profileFor('bingo75')
    const boards = generateBoards(profile, 'spiller-7', seededRng(3), new Set())
    expect(boards.every((board) => board.playerId === 'spiller-7')).toBe(true)
  })
})
