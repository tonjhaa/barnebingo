import { describe, expect, it } from 'vitest'
import {
  MAX_NAME_LENGTH,
  MAX_PLAYERS,
  PALETTE,
  normalizeName,
  paletteFor,
  sameName,
  validateName,
} from '@/domain/players'

describe('navn spilleren skriver selv', () => {
  it('godtar vanlige norske navn', () => {
    for (const navn of ['Ada', 'Åse', 'Bjørn-Ove', "O'Brien", 'Lea 2']) {
      const result = validateName(navn)
      expect(result.ok, navn).toBe(true)
      if (result.ok) expect(result.value).toBe(navn)
    }
  })

  it('rydder bort overflødig luft', () => {
    expect(normalizeName('  Ada  ')).toBe('Ada')
    expect(normalizeName('Anne   Lise')).toBe('Anne Lise')
  })

  it('avviser tomt navn', () => {
    const result = validateName('   ')
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('name/empty')
  })

  it('avviser navn som ikke får plass på skjermen', () => {
    const result = validateName('a'.repeat(MAX_NAME_LENGTH + 1))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('name/tooLong')

    expect(validateName('a'.repeat(MAX_NAME_LENGTH)).ok).toBe(true)
  })

  it('avviser tegn som ødelegger layouten', () => {
    // Ikke av prippenhet — emoji sprenger linjehøyden der navnet skal leses
    // fra fire meters avstand, og tegnsett-rot hører ikke hjemme i et navn.
    for (const rart of ['🎉', '<script>', 'Ola&Kari', 'a/b']) {
      const result = validateName(rart)
      expect(result.ok, rart).toBe(false)
    }
  })

  it('gjør linjeskift om til mellomrom framfor å avvise navnet', () => {
    // Et innlimt navn med linjeskift er ikke et angrep, bare rot. Vi rydder.
    const result = validateName('Anne\nLise')
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toBe('Anne Lise')
  })
})

describe('to like navn', () => {
  it('regnes som like uansett store bokstaver', () => {
    expect(sameName('Ada', 'ada')).toBe(true)
    expect(sameName('ÅSE', 'åse')).toBe(true)
  })

  it('skiller navn som faktisk er ulike', () => {
    expect(sameName('Ada', 'Adas')).toBe(false)
    expect(sameName('Ola', 'Kari')).toBe(false)
  })
})

describe('farger og dyr', () => {
  it('gir de første spillerne hver sin', () => {
    const brukt = Array.from({ length: PALETTE.length }, (_, i) => paletteFor(i))
    expect(new Set(brukt.map((s) => s.color)).size).toBe(PALETTE.length)
    expect(new Set(brukt.map((s) => s.avatarId)).size).toBe(PALETTE.length)
  })

  it('har nok til alle som får plass i et rom', () => {
    expect(PALETTE.length).toBeGreaterThanOrEqual(MAX_PLAYERS)
  })

  it('går rundt hvis den skulle gå tom', () => {
    expect(paletteFor(PALETTE.length)).toEqual(paletteFor(0))
  })
})
