import type { Klipp } from './typer'

/**
 * Spillernavn som lyd.
 *
 * Navnene skrives fritt av barna, så de kan ikke ligge ferdig generert i
 * repoet. Løsningen har tre lag:
 *
 *   1. Et navn med et ferdig klipp leses opp.
 *   2. Et navn uten klipp kan genereres i lobbyen, før runden starter — aldri
 *      midt i spillet, der ventetiden ville blitt hørbar.
 *   3. Uten nøkkel, eller når verten har slått av navneopplesning, brukes
 *      navnefrie replikker: «Én spiller til er klar.»
 *
 * Det tredje laget er ikke en nødløsning. Det er standarden når ingen har
 * bestemt noe annet, fordi et barns navn ellers ville blitt sendt til en
 * ekstern tjeneste uten at noen tok stilling til det (§21).
 */

/**
 * Filnavn for et navn. Æ, ø og å skrives om, siden filene skal kunne ligge på
 * et hvilket som helst filsystem og hentes over HTTP uten koding.
 */
export function navnKlippId(navn: string): string {
  const rent = navn
    .toLowerCase()
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'oe')
    .replace(/å/g, 'aa')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `navn-${rent || 'spiller'}`
}

export function navnKlipp(navn: string): Klipp {
  return { id: navnKlippId(navn), tekst: navn }
}

/**
 * Navnene som er lest inn på forhånd.
 *
 * De som spiller bingo hjemme er stort sett de samme fra gang til gang, og et
 * navn som allerede finnes er både gratis og øyeblikkelig. Derfor ligger
 * husets navn her framfor å måtte genereres hver kveld.
 *
 * Skal noen nye med, legg dem til her og kjør `npm run lyd` — bare de nye
 * lages. Eller la verten trykke «Les inn navnene» i lobbyen, som gjør det
 * samme for én kveld.
 *
 * Merk: navnene her havner i repoet, både som kode og som filnavn i
 * `public/lyd/`. Er repoet offentlig, er navnene det også.
 */
export const NAVN = [
  'Klara',
  'Edvin',
  'Reodor',
  'Pernilla',
  'Ane',
  'Tonje',
  'Bestemor',
  'Bestefar',
  'Per',
  'Anne Iren',
  'Marte',
  'Kristian',
  'Annika',
  'Christer',
  'Solveig',
] as const

export const NAVNEKLIPP: Klipp[] = NAVN.map(navnKlipp)
