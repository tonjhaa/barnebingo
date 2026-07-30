import { describe, expect, it } from 'vitest'
import { computeProgress, type Board, type Cell } from '@/domain/board/board'
import { findWinningBoard, hasBingo, satisfiesStage } from '@/domain/engine/bingo'
import { applyMark, applyUnmark, autoMark } from '@/domain/engine/marking'
import { selectWinners, type BingoClaim } from '@/domain/engine/prize'
import { buildProfile } from '@/domain/formats/registry'
import type { PrizeStageDef, RuleProfile } from '@/domain/formats/types'

/** Brett av tall der 0 betyr fri rute og null betyr tom rute. */
function board(rader: Array<Array<number | null>>, id = 'b1'): Board {
  const cells: Cell[][] = rader.map((rad) =>
    rad.map((v) => ({ value: v === 0 ? null : v, isFree: v === 0 })),
  )
  return { id, playerId: 'p1', cells, marks: new Set() }
}

const RAD1: PrizeStageDef = { id: 'row1', type: 'rows', requiredRows: 1, label: 'Én rad' }
const RAD2: PrizeStageDef = { id: 'row2', type: 'rows', requiredRows: 2, label: 'To rader' }
const FULLT: PrizeStageDef = {
  id: 'full',
  type: 'fullHouse',
  requiredRows: 3,
  label: 'Fullt brett',
}

const profil = (over: Partial<RuleProfile> = {}): RuleProfile => ({
  ...buildProfile({ format: 'kids', difficulty: 'enkel' }),
  ...over,
})

describe('premiekrav', () => {
  const b = board([
    [1, 2],
    [3, 4],
    [5, 6],
  ])

  it('godtar én rad når én rad er full', () => {
    b.marks = new Set([1, 2])
    const progress = computeProgress(b, new Set([1, 2]))
    expect(satisfiesStage(progress, RAD1)).toBe(true)
    expect(satisfiesStage(progress, RAD2)).toBe(false)
    expect(satisfiesStage(progress, FULLT)).toBe(false)
  })

  it('krever hele brettet for fullt brett', () => {
    b.marks = new Set([1, 2, 3, 4])
    expect(satisfiesStage(computeProgress(b, b.marks), FULLT)).toBe(false)

    b.marks = new Set([1, 2, 3, 4, 5, 6])
    expect(satisfiesStage(computeProgress(b, b.marks), FULLT)).toBe(true)
  })
})

describe('BINGO-validatoren', () => {
  it('finner det vinnende brettet', () => {
    const a = board(
      [
        [1, 2],
        [3, 4],
      ],
      'a',
    )
    const b = board(
      [
        [5, 6],
        [7, 8],
      ],
      'b',
    )
    b.marks = new Set([5, 6])

    const vinner = findWinningBoard([a, b], new Set([5, 6]), RAD1)
    expect(vinner?.boardId).toBe('b')
    expect(vinner?.completedRows).toEqual([0])
  })

  it('teller aldri rader på tvers av brett', () => {
    const a = board(
      [
        [1, 2],
        [3, 4],
      ],
      'a',
    )
    const b = board(
      [
        [5, 6],
        [7, 8],
      ],
      'b',
    )
    a.marks = new Set([1, 2])
    b.marks = new Set([5, 6])
    const drawn = new Set([1, 2, 5, 6])

    // Én rad på hvert brett er ikke to rader (§10).
    expect(findWinningBoard([a, b], drawn, RAD1)).not.toBeNull()
    expect(findWinningBoard([a, b], drawn, RAD2)).toBeNull()
  })

  it('velger brettet som har kommet lengst', () => {
    const a = board(
      [
        [1, 2],
        [3, 4],
        [9, 10],
      ],
      'a',
    )
    const b = board(
      [
        [5, 6],
        [7, 8],
        [11, 12],
      ],
      'b',
    )
    a.marks = new Set([1, 2])
    b.marks = new Set([5, 6, 7, 8])
    const drawn = new Set([1, 2, 5, 6, 7, 8])

    expect(findWinningBoard([a, b], drawn, RAD1)?.boardId).toBe('b')
  })

  it('ser bort fra markeringer av tall som ikke er trukket', () => {
    const b = board([
      [1, 2],
      [3, 4],
    ])
    b.marks = new Set([1, 2])
    expect(findWinningBoard([b], new Set([1]), RAD1)).toBeNull()
    expect(findWinningBoard([b], new Set([1, 2]), RAD1)).not.toBeNull()
  })

  it('regner fri rute som markert', () => {
    const b = board([
      [1, 0, 3],
      [4, 5, 6],
    ])
    b.marks = new Set([1, 3])
    expect(hasBingo([b], new Set([1, 3]), RAD1)).toBe(true)
  })

  it('sier nei når ingen brett oppfyller kravet', () => {
    const b = board([
      [1, 2],
      [3, 4],
    ])
    expect(hasBingo([b], new Set([1]), RAD1)).toBe(false)
  })
})

