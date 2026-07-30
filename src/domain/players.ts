import { err, ok, type Result } from './result'

/**
 * Spillerne skriver navnet sitt selv på telefonen. Rommet kjenner ingen navn på
 * forhånd — det finnes ingen liste å velge fra, bare et tekstfelt.
 *
 * Fritekst fra barn krever tre ting: en øvre lengde så navnet får plass på en
 * TV-skjerm, et tegnsett som ikke sprenger layouten, og en sperre mot to like
 * navn i samme rom. Alt tre håndheves her, ikke i grensesnittet.
 */

/** Så mange spillere er det plass til i ett rom (§1). */
export const MAX_PLAYERS = 6

export const MAX_NAME_LENGTH = 12

/**
 * Bokstaver, tall, mellomrom, bindestrek og apostrof. Emoji og kontrolltegn
 * holdes ute — ikke av prippenhet, men fordi de ødelegger linjehøyden på
 * hovedskjermen der navnet skal leses fra fire meters avstand.
 */
const LOVLIGE_TEGN = /^[\p{L}\p{N} '\-]+$/u

/** Farge og dyr deles ut etter tur, så to spillere aldri ser like ut. */
export const PALETTE = [
  { color: '#e0457b', avatarId: 'rev' },
  { color: '#2f7ed8', avatarId: 'ugle' },
  { color: '#f2a03d', avatarId: 'pinnsvin' },
  { color: '#3fa14a', avatarId: 'frosk' },
  { color: '#a06bff', avatarId: 'katt' },
  { color: '#2ec4b6', avatarId: 'skilpadde' },
] as const

export function paletteFor(index: number) {
  return PALETTE[index % PALETTE.length]
}

/** Fjerner overflødig luft, men rører ikke tegnene i navnet. */
export function normalizeName(input: string): string {
  return input.trim().replace(/\s+/g, ' ')
}

export function validateName(input: string): Result<string> {
  const name = normalizeName(input)

  if (name.length === 0) {
    return err('name/empty', 'Skriv navnet ditt først.')
  }
  if (name.length > MAX_NAME_LENGTH) {
    return err(
      'name/tooLong',
      `Navnet må være på ${MAX_NAME_LENGTH} tegn eller mindre.`,
    )
  }
  if (!LOVLIGE_TEGN.test(name)) {
    return err('name/badCharacters', 'Bruk bokstaver og tall i navnet.')
  }
  return ok(name)
}

/** To like navn i samme rom ville gjort premievisningen umulig å lese. */
export function sameName(a: string, b: string): boolean {
  return a.localeCompare(b, 'nb', { sensitivity: 'base' }) === 0
}
