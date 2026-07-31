import { describe, expect, it } from 'vitest'
import type { GameEventData } from '@/domain/audio/events'
import {
  LÆRINGSMODUS,
  STANDARD_LYD,
  taleFra,
  TEMPO_PAUSE_MS,
} from '@/domain/audio/settings'
import { SpeechDirector } from '@/domain/audio/speech'
import { StoryDirector } from '@/domain/audio/story'
import { seededRng } from '@/domain/rng'

function trekk(value = 42): GameEventData {
  return { kind: 'numberDrawn', value, letter: null, drawnCount: 10, remaining: 80 }
}

describe('vertens lydinnstillinger', () => {
  it('har lyd på som standard', () => {
    expect(STANDARD_LYD.på).toBe(true)
    expect(STANDARD_LYD.programleder).toBe('fulltGameshow')
  })

  it('holder musikken lavt som standard', () => {
    // Hovedskjermen står i samme rom som spillerne. Musikk skal ligge under,
    // ikke konkurrere med stemmen.
    expect(STANDARD_LYD.musikk).toBe('lav')
    expect(STANDARD_LYD.effekter).toBe('normal')
  })

  it('lar alt skrus av', () => {
    const stille = {
      ...STANDARD_LYD,
      på: false,
      programleder: 'av' as const,
      historier: 'av' as const,
      musikk: 'av' as const,
      effekter: 'av' as const,
    }
    const tale = new SpeechDirector(taleFra(stille), seededRng(1))
    expect(tale.taleFor(trekk())).toBeNull()
  })

  it('gir læringsmodus alt som hjelper og ingenting som forstyrrer', () => {
    expect(LÆRINGSMODUS.nivå).toBe('rolig')
    expect(LÆRINGSMODUS.historier).toBe('av')
    expect(LÆRINGSMODUS.musikk).toBe('av')
    expect(LÆRINGSMODUS.gjentaTallet).toBe(true)
    expect(LÆRINGSMODUS.tempo).toBe('rolig')
  })

  it('leser tallet tydelig og uten pynt i læringsmodus', () => {
    const tale = new SpeechDirector(taleFra(LÆRINGSMODUS), seededRng(1))
    const ider = tale.taleFor(trekk(34))!.deler.map((d) => d.id)
    expect(ider).toEqual(['tall-34', 'siffer-3', 'siffer-4', 'tall-34'])
  })

  it('lar ingen historier komme i læringsmodus', () => {
    const historier = new StoryDirector(seededRng(1))
    for (let i = 0; i < 100; i++) {
      expect(
        historier.innslagEtter(trekk(), {
          frekvens: LÆRINGSMODUS.historier,
          fase: 'midt',
          spent: false,
        }),
      ).toBeNull()
    }
  })

  it('plukker ut bare taledelen til SpeechDirector', () => {
    const tale = taleFra(STANDARD_LYD)
    expect(tale).toEqual({
      modus: STANDARD_LYD.programleder,
      nivå: STANDARD_LYD.nivå,
      tallopplesning: STANDARD_LYD.tallopplesning,
      bokstav: STANDARD_LYD.bokstav,
      gjentaTallet: STANDARD_LYD.gjentaTallet,
      lesNavn: STANDARD_LYD.lesNavn,
    })
    // Musikk og effekter angår ikke hva som sies.
    expect(Object.keys(tale)).not.toContain('musikk')
  })

  it('gir rolig tempo lengst pause og raskt ingen', () => {
    expect(TEMPO_PAUSE_MS.rolig).toBeGreaterThan(TEMPO_PAUSE_MS.normalt)
    expect(TEMPO_PAUSE_MS.normalt).toBeGreaterThan(TEMPO_PAUSE_MS.raskt)
    expect(TEMPO_PAUSE_MS.raskt).toBe(0)
  })
})
