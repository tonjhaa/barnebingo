/**
 * Grensesnittet mot stemmeleverandørene.
 *
 * Det finnes fire aktuelle leverandører (§2), og de har hver sine API-er,
 * modellnavn og stemme-id-er. Alt det stopper her. Bytter man leverandør,
 * endres én linje konfigurasjon — SpeechDirector, replikkene, lydkøen og
 * grensesnittet vet ingenting om at det skjedde.
 *
 * Nøklene finnes bare på serveren. Ingen leverandørkode importeres av noe som
 * ender opp i nettleseren, og det er derfor denne mappa ligger under `server/`.
 */

export const LEVERANDØRER = ['elevenlabs', 'openai', 'azure', 'google'] as const
export type LeverandørId = (typeof LEVERANDØRER)[number]

/**
 * Alt som påvirker hvordan lyden høres ut.
 *
 * Feltene inngår i cache-nøkkelen. Endres stemmen eller modellen, får samme
 * tekst en ny nøkkel og genereres på nytt — ellers ville halve replikkene
 * plutselig hatt gammel stemme og halve ny.
 */
export interface Stemmeoppsett {
  leverandør: LeverandørId
  /** Leverandørens stemme-id. Aldri hardkodet i spillmotoren (§1). */
  stemme: string
  modell: string
  språk: string
  /** Fritekst som styrer levering. Ikke alle leverandører bruker den. */
  instruksjon?: string
  fart?: number
}

export interface Talebestilling {
  tekst: string
  oppsett: Stemmeoppsett
}

export interface TextToSpeechProvider {
  readonly id: LeverandørId
  /** Navnet som vises i logger og i assetregisteret. */
  readonly navn: string
  /** Filtypen leverandøren gir tilbake. */
  readonly format: 'mp3'
  syntetiser(bestilling: Talebestilling): Promise<Buffer>
}

export class TtsFeil extends Error {
  constructor(
    readonly leverandør: LeverandørId,
    readonly status: number,
    detaljer: string,
  ) {
    super(`${leverandør} svarte ${status}: ${detaljer}`)
    this.name = 'TtsFeil'
  }
}

/**
 * Standardinstruksjonen. Beskriver rollen, ikke en person — stemmen skal være
 * original og ikke ligne noen virkelig (§1).
 */
export const PROGRAMLEDER_INSTRUKSJON =
  'Snakk norsk bokmål som en vennlig og karismatisk bingovert i en familiestue. ' +
  'Varm, tydelig og engasjert, med ekstra tydelig uttale av tall og bokstaver. ' +
  'Skap forventning som en programleder i et familieprogram på TV. ' +
  'Ikke rop, ikke overdriv, og ikke gjør stemmen tegneserieaktig.'