describe('markering', () => {
  const p = profil()

  it('godtar et trukket tall som står på brettet', () => {
    const b = board([
      [1, 2],
      [3, 4],
    ])
    const result = applyMark(b, 2, new Set([1, 2]), p)
    expect(result.ok).toBe(true)
    expect(b.marks.has(2)).toBe(true)
  })

  it('avviser et tall som ikke er trukket', () => {
    const b = board([
      [1, 2],
      [3, 4],
    ])
    const result = applyMark(b, 4, new Set([1, 2]), p)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('mark/notDrawn')
    expect(b.marks.size).toBe(0)
  })

  it('avviser et tall som ikke står på brettet', () => {
    const b = board([
      [1, 2],
      [3, 4],
    ])
    const result = applyMark(b, 99, new Set([99]), p)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('mark/notOnBoard')
  })

  it('lar spilleren angre en markering', () => {
    const b = board([
      [1, 2],
      [3, 4],
    ])
    applyMark(b, 1, new Set([1]), p)
    expect(applyUnmark(b, 1, p).ok).toBe(true)
    expect(b.marks.has(1)).toBe(false)
  })

  it('lar ingen angre når appen markerer selv', () => {
    const b = board([
      [1, 2],
      [3, 4],
    ])
    b.marks = new Set([1])
    const result = applyUnmark(b, 1, profil({ markingMode: 'auto' }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('mark/automatic')
    expect(b.marks.has(1)).toBe(true)
  })

  it('markerer automatisk på alle brett som har tallet', () => {
    const a = board([[1, 2]], 'a')
    const b = board([[2, 3]], 'b')
    const c = board([[4, 5]], 'c')

    expect(autoMark([a, b, c], 2)).toBe(2)
    expect(a.marks.has(2)).toBe(true)
    expect(b.marks.has(2)).toBe(true)
    expect(c.marks.size).toBe(0)
  })
})

describe('valg av vinnere', () => {
  const claim = (playerId: string, claimedAt: number): BingoClaim => ({
    playerId,
    boardId: `${playerId}-brett`,
    completedRows: [0],
    atDrawIndex: 10,
    claimedAt,
  })

  it('lar alle i vinduet vinne når flere vinnere er tillatt', () => {
    const valg = selectWinners(
      [claim('a', 100), claim('b', 150)],
      profil({ allowMultipleWinnersPerStage: true }),
      () => false,
    )
    expect(valg.winners.map((w) => w.playerId)).toEqual(['a', 'b'])
    expect(valg.alsoHadBingo).toEqual([])
  })

  it('lar bare den første vinne når verten har valgt det', () => {
    const valg = selectWinners(
      [claim('b', 150), claim('a', 100)],
      profil({ allowMultipleWinnersPerStage: false }),
      () => false,
    )
    expect(valg.winners.map((w) => w.playerId)).toEqual(['a'])
    // De andre skal få «du hadde også bingo», ikke «ugyldig».
    expect(valg.alsoHadBingo.map((w) => w.playerId)).toEqual(['b'])
  })

  it('holder tidligere vinnere utenfor når sperren er på', () => {
    const valg = selectWinners(
      [claim('a', 100), claim('b', 150)],
      profil({ allowRepeatWinners: false }),
      (playerId) => playerId === 'a',
    )
    expect(valg.winners.map((w) => w.playerId)).toEqual(['b'])
    expect(valg.lockoutIgnored).toBe(false)
  })

  it('opphever sperren når ingen andre kan vinne', () => {
    // Alle som har bingo har vunnet før. Uten opphevelse ville stadiet
    // aldri kunne fullføres (ARKITEKTUR.md §9 K6).
    const valg = selectWinners(
      [claim('a', 100), claim('b', 150)],
      profil({ allowRepeatWinners: false, allowMultipleWinnersPerStage: true }),
      () => true,
    )
    expect(valg.winners.map((w) => w.playerId)).toEqual(['a', 'b'])
    expect(valg.lockoutIgnored).toBe(true)
  })

  it('gir ingen vinnere uten krav', () => {
    const valg = selectWinners([], profil(), () => false)
    expect(valg.winners).toEqual([])
    expect(valg.lockoutIgnored).toBe(false)
  })

  it('avgjør rekkefølgen på tidspunkt, ikke på hvem som kom inn i lista først', () => {
    const valg = selectWinners(
      [claim('sen', 900), claim('tidlig', 100), claim('midt', 400)],
      profil({ allowMultipleWinnersPerStage: false }),
      () => false,
    )
    expect(valg.winners[0].playerId).toBe('tidlig')
  })
})
