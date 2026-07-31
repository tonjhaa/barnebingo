import { describe, expect, it } from 'vitest'
import { countNumbers } from '@/domain/formats/definition'
import { buildProfile, FORMATS, getFormat } from '@/domain/formats/registry'
import { validateProfile } from '@/domain/formats/validate'
import { DIFFICULTIES, FORMAT_IDS, type FormatId } from '@/domain/formats/types'

function profileFor(format: FormatId) {
  return buildProfile({ format, difficulty: 'normal' })
}

describe('regelprofiler', () => {
  it.each(FORMAT_IDS)('%s har en gyldig standardprofil', (format) => {
    const issues = validateProfile(profileFor(format))
    expect(issues.filter((i) => i.severity === 'error')).toEqual([])
  })

  it.each(FORMAT_IDS)('%s har ett tallområde per kolonne', (format) => {
    const { layout } = profileFor(format)
    expect(layout.columnRanges).toHaveLength(layout.cols)
  })

  it.each(FORMAT_IDS)('%s dekker hele tallområdet med kolonnene', (format) => {
    const profile = profileFor(format)
    const { columnRanges } = profile.layout
    expect(columnRanges[0].min).toBe(profile.numberRange.min)
    expect(columnRanges.at(-1)!.max).toBe(profile.numberRange.max)
    for (let i = 1; i < columnRanges.length; i++) {
      expect(columnRanges[i].min).toBe(columnRanges[i - 1].max + 1)
    }
  })

  it.each(FORMAT_IDS)('%s har plass til alle tallene på ett brett', (format) => {
    const profile = profileFor(format)
    const perColumn = profile.layout.columnRanges.map((r) => r.max - r.min + 1)
    // Ingen kolonne kan bli bedt om flere tall enn området rommer.
    for (const antall of perColumn) {
      expect(antall).toBeGreaterThanOrEqual(profile.layout.rows)
    }
  })
})

describe('75-tallsbingo', () => {
  const profile = buildProfile({ format: 'bingo75', difficulty: 'normal' })

  it('er 5 × 5 med B-I-N-G-O', () => {
    expect(profile.layout.rows).toBe(5)
    expect(profile.layout.cols).toBe(5)
    expect(profile.layout.columnLabels).toEqual(['B', 'I', 'N', 'G', 'O'])
  })

  it('har 24 tall med fri midtrute og 25 uten', () => {
    expect(countNumbers(profile.layout)).toBe(24)
    const uten = buildProfile({
      format: 'bingo75',
      difficulty: 'normal',
      freeCenter: false,
    })
    expect(countNumbers(uten.layout)).toBe(25)
  })

  it('har tre rader som eget stadium — brettet har fem', () => {
    const ids = getFormat('bingo75')
      .availableStages()
      .map((s) => s.id)
    expect(ids).toEqual(['row1', 'row2', 'row3', 'full'])
  })
})

describe('90-tallsbingo', () => {
  const profile = buildProfile({ format: 'bingo90', difficulty: 'normal' })

  it('er 3 × 9 med fem tall per rad', () => {
    expect(profile.layout.rows).toBe(3)
    expect(profile.layout.cols).toBe(9)
    expect(profile.layout.cellsPerRow).toBe(5)
    expect(profile.numbersPerBoard).toBe(15)
  })

  it('har ikke noe eget stadium for tre rader — det er fullt brett', () => {
    const ids = getFormat('bingo90')
      .availableStages()
      .map((s) => s.id)
    expect(ids).toEqual(['row1', 'row2', 'full'])
    expect(ids).not.toContain('row3')
  })

  it('avviser et påtvunget tre-rader-stadium', () => {
    const smuglet = {
      ...profile,
      prizeStages: [
        { id: 'row3', type: 'rows' as const, requiredRows: 3, label: 'Tre rader' },
      ],
    }
    const koder = validateProfile(smuglet).map((i) => i.code)
    expect(koder).toContain('stages/unavailable')
    expect(koder).toContain('stages/rowsEqualsFullBoard')
  })

  it('tillater ikke fri midtrute', () => {
    const med = buildProfile({
      format: 'bingo90',
      difficulty: 'normal',
      freeCenter: true,
    })
    expect(med.layout.freeCenter).toBe(false)
  })
})

describe('barnebingo', () => {
  const profile = buildProfile({ format: 'kids', difficulty: 'enkel' })

  it('er 4 × 4 med tallene 1-40', () => {
    expect(profile.layout.rows).toBe(4)
    expect(profile.layout.cols).toBe(4)
    expect(profile.numbersPerBoard).toBe(16)
    expect(profile.numberRange).toEqual({ min: 1, max: 40 })
  })

  it('har ingen fri rute', () => {
    expect(profile.layout.freeCenter).toBe(false)
  })

  it('dekker under halve tallområdet, så ikke alle får bingo samtidig', () => {
    expect(validateProfile(profile).map((i) => i.code)).not.toContain('range/tight')
  })
})

