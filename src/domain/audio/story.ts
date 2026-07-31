import { FRITTSTÅENDE, innslagFor, type Innslag } from '@/content/historier'
import type { Historiefrekvens } from '@/content/typer'
import type { Rng } from '../rng'
import { CRITICAL_KINDS, type GameEventData } from './events'
import type { Utspill } from './queue'
import type { Fase } from './speech'

/**
 * StoryDirector: når det passer å si noe ekstra.
 *
 * Den vanskelige delen er ikke å finne på innslag, men å la være. Et innslag
 * som kommer etter hvert eneste tall gjør bingo til en podkast; et innslag som
 * kommer mens noen venter på å få bingoen sin kontrollert, er direkte i veien.
 *
 * Derfor har den bare tre svar: nei, ikke nå, eller ja — og de to første er de
 * vanligste. Den påvirker ingen bingoregler og kan skrus helt av uten at noe
 * annet endrer seg.
 */

/** Hvor mange trekk som må gå mellom hvert innslag. */
const MELLOMROM: Record<Historiefrekvens, number> = {
  av: Infinity,
  sjelden: 12,
  normal: 6,
  ofte: 4,
}

export interface HistorieKontekst {
  frekvens: Historiefrekvens
  fase: Fase
  /** Er noen nær bingo? Da skal det være stille. */
  spent: boolean
}

export class StoryDirector {
  /** Innslag brukt i denne runden. Ingen gjentas før runden er over. */
  private brukt = new Set<string>()
  private sidenSist = 0

  constructor(private readonly rng: Rng) {}

  /** Ny runde, blanke ark. Vitsene får leve opp igjen. */
  nullstill(): void {
    this.brukt.clear()
    this.sidenSist = 0
  }

  /**
   * Vurderer et innslag etter et trukket tall.
   *
   * Kalles bare på `numberDrawn` med vilje. Mellom tallet og markeringen er
   * det en pause som allerede finnes; alle andre steder ville et innslag måtte
   * skape sin egen, og det er den som gjør spillet tregt.
   */
  innslagEtter(event: GameEventData, kontekst: HistorieKontekst): Utspill | null {
    if (event.kind !== 'numberDrawn') {
      // Ved kritiske hendelser skal det være helt stille (§8). Telleren rører
      // vi ikke — spenningen skal ikke gi et innslag til overs etterpå.
      if (CRITICAL_KINDS.has(event.kind)) this.sidenSist = 0
      return null
    }

    this.sidenSist++
    if (kontekst.frekvens === 'av') return null

    // Nær bingo betyr full oppmerksomhet på tallene.
    if (kontekst.spent) return null

    // Sent i runden har spenningen tatt over, og et innslag bare bremser.
    const krav = MELLOMROM[kontekst.frekvens] * (kontekst.fase === 'sent' ? 2 : 1)
    if (this.sidenSist < krav) return null

    const valgt = this.velg(event.value)
    if (!valgt) return null

    this.brukt.add(valgt.id)
    this.sidenSist = 0

    return {
      deler: [{ id: valgt.id, tekst: valgt.tekst }],
      text: valgt.tekst,
      // Lavest av alt. Kommer det et tall eller en bingo, skal innslaget vike.
      priority: 'lav',
      interruptible: true,
    }
  }

  /** Et innslag for tallet hvis det finnes, ellers et som passer når som helst. */
  private velg(tall: number): Innslag | null {
    const knyttet = innslagFor(tall).filter((innslag) => !this.brukt.has(innslag.id))
    if (knyttet.length > 0) return this.trekk(knyttet)

    const frie = FRITTSTÅENDE.filter((innslag) => !this.brukt.has(innslag.id))
    return frie.length > 0 ? this.trekk(frie) : null
  }

  private trekk(blant: Innslag[]): Innslag {
    return blant[Math.floor(this.rng() * blant.length)]
  }
}
