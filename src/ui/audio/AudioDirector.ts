'use client'

import type { GameEvent, GameEventData } from '@/domain/audio/events'
import { Lydkø, type Utspill } from '@/domain/audio/queue'
import { taleFra, TEMPO_PAUSE_MS, type Lydinnstillinger } from '@/domain/audio/settings'
import { faseFor, SpeechDirector } from '@/domain/audio/speech'
import { StoryDirector } from '@/domain/audio/story'
import { randomSeed, seededRng } from '@/domain/rng'
import { MusicManager, SoundEffectManager, type Effekt } from './musikk'
import { Filstemme, Nettleserstemme, Reservestemme } from './stemmer'

/**
 * AudioDirector: den som binder spillet til lyden.
 *
 * Den tar imot hendelser, spør SpeechDirector hva som skal sies, StoryDirector
 * om det er rom for et innslag, og setter resultatet i køen. Underveis styrer
 * den musikk og effekter.
 *
 * Alt den vet om bingo er hva hendelsene forteller. Alt den vet om lyd er at
 * køen finnes. Bytter man stemmeleverandør, replikker eller spillregler, er det
 * ikke her endringen havner.
 */

export interface DirigentLytter {
  /** Det som sies nå, for teksting på skjermen. Null når det er stille. */
  påTale?(utspill: Utspill | null): void
}

/** Hvilken effekt hver hendelse utløser. */
const EFFEKT_FOR: Partial<Record<GameEventData['kind'], Effekt>> = {
  numberDrawn: 'trekk',
  stageAnnounced: 'overgang',
  bingoClaimed: 'spenning',
  bingoRejected: 'bom',
  roundFinished: 'applaus',
}

export class AudioDirector {
  private readonly kø: Lydkø
  private readonly tale: SpeechDirector
  private readonly historier: StoryDirector
  private readonly musikk = new MusicManager()
  private readonly effekter = new SoundEffectManager()
  private readonly nettleserstemme: Nettleserstemme | null

  private innstillinger: Lydinnstillinger
  /** Høyeste sekvensnummer vi har behandlet. */
  private sett = 0
  private låstOpp = false
  /** Er noen nær bingo? Da holder programlederen seg til tallene. */
  private spent = false

  constructor(
    innstillinger: Lydinnstillinger,
    private readonly lytter: DirigentLytter = {},
    options: { seed?: number; harNavn?: (navn: string) => boolean } = {},
  ) {
    this.innstillinger = innstillinger
    this.nettleserstemme = Nettleserstemme.støttes() ? new Nettleserstemme() : null
    const stemme = new Reservestemme(new Filstemme(), this.nettleserstemme)

    this.kø = new Lydkø(stemme, {
      // Ducking henger på disse to. Musikken skal ligge under tale, ikke over.
      påTaleStart: (utspill) => {
        this.musikk.settDempet(true)
        this.lytter.påTale?.(utspill)
      },
      påTaleSlutt: () => {
        this.musikk.settDempet(false)
        this.lytter.påTale?.(null)
      },
    })

    const seed = options.seed ?? randomSeed()
    this.tale = new SpeechDirector(taleFra(innstillinger), seededRng(seed), {
      harNavn: options.harNavn,
    })
    // Egen strøm, så et innslag mer eller mindre ikke forskyver hvilke
    // innledninger tallene får.
    this.historier = new StoryDirector(seededRng(seed ^ 0x51ed270b))

    this.anvend()
  }

  settInnstillinger(innstillinger: Lydinnstillinger): void {
    const forrige = this.innstillinger
    this.innstillinger = innstillinger
    this.tale.settInnstillinger(taleFra(innstillinger))
    this.anvend()

    // Av betyr stille nå, ikke etter at setningen er ferdig — verten som skrur
    // av vil ha ro med én gang.
    if (forrige.på && !innstillinger.på) this.kø.stopp()
  }

  private anvend(): void {
    const { på, musikk, effekter } = this.innstillinger
    this.musikk.settNivå(på ? musikk : 'av')
    this.effekter.settNivå(på ? effekter : 'av')
  }

  get snakker(): boolean {
    return this.kø.snakker
  }

  settSpent(spent: boolean): void {
    this.spent = spent
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
      if (!this.innstillinger.på) continue
      this.behandleEn(event.data)
    }
    this.sett = Math.max(this.sett, eventSeq)
  }

  private behandleEn(data: GameEventData): void {
    // Ny runde betyr blanke ark: vitsene får leve opp igjen.
    if (data.kind === 'roundStarted' || data.kind === 'newRoundStarted') {
      this.historier.nullstill()
      void this.musikk.start()
    }

    // Effekten først. Den er kort, og skal ligge foran ordene, ikke oppå dem.
    const effekt = this.effektFor(data)
    if (effekt) this.effekter.spill(effekt)

    if (data.kind === 'paused') this.musikk.pause()
    if (data.kind === 'resumed') this.musikk.fortsett()
    if (data.kind === 'gameEnded') this.musikk.stopp()

    const utspill = this.tale.taleFor(data)
    if (utspill) this.kø.si(this.medTempo(utspill))

    const innslag = this.historier.innslagEtter(data, {
      frekvens: this.innstillinger.historier,
      fase: data.kind === 'numberDrawn' ? faseFor(data.drawnCount, data.remaining) : 'midt',
      spent: this.spent,
    })
    if (innslag) this.kø.si(innslag)
  }

  /**
   * Fanfaren er reservert fullt brett. Kom kveldens største lyd fire ganger,
   * ville den ikke betydd noe den siste.
   */
  private effektFor(data: GameEventData): Effekt | null {
    if (data.kind === 'bingoApproved') return data.isFinalStage ? 'fanfare' : 'bingo'
    return EFFEKT_FOR[data.kind] ?? null
  }

  /**
   * Rolig tempo får en liten pause foran seg, så barnet rekker å lete ferdig på
   * brettet før neste replikk begynner. Pausen ligger i utspillet framfor i
   * køen, slik at en avbrytelse også fjerner den.
   */
  private medTempo(utspill: Utspill): Utspill {
    const pause = TEMPO_PAUSE_MS[this.innstillinger.tempo]
    if (pause === 0) return utspill
    return {
      ...utspill,
      deler: [{ id: `pause-${pause}`, tekst: '' }, ...utspill.deler],
    }
  }

  /** Sier noe med én gang, utenom hendelsene. Brukes av «test stemme». */
  si(utspill: Utspill): void {
    if (this.innstillinger.på) this.kø.si(utspill)
  }

  spillEffekt(effekt: Effekt): void {
    this.effekter.spill(effekt)
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

    const stille = new Audio('/lyd/tall-1.mp3')
    stille.volume = 0
    await stille.play().catch(() => undefined)
    stille.pause()

    if (this.nettleserstemme && window.speechSynthesis) {
      const tom = new SpeechSynthesisUtterance('')
      tom.volume = 0
      window.speechSynthesis.speak(tom)
    }

    void this.musikk.start()
  }

  frigi(): void {
    this.kø.stopp()
    this.musikk.frigi()
    this.effekter.frigi()
    this.nettleserstemme?.frigi()
  }
}