describe('vanskelighetsgrader og overstyring', () => {
  it('nybegynner markerer og roper bingo selv', () => {
    const profile = buildProfile({ format: 'kids', difficulty: 'nybegynner' })
    expect(profile.markingMode).toBe('auto')
    expect(profile.winMode).toBe('autoWin')
    expect(profile.boardsPerPlayer).toBe(1)
  })

  it('vanskelig gir tre brett og ingen hjelp på telefonen', () => {
    const profile = buildProfile({ format: 'bingo75', difficulty: 'vanskelig' })
    expect(profile.boardsPerPlayer).toBe(3)
    expect(profile.showCurrentNumberOnPhone).toBe(false)
    expect(profile.winMode).toBe('manual')
  })

  it('lar verten overstyre enkeltvalg i en forhåndsinnstilling', () => {
    const profile = buildProfile({
      format: 'bingo75',
      difficulty: 'nybegynner',
      boardsPerPlayer: 2,
      winMode: 'manual',
    })
    expect(profile.boardsPerPlayer).toBe(2)
    expect(profile.winMode).toBe('manual')
    // Resten arves fortsatt fra forhåndsinnstillingen.
    expect(profile.markingMode).toBe('auto')
  })

  it('velger bare stadier som finnes i formatet', () => {
    const profile = buildProfile({
      format: 'bingo90',
      difficulty: 'normal',
      enabledStageIds: ['row1', 'row3', 'full'],
    })
    expect(profile.prizeStages.map((s) => s.id)).toEqual(['row1', 'full'])
  })

  it('holder formatets rekkefølge uansett hvordan verten huker av', () => {
    const profile = buildProfile({
      format: 'bingo75',
      difficulty: 'normal',
      enabledStageIds: ['full', 'row1'],
    })
    expect(profile.prizeStages.map((s) => s.id)).toEqual(['row1', 'full'])
  })

  it('gir tom stadieliste når verten slår av alt, ikke alle stadiene tilbake', () => {
    const profile = buildProfile({
      format: 'bingo75',
      difficulty: 'normal',
      enabledStageIds: [],
    })
    expect(profile.prizeStages).toEqual([])
    expect(validateProfile(profile).map((i) => i.code)).toContain('stages/empty')
  })

  it('mister stadier som ikke finnes når verten bytter format', () => {
    const stages = ['row1', 'row2', 'row3', 'full']
    const i75 = buildProfile({
      format: 'bingo75',
      difficulty: 'normal',
      enabledStageIds: stages,
    })
    const i90 = buildProfile({
      format: 'bingo90',
      difficulty: 'normal',
      enabledStageIds: stages,
    })
    expect(i75.prizeStages.map((s) => s.id)).toEqual(['row1', 'row2', 'row3', 'full'])
    expect(i90.prizeStages.map((s) => s.id)).toEqual(['row1', 'row2', 'full'])
    expect(validateProfile(i90).filter((i) => i.severity === 'error')).toEqual([])
  })

  it('har opplesning påslått i alle vanskelighetsgrader', () => {
    // Programlederen er ikke lenger en stemme som roper tall, men rammen rundt
    // spillet — og for et barn som ennå leser tall langsomt er opplesningen
    // forskjellen på å henge med og å gi opp. Verten kan slå den av.
    for (const difficulty of DIFFICULTIES) {
      expect(buildProfile({ format: 'kids', difficulty }).speech).toBe(true)
    }
  })

  it('lar verten slå opplesningen av', () => {
    expect(buildProfile({ format: 'kids', difficulty: 'enkel', speech: false }).speech).toBe(
      false,
    )
  })

  it('lar verten slå opplesningen på når hen vil ha den', () => {
    const profile = buildProfile({ format: 'kids', difficulty: 'enkel', speech: true })
    expect(profile.speech).toBe(true)
  })

  it('holder feilmarkering avslått uansett hva som kommer inn', () => {
    for (const format of FORMAT_IDS) {
      expect(profileFor(format).allowInvalidMarks).toBe(false)
    }
  })
})

describe('validering av ugyldige kombinasjoner', () => {
  const base = buildProfile({ format: 'bingo75', difficulty: 'normal' })

  it('avviser flere brett enn formatet støtter', () => {
    const koder = validateProfile({ ...base, boardsPerPlayer: 4 as never }).map(
      (i) => i.code,
    )
    expect(koder).toContain('boards/tooMany')
  })

  it('avviser tom stadieliste', () => {
    const koder = validateProfile({ ...base, prizeStages: [] }).map((i) => i.code)
    expect(koder).toContain('stages/empty')
  })

  it('avviser stadier som blir lettere utover i runden', () => {
    const stages = getFormat('bingo75').availableStages()
    const koder = validateProfile({
      ...base,
      prizeStages: [stages[2], stages[0]],
    }).map((i) => i.code)
    expect(koder).toContain('stages/notEscalating')
  })

  it('avviser feilmarkering sammen med automatisk markering', () => {
    const koder = validateProfile({
      ...base,
      allowInvalidMarks: true,
      markingMode: 'auto',
    }).map((i) => i.code)
    expect(koder).toContain('marking/invalidWithAssist')
  })

  it('avviser automatisk trekking raskere enn tre sekunder', () => {
    const koder = validateProfile({
      ...base,
      drawMode: 'auto',
      drawIntervalMs: 1000,
    }).map((i) => i.code)
    expect(koder).toContain('draw/tooFast')
  })

  it('advarer når brettet dekker over halve tallområdet', () => {
    const trangt = {
      ...base,
      numberRange: { min: 1, max: 30 },
      numbersPerBoard: 24,
    }
    expect(validateProfile(trangt).map((i) => i.code)).toContain('range/tight')
  })

  it('kjenner alle registrerte formater', () => {
    expect(Object.keys(FORMATS).sort()).toEqual([...FORMAT_IDS].sort())
  })
})
