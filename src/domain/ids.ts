import { randomBytes, randomUUID } from 'node:crypto'

/**
 * Forvekslingsfritt alfabet: ingen I, O, 0 eller 1. Et barn skal kunne lese
 * romkoden fra en TV-skjerm og taste den riktig på første forsøk.
 */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 4

export function generateRoomCode(isTaken: (code: string) => boolean): string {
  // 32^4 = drøyt en million koder. Kollisjon er praktisk talt utenkelig med ett
  // rom om gangen, men vi sjekker uansett framfor å anta.
  for (let attempt = 0; attempt < 100; attempt++) {
    const bytes = randomBytes(CODE_LENGTH)
    let code = ''
    for (let i = 0; i < CODE_LENGTH; i++) {
      code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length]
    }
    if (!isTaken(code)) return code
  }
  throw new Error('Fant ingen ledig romkode')
}

export function normalizeRoomCode(input: string): string {
  return input.trim().toUpperCase().replace(/[^A-Z2-9]/g, '')
}

/** Hemmelig nøkkel. Havner aldri i en URL — kun i localStorage og socketmeldinger. */
export function generateSecret(): string {
  return randomBytes(32).toString('base64url')
}

export function generateId(prefix: string): string {
  return `${prefix}_${randomUUID()}`
}

/**
 * Sammenligning uten tidslekkasje. Nøklene er lange og tilfeldige, så dette er
 * beltet i tillegg til bukseselene — men det koster ingenting.
 */
export function secretsMatch(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
