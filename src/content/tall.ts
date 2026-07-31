import type { Klipp } from './typer'

/**
 * Tallene, skrevet ut.
 *
 * En stemmesyntese som får «21» gjetter — noen ganger «tjueen», noen ganger
 * «to en», og på engelsk hvis den er uheldig. Derfor står hvert tall skrevet
 * med bokstaver her, og genereringsskriptet sender aldri et siffer til
 * leverandøren.
 *
 * «Én» og «en» er to forskjellige klipp med vilje: tallet én uttales med trykk
 * («Én … nummer én»), mens sifferet i «tjueen … to en» er trykklett. Å bruke
 * samme opptak begge steder høres feil ut for et norsk øre.
 */

const ENERE = [
  '',
  'én',
  'to',
  'tre',
  'fire',
  'fem',
  'seks',
  'sju',
  'åtte',
  'ni',
  'ti',
  'elleve',
  'tolv',
  'tretten',
  'fjorten',
  'femten',
  'seksten',
  'sytten',
  'atten',
  'nitten',
] as const

const TIERE = [
  '',
  '',
  'tjue',
  'tretti',
  'førti',
  'femti',
  'seksti',
  'sytti',
  'åtti',
  'nitti',
] as const

/** Sifrene lest hver for seg. «Null» finnes bare her. */
const SIFRE = [
  'null',
  'en',
  'to',
  'tre',
  'fire',
  'fem',
  'seks',
  'sju',
  'åtte',
  'ni',
] as const

/** Tallet skrevet ut: 21 → «tjueen», 70 → «sytti». */
export function tallOrd(n: number): string {
  if (n < 20) return ENERE[n]
  const tier = Math.floor(n / 10)
  const ener = n % 10
  // Sammensatte tall skrives i ett ord og bruker den trykklette formen: «tjueen».
  return ener === 0 ? TIERE[tier] : `${TIERE[tier]}${SIFRE[ener]}`
}

/** Sifferet lest for seg: 0 → «null», 1 → «en». */
export function sifferOrd(d: number): string {
  return SIFRE[d]
}

export const MAKS_TALL = 90

export function klippForTall(n: number): string {
  return `tall-${n}`
}

export function klippForSiffer(d: number): string {
  return `siffer-${d}`
}

/** «Nummer sju» som ett klipp, så det ikke blir hakkete å gjenta tallet. */
export function klippForNummer(n: number): string {
  return `nummer-${n}`
}

export function klippForBokstav(bokstav: string): string {
  return `bokstav-${bokstav.toLowerCase()}`
}

/** Sifrene i et tosifret tall, i den rekkefølgen de leses. */
export function sifreneI(n: number): number[] {
  return String(n)
    .split('')
    .map((tegn) => Number(tegn))
}

export const BOKSTAVER = ['B', 'I', 'N', 'G', 'O'] as const

export const TALLKLIPP: Klipp[] = [
  // Hele tall, 1–90. Dekker alle tre formatene.
  ...Array.from({ length: MAKS_TALL }, (_, i) => ({
    id: klippForTall(i + 1),
    tekst: storBokstav(tallOrd(i + 1)),
  })),
  // Sifrene, til «tjueen … to en».
  ...SIFRE.map((ord, d) => ({ id: klippForSiffer(d), tekst: ord })),
  // «Nummer sju» for de ensifrede tallene, som er de eneste som gjentas slik.
  ...Array.from({ length: 9 }, (_, i) => ({
    id: klippForNummer(i + 1),
    tekst: `nummer ${SIFRE[i + 1]}`,
  })),
  // B–I–N–G–O.
  ...BOKSTAVER.map((bokstav) => ({
    id: klippForBokstav(bokstav),
    tekst: bokstav,
  })),
]

function storBokstav(ord: string): string {
  return ord.charAt(0).toUpperCase() + ord.slice(1)
}
