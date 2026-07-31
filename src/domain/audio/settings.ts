import type {
  Historiefrekvens,
  Opplesningsnivå,
  Programledermodus,
  Tallopplesning,
} from '@/content/typer'
import type { TaleInnstillinger } from './speech'

/**
 * Vertens lydvalg (§13).
 *
 * Alt kan skrus av. Det er ikke en høflighet, men et krav: en bingokveld skal
 * kunne spilles i stillhet fordi noen sover i naborommet, og en femåring som
 * blir overveldet av musikk skal kunne få den vekk uten at spillet endres.
 *
 * Standardene er satt for stua, ikke for demoen: programlederen på, musikken
 * lavt, effektene normalt.
 */

export type Lydnivå = 'av' | 'lav' | 'normal'
export type Tempo = 'rolig' | 'normalt' | 'raskt'

export interface Lydinnstillinger {
  /** Er lyd i det hele tatt på? Høyttalerknappen på hovedskjermen. */
  på: boolean
  programleder: Programledermodus
  nivå: Opplesningsnivå
  historier: Historiefrekvens
  tallopplesning: Tallopplesning
  bokstav: 'før' | 'etter' | 'av'
  musikk: Lydnivå
  effekter: Lydnivå
  tempo: Tempo
  /** Hjelp til barn: gjenta tallet automatisk. */
  gjentaTallet: boolean
  /** Les opp spillernes navn. Krever genererte navneklipp (§21). */
  lesNavn: boolean
}

export const STANDARD_LYD: Lydinnstillinger = {
  på: true,
  programleder: 'fulltGameshow',
  nivå: 'gameshow',
  historier: 'normal',
  tallopplesning: 'heltOgSifre',
  bokstav: 'før',
  musikk: 'lav',
  effekter: 'normal',
  tempo: 'normalt',
  gjentaTallet: false,
  lesNavn: true,
}

/**
 * Læringsmodus for de yngste: rolig, uten historier og uten musikk, med tallet
 * gjentatt. Alt som ellers konkurrerer med tallet er tatt vekk.
 */
export const LÆRINGSMODUS: Lydinnstillinger = {
  ...STANDARD_LYD,
  programleder: 'tallOgMeldinger',
  nivå: 'rolig',
  historier: 'av',
  musikk: 'av',
  tempo: 'rolig',
  gjentaTallet: true,
}

/** Delen SpeechDirector trenger. Resten angår musikk og effekter. */
export function taleFra(innstillinger: Lydinnstillinger): TaleInnstillinger {
  return {
    modus: innstillinger.programleder,
    nivå: innstillinger.nivå,
    tallopplesning: innstillinger.tallopplesning,
    bokstav: innstillinger.bokstav,
    gjentaTallet: innstillinger.gjentaTallet,
    lesNavn: innstillinger.lesNavn,
  }
}

/**
 * Tempoet styrer pausen mellom det som sies. Rolig gir barnet tid til å lete
 * ferdig på brettet før neste replikk begynner.
 */
export const TEMPO_PAUSE_MS: Record<Tempo, number> = {
  rolig: 700,
  normalt: 300,
  raskt: 0,
}
