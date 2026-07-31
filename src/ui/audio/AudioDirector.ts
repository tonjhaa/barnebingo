'use client'

import type { GameEvent } from '@/domain/audio/events'
import { Lydkø, type Utspill } from '@/domain/audio/queue'
import { SpeechDirector, type TaleInnstillinger } from '@/domain/audio/speech'
import { randomSeed, seededRng } from '@/domain/rng'
import { Filstemme, Nettleserstemme, Reservestemme } from './stemmer'

/**
 * AudioDirector: den som binder spillet til lyden.
 *
 * Den tar imot hendelser fra hovedskjermen, spør SpeechDirector hva som skal
 * sies, og setter det i køen. Den eier også hvilken stemme som brukes og
 * hvilket sekvensnummer vi har hørt til.
 *
 * Alt den vet om bingo er hva hendelsene forteller. Alt den vet om lyd er at
 * køen finnes. Det er hele poenget: bytter man stemmeleverandør, replikker
 * eller spillregler, er det ikke her endringen havner.
 */

export interface DirigentLytter {
  /** Det som sies nå, for teksting på skjermen. Null når det er stille. */
  påTale?(utspill: Utspill | null): void
}

export class AudioDirector {
  private readonly kø: Lydkø
  private readonly tale: SpeechDirector
  private readonly nettleserstemme: Nettleserstemme | null
  /** Høyeste sekvensnummer vi har behandlet. */
  private sett = 0
  private låstOpp = false
  private på = true

  constructor(
    innstillinger: TaleInnstillinger,
    private readonly lytter: DirigentLytter = {},
    options: { seed?: number; harNavn?: (navn: string) => boolean } = {},
  ) {
    this.nettleserstemme = Nettleserstemme.støttes() ? new Nettleserstemme() : null
    const stemme = new Reservestemme(new Filstemme(), this.nettleserstemme)

    this.kø = new Lydkø(stemme, {
      påTaleStart: (utspill) => this.lytter.påTale?.(utspill),
      påTaleSlutt: () => this.lytter.påTale?.(null),
    })

    this.tale = new SpeechDirector(
      innstillinger,
      seededRng(options.seed ?? randomSeed()),
      { harNavn: options.harNavn },
    )
  }

  settInnstillinger(innstillinger: TaleInnstillinger): void {
    this.tale.settInnstillinger(innstillinger)
  }

  /**
   * Slår lyden av eller på. Av betyr stille med én gang, ikke etter at den
   * pågående setningen er ferdig — verten som skrur av vil ha ro nå.
   */
  settPå(på: boolean): void {
    this.på = på
    if (!på) this.kø.stopp()
  }

  get snakker(): boolean {
    return this.kø.snakker
  }

  /**
   * Behandler nye hendelser.
   *
   * Første gang hopper vi rett til slutten uten å si noe. En hovedskjerm som
   * kobler seg til midt i en runde skal ikke lese opp de tjue siste tallene i
   * full fart — de er allerede sagt, og for de som satt i stua er de historie.
   */
  behandle(events: GameEvent[], eventSeq: number): void {
    if (this.sett === 0) {
      this.sett = eventSeq
      return
    }

    for (const event of events) {
      if (event.seq <= this.sett) continue
      this.sett = event.seq
      if (!this.på) continue

      const utspill = this.tale.taleFor(event.data)
      if (utspill) this.kø.si(utspill)
    }
    this.sett = Math.max(this.sett, eventSeq)
  }

  /** Sier noe med én gang, utenom hendelsene. Brukes av «test stemme». */
  si(utspill: Utspill): void {
    if (this.på) this.kø.si(utspill)
  }

  /** Stopper det som sies nå, uten å slå av lyden. */
  stopp(): void {
    this.kø.stopp()
  }

  /**
   * Nettlesere nekter å lage lyd før brukeren har rørt siden. Kalles fra en
   * klikkhåndterer — vertens første trykk kommer uansett før første tall.
   */
  async låsOpp(): Promise<void> {
    if (this.låstOpp) return
    this.låstOpp = true

    const stille = new Audio(`/lyd/tall-1.mp3`)
    stille.volume = 0
    await stille.play().catch(() => undefined)
    stille.pause()

    if (this.nettleserstemme && window.speechSynthesis) {
      const tom = new SpeechSynthesisUtterance('')
      tom.volume = 0
      window.speechSynthesis.speak(tom)
    }
  }

  frigi(): void {
    this.kø.stopp()
    this.nettleserstemme?.frigi()
  }
}
