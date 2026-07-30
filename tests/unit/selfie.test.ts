import { describe, expect, it } from 'vitest'
import {
  MAX_SELFIE_BYTES,
  SelfieStore,
  validateSelfie,
} from '@/infra/store/selfieStore'

const NÅ = 1_700_000_000_000

/** Minimal, men gyldig filstart for hvert format vi godtar. */
function bilde(type: 'jpeg' | 'png' | 'webp', størrelse = 64): Buffer {
  const buffer = Buffer.alloc(størrelse)
  if (type === 'jpeg') buffer.set([0xff, 0xd8, 0xff, 0xe0], 0)
  if (type === 'png') buffer.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)
  if (type === 'webp') {
    buffer.write('RIFF', 0, 'ascii')
    buffer.write('WEBP', 8, 'ascii')
  }
  return buffer
}

describe('validering av opplastede bilder', () => {
  it('godtar de tre formatene vi støtter', () => {
    expect(validateSelfie(bilde('jpeg'), 'image/jpeg')).toBeNull()
    expect(validateSelfie(bilde('png'), 'image/png')).toBeNull()
    expect(validateSelfie(bilde('webp'), 'image/webp')).toBeNull()
  })

  it('avviser en filtype vi ikke har bedt om', () => {
    expect(validateSelfie(bilde('jpeg'), 'image/gif')?.code).toBe('selfie/type')
    expect(validateSelfie(bilde('jpeg'), 'application/pdf')?.code).toBe('selfie/type')
  })

  it('avviser noe som bare later som det er et bilde', () => {
    // Riktig content-type, men innholdet er en tekstfil.
    const juks = Buffer.from('<?php system($_GET[0]); ?>'.padEnd(64, ' '))
    expect(validateSelfie(juks, 'image/jpeg')?.code).toBe('selfie/notAnImage')
  })

  it('avviser et PNG-hode som utgir seg for å være JPEG', () => {
    expect(validateSelfie(bilde('png'), 'image/jpeg')?.code).toBe('selfie/notAnImage')
  })

  it('avviser tomme og altfor store filer', () => {
    expect(validateSelfie(Buffer.alloc(0), 'image/jpeg')?.code).toBe('selfie/empty')

    const svært = bilde('jpeg', MAX_SELFIE_BYTES + 1)
    expect(validateSelfie(svært, 'image/jpeg')?.code).toBe('selfie/tooBig')
  })

  it('godtar et bilde på nøyaktig grensen', () => {
    expect(validateSelfie(bilde('jpeg', MAX_SELFIE_BYTES), 'image/jpeg')).toBeNull()
  })
})

describe('midlertidig bildelagring', () => {
  it('gir tilbake bildet til den som spør fra riktig rom', () => {
    const store = new SelfieStore()
    const ref = store.put({
      roomId: 'rom-1',
      contentType: 'image/jpeg',
      bytes: bilde('jpeg'),
      now: NÅ,
    })

    expect(store.get(ref, 'rom-1')?.contentType).toBe('image/jpeg')
    // Referansen alene gir ikke tilgang på tvers av rom (§25).
    expect(store.get(ref, 'rom-2')).toBeUndefined()
    expect(store.get('en-gjettet-ref', 'rom-1')).toBeUndefined()
  })

  it('gir hvert bilde en lang, tilfeldig referanse', () => {
    const store = new SelfieStore()
    const referanser = new Set(
      Array.from({ length: 50 }, () =>
        store.put({
          roomId: 'rom-1',
          contentType: 'image/jpeg',
          bytes: bilde('jpeg'),
          now: NÅ,
        }),
      ),
    )
    expect(referanser.size).toBe(50)
    for (const ref of referanser) expect(ref.length).toBeGreaterThan(20)
  })

  it('sletter alle bildene i et rom, og bare dem', () => {
    const store = new SelfieStore()
    const mine = [1, 2, 3].map(() =>
      store.put({ roomId: 'rom-1', contentType: 'image/jpeg', bytes: bilde('jpeg'), now: NÅ }),
    )
    const andres = store.put({
      roomId: 'rom-2',
      contentType: 'image/jpeg',
      bytes: bilde('jpeg'),
      now: NÅ,
    })

    expect(store.removeRoom('rom-1')).toBe(3)
    for (const ref of mine) expect(store.get(ref, 'rom-1')).toBeUndefined()
    expect(store.get(andres, 'rom-2')).toBeDefined()
    expect(store.size).toBe(1)
  })

  it('sletter ett enkelt bilde', () => {
    const store = new SelfieStore()
    const ref = store.put({
      roomId: 'rom-1',
      contentType: 'image/png',
      bytes: bilde('png'),
      now: NÅ,
    })
    store.remove(ref)
    expect(store.get(ref, 'rom-1')).toBeUndefined()
    expect(store.size).toBe(0)
  })
})
