import { describe, expect, it } from 'vitest'
import { boardNumbers, computeProgress, type Board, type Cell } from '@/domain/board/board'

/** Bygger et brett av tall der null betyr tom rute og 0 betyr fri rute. */
function board(rader: number[][]): Board {
  const cells: Cell[][] = rader.map((rad) =>
    rad.map((v) => ({ value: v === 0 ? null : v, isFree: v === 0 })),
  )
  return { id: 'b1', playerId: 'p1', cells, marks: new Set() }
}

/** Brett med tomme ruter, slik 90-formatet har dem. */
function tomtBrett(rader: Array<Array<number | null>>): Board {
  const cells: Cell[][] = rader.map((rad) =>
    rad.map((v) => ({ value: v, isFree: false })),
  )
  return { id: 'b1', playerId: 'p1', cells, marks: new Set() }
}

describe('brettets tall', () => {
  it('leser tallene i lesrekkefølge og hopper over tomme ruter', () => {
    const b = tomtBrett([
      [1, null, 20, null, 35],
      [null, 12, null, 44, null],
    ])
    expect(boardNumbers(b)).toEqual([1, 20, 35, 12, 44])
  })
})

describe('radberegning', () => {
  it('teller en rad som full først når alle tallene er trukket og markert', () => {
    const b = board([
      [1, 2, 3],
      [4, 5, 6],
    ])
    b.marks = new Set([1, 2])
    expect(computeProgress(b, new Set([1, 2])).completedRows).toEqual([])

    b.marks = new Set([1, 2, 3])
    expect(computeProgress(b, new Set([1, 2, 3])).completedRows).toEqual([0])
  })

  it('ser bort fra markeringer av tall som ikke er trukket', () => {
    const b = board([
      [1, 2, 3],
      [4, 5, 6],
    ])
    // Spilleren har markert hele raden, men 3 er aldri trukket.
    b.marks = new Set([1, 2, 3])
    const progress = computeProgress(b, new Set([1, 2]))
    expect(progress.completedRows).toEqual([])
    expect(progress.markedCount).toBe(2)
  })

  it('regner fri rute som markert', () => {
    const b = board([
      [1, 0, 3],
      [4, 5, 6],
    ])
    b.marks = new Set([1, 3])
    expect(computeProgress(b, new Set([1, 3])).completedRows).toEqual([0])
  })

  it('regner tomme ruter som passert, slik 90-formatet krever', () => {
    const b = tomtBrett([
      [1, null, 20, null, 35],
      [null, 12, null, 44, null],
    ])
    b.marks = new Set([1, 20, 35])
    expect(computeProgress(b, new Set([1, 20, 35])).completedRows).toEqual([0])
  })

  it('finner flere fulle rader', () => {
    const b = board([
      [1, 2],
      [3, 4],
      [5, 6],
    ])
    b.marks = new Set([1, 2, 5, 6])
    expect(computeProgress(b, new Set([1, 2, 5, 6])).completedRows).toEqual([0, 2])
  })
})

describe('fullt brett', () => {
  it('krever alle rader', () => {
    const b = board([
      [1, 2],
      [3, 4],
    ])
    b.marks = new Set([1, 2, 3])
    expect(computeProgress(b, new Set([1, 2, 3])).isFull).toBe(false)

    b.marks = new Set([1, 2, 3, 4])
    expect(computeProgress(b, new Set([1, 2, 3, 4])).isFull).toBe(true)
  })

  it('teller fri rute med i fullt brett', () => {
    const b = board([
      [1, 2],
      [0, 4],
    ])
    b.marks = new Set([1, 2, 4])
    const progress = computeProgress(b, new Set([1, 2, 4]))
    expect(progress.isFull).toBe(true)
    expect(progress.numberCount).toBe(3)
  })
})
