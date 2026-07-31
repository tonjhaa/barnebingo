import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  ASSETS,
  ASSETTYPER,
  fraTredjepart,
  måKrediteres,
  validerAssets,
  type Asset,
} from '@/content/assets'
import { EFFEKTER } from '@/ui/audio/musikk'

/**
 * Assetregisteret (§18).
 *
 * Poenget med disse testene er å gjøre lisensspørsmål til noe som feiler ved
 * bygging framfor noe man oppdager den dagen noen spør. En fil uten skaper
 * eller med en lisens ingen har tatt stilling til, skal ikke kunne snike seg
 * inn.
 */
const ROT = process.cwd()

describe('registeret', () => {
  it('har ingen feil', () => {
    expect(validerAssets().map((f) => `${f.id}: ${f.melding}`)).toEqual([])
  })

  it('gir hver ressurs en kjent type', () => {
    for (const asset of ASSETS) {
      expect(ASSETTYPER, asset.id).toContain(asset.type)
    }
  })

  it('avviser en ressurs med uklar lisens', () => {
    const uklar: Asset = {
      ...ASSETS[0],
      id: 'test-uklar',
      lisens: 'ukjent, fant den på nettet',
    }
    const feil = validerAssets([uklar])
    expect(feil.some((f) => f.melding.includes('ikke godkjent'))).toBe(true)
  })

  it('avviser en ressurs uten skaper', () => {
    const uten: Asset = { ...ASSETS[0], id: 'test-uten', skaper: '' }
    expect(validerAssets([uten]).some((f) => f.melding.includes('skaper'))).toBe(true)
  })

  it('avviser en hentet ressurs uten gyldig adresse', () => {
    const rar: Asset = { ...ASSETS[0], id: 'test-rar', url: 'et sted' }
    expect(validerAssets([rar]).some((f) => f.melding.includes('adresse'))).toBe(true)
  })

  it('krever dato på formen ÅÅÅÅ-MM-DD', () => {
    const feil: Asset = { ...ASSETS[0], id: 'test-dato', hentet: 'i fjor' }
    expect(validerAssets([feil]).some((f) => f.melding.includes('ÅÅÅÅ-MM-DD'))).toBe(true)
  })

  it('lar hver ressurs brukes kommersielt, eller sier hvorfor ikke', () => {
    for (const asset of ASSETS) {
      if (!asset.kommersielt) expect(asset.begrensninger, asset.id).toBeTruthy()
    }
  })
})

describe('hva som faktisk ligger i repoet', () => {
  it('har en fil for hver lydeffekt koden kan spille', () => {
    for (const effekt of EFFEKTER) {
      expect(existsSync(join(ROT, 'public', 'lyd', 'effekt', `${effekt}.wav`)), effekt).toBe(
        true,
      )
    }
  })

  it('har musikksporet MusicManager peker på', () => {
    expect(existsSync(join(ROT, 'public', 'lyd', 'musikk', 'bakgrunn.wav'))).toBe(true)
  })

  it('har registrert effektene og musikken', () => {
    const ider = ASSETS.map((a) => a.id)
    expect(ider).toContain('effekter')
    expect(ider).toContain('musikk-bakgrunn')
  })

  it('laster ingenting fra tredjepart under spilling', () => {
    // §17: alt serveres lokalt. Registeret er der man ser om noe er hentet
    // utenfra, og i så fall at det ble hentet én gang, under utvikling.
    for (const asset of fraTredjepart()) {
      expect(asset.fil.startsWith('public/') || asset.type === 'skrift', asset.id).toBe(true)
    }
  })

  it('krediterer alt som krever det', () => {
    for (const asset of måKrediteres()) {
      expect(asset.kreverKreditering?.trim(), asset.id).toBeTruthy()
    }
  })
})
