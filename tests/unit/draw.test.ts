import { describe, expect, it } from 'vitest'
import { announce, columnLabelFor, createDrawOrder } from '@/domain/engine/draw'
import { buildProfile } from '@/domain/formats/registry'
import { FORMAT_IDS, type FormatId } from '@/domain/formats/types'
import { seededRng } from '@/domain/rng'
import {
  currentStage,
  drawNext,
  drawnNumbers,
  pauseRound,
  remainingDraws,
  resumeRound,
  startRound,
} from '@/domain/round'

const NOW = 1_700_000_000_000

function round(format: FormatId = 'bingo75', seed = 5) {
  return startRound({
    profile: buildProfile({ format, difficulty: 'normal' }),
    seed,
    now: NOW,
  })
}

describe('trekkrekkefølge', () => {
  it.each(FORMAT_IDS)('%s dekker hele tallområdet nøyaktig én gang', (format) => {
    const profile = buildProfile({ format, difficulty: 'normal' })
    const order = createDrawOrder(profile, seededRng(1))
    const forventet = profile.numberRange.max - profile.numberRange.min + 1

    expect(order).toHaveLength(forventet)
    expect(new Set(order).size).toBe(forventet)
    expect(Math.min(...order)).toBe(profile.numberRange.min)
    expect(Math.max(...order)).toBe(profile.numberRange.max)
  })

  it('gir samme rekkefølge for samme seed', () => {
    const profile = buildProfile({ format: 'bingo90', difficulty: 'normal' })
    expect(createDrawOrder(profile, seededRng(77))).toEqual(
      createDrawOrder(profile, seededRng(77)),
    )
  })
})

describe('trekking', () => {
  it('trekker aldri det samme tallet to ganger', () => {
    const r = round()
    const trukket: number[] = []
    while (remainingDraws(r) > 0) {
      const result = drawNext(r, NOW)
      if (result.ok) trukket.push(result.value)
    }
    expect(trukket).toHaveLength(75)
    expect(new Set(trukket).size).toBe(75)
  })

  it('teller opp og husker det siste tallet', () => {
    const r = round()
    const first = drawNext(r, NOW)
    expect(first.ok).toBe(true)
    if (first.ok) expect(r.currentNumber).toBe(first.value)
    expect(r.drawnCount).toBe(1)
    expect(drawnNumbers(r)).toEqual([r.currentNumber])
    expect(r.lastDrawAt).toBe(NOW)
  })

  it('lever videre etter siste tall, så en bingo på det rekker fram', () => {
    const r = round()
    for (let i = 0; i < 75; i++) drawNext(r, NOW)

    // Det siste tallet kan være akkurat det som fullfører noens brett, så
    // runden avsluttes ikke av selve trekket.
    expect(r.status).toBe('active')
    expect(remainingDraws(r)).toBe(0)
  })

  it('avslutter runden når det trekkes fra en tom kule', () => {
    const r = round()
    for (let i = 0; i < 75; i++) drawNext(r, NOW)

    const tomt = drawNext(r, NOW + 1000)
    expect(tomt.ok).toBe(false)
    if (!tomt.ok) expect(tomt.code).toBe('draw/exhausted')
    expect(r.status).toBe('finished')
    expect(r.endedAt).toBe(NOW + 1000)
  })

  it('trekker ikke mens spillet står på pause', () => {
    const r = round()
    drawNext(r, NOW)
    expect(pauseRound(r).ok).toBe(true)

    const forsøk = drawNext(r, NOW)
    expect(forsøk.ok).toBe(false)
    if (!forsøk.ok) expect(forsøk.code).toBe('draw/notActive')
    expect(r.drawnCount).toBe(1)

    expect(resumeRound(r).ok).toBe(true)
    expect(drawNext(r, NOW).ok).toBe(true)
    expect(r.drawnCount).toBe(2)
  })

  it('trekker ikke mens en bingo kontrolleres', () => {
    const r = round()
    r.status = 'validatingBingo'
    const forsøk = drawNext(r, NOW)
    expect(forsøk.ok).toBe(false)
    if (!forsøk.ok) expect(forsøk.message).toContain('kontrollerer')
  })

  it('kan ikke pauses to ganger eller fortsettes uten pause', () => {
    const r = round()
    expect(pauseRound(r).ok).toBe(true)
    expect(pauseRound(r).ok).toBe(false)
    expect(resumeRound(r).ok).toBe(true)
    expect(resumeRound(r).ok).toBe(false)
  })

  it('spiller om det første premiestadiet fra start', () => {
    const r = round()
    expect(currentStage(r)?.label).toBe('Én rad')
    expect(r.currentStageIndex).toBe(0)
  })
})

describe('opplesning av tall', () => {
  const bingo75 = buildProfile({ format: 'bingo75', difficulty: 'normal' })
  const bingo90 = buildProfile({ format: 'bingo90', difficulty: 'normal' })
  const kids = buildProfile({ format: 'kids', difficulty: 'enkel' })

  it('finner riktig bokstav i 75-formatet', () => {
    expect(columnLabelFor(bingo75, 1)).toBe('B')
    expect(columnLabelFor(bingo75, 15)).toBe('B')
    expect(columnLabelFor(bingo75, 16)).toBe('I')
    expect(columnLabelFor(bingo75, 45)).toBe('N')
    expect(columnLabelFor(bingo75, 46)).toBe('G')
    expect(columnLabelFor(bingo75, 75)).toBe('O')
  })

  it('sier «B 12» i 75 og «Nummer 68» i 90', () => {
    expect(announce(bingo75, 12)).toBe('B 12')
    expect(announce(bingo90, 68)).toBe('Nummer 68')
    expect(announce(kids, 7)).toBe('Nummer 7')
  })
})
