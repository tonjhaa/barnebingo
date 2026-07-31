/**
 * Alt programlederen kan si, som data.
 *
 * Én regel bærer hele innholdslaget: **et klipp er en id og en tekst**. Samme
 * liste brukes av genereringsskriptet, som lager lydfilene, og av avspillingen,
 * som slår opp filnavn. Da kan de to ikke komme i utakt — et klipp uten fil
 * finnes ikke, og en fil uten klipp blir aldri laget.
 *
 * Teksten er ikke bare et notat. Den brukes til teksting, til nettleserstemmen
 * når lydfilene mangler, og til å validere at innholdet henger sammen.
 */
export interface Klipp {
  /** Filnavnet uten filtype. Brukt som `/lyd/<id>.mp3`. */
  id: string
  /** Det som skal sies. Norsk bokmål, skrevet ut. */
  tekst: string
}

/** Hvor mye programlederen legger seg i. §13, «Opplesningsnivå». */
export const OPPLESNINGSNIVÅER = ['enkel', 'variert', 'gameshow', 'rolig'] as const
export type Opplesningsnivå = (typeof OPPLESNINGSNIVÅER)[number]

/** Hvor mye av tallet som leses. §13, «Tallopplesning». */
export const TALLOPPLESNINGER = ['helt', 'heltOgSifre', 'bokstavHeltOgSifre'] as const
export type Tallopplesning = (typeof TALLOPPLESNINGER)[number]

/** Hvor ofte det kommer et innslag. §13, «Historier». */
export const HISTORIEFREKVENSER = ['av', 'sjelden', 'normal', 'ofte'] as const
export type Historiefrekvens = (typeof HISTORIEFREKVENSER)[number]

/** Hvor mye programlederen sier i det hele tatt. §13, «Programleder». */
export const PROGRAMLEDERMODUSER = [
  'av',
  'bareTall',
  'tallOgMeldinger',
  'fulltGameshow',
] as const
export type Programledermodus = (typeof PROGRAMLEDERMODUSER)[number]
