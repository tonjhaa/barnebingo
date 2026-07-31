import {
  AVSLUTNINGER,
  INTROER,
  frase,
} from '@/content/fraser'
import { navnKlippId } from '@/content/navn'
import {
  klippForBokstav,
  klippForNummer,
  klippForSiffer,
  klippForTall,
  sifferOrd,
  sifreneI,
  tallOrd,
} from '@/content/tall'
import { variantFor } from '@/content/tallvarianter'
import type { Klipp, Opplesningsnivå, Programledermodus, Tallopplesning } from '@/content/typer'
import type { Rng } from '../rng'
import { priorityOf, type GameEventData } from './events'
import type { Utspill } from './queue'

/**
 * SpeechDirector: hva programlederen sier, og hvordan.
 *
 * Den vet ingenting om lydfiler ut over id-ene i innholdslaget, ingenting om
 * nettleseren og ingenting om bingoregler. Inn kommer en hendelse, ut kommer et
 * utspill. Det gjør den testbar uten lyd, og det gjør at hele opplesningen kan
 * reproduseres fra en seed.
 *
 * Den viktigste jobben er ikke variasjonen, men tydeligheten: uansett hvor mye
 * som pyntes rundt, skal tallet alltid komme fram. Derfor bygges hvert utspill
 * som «pynt foran – tallet – tallet igjen – pynt bak», og pynten kan falle bort
 * uten at noe går tapt.
 */

export interface TaleInnstillinger {
  modus: Programledermodus
  nivå: Opplesningsnivå
  tallopplesning: Tallopplesning
  /** Hvor B–I–N–G–O leses. «av» gjelder også formater uten bokstaver. */
  bokstav: 'før' | 'etter' | 'av'
  /** Hjelp til barn: si tallet én gang til på slutten. */
  gjentaTallet: boolean
  /** Leses spillernes navn opp? Krever at navneklippene finnes (§21). */
  lesNavn: boolean
}

export const STANDARD_TALE: TaleInnstillinger = {
  modus: 'fulltGameshow',
  nivå: 'gameshow',
  tallopplesning: 'heltOgSifre',
  bokstav: 'før',
  gjentaTallet: false,
  lesNavn: true,
}

/**
 * Hvor i runden vi er (§10). Dramaturgien henger på dette: tidlig er det rom
 * for å forklare, sent skal tallet komme raskt og alene.
 */
export type Fase = 'tidlig' | 'midt' | 'sent'

export function faseFor(drawnCount: number, remaining: number): Fase {
  const totalt = drawnCount + remaining
  if (totalt === 0) return 'tidlig'
  const andel = drawnCount / totalt
  if (andel < 0.25) return 'tidlig'
  return andel < 0.6 ? 'midt' : 'sent'
}

/** Sannsynligheten for en innledning, etter nivå og hvor langt runden er kommet. */
const INTRO_SJANSE: Record<Opplesningsnivå, Record<Fase, number>> = {
  enkel: { tidlig: 0, midt: 0, sent: 0 },
  rolig: { tidlig: 0, midt: 0, sent: 0 },
  variert: { tidlig: 0.6, midt: 0.5, sent: 0.3 },
  gameshow: { tidlig: 0.85, midt: 0.75, sent: 0.45 },
}

/** Sannsynligheten for en avslutning. Aldri hver gang — det blir masete. */
const AVSLUTNING_SJANSE: Record<Opplesningsnivå, Record<Fase, number>> = {
  enkel: { tidlig: 0, midt: 0, sent: 0 },
  rolig: { tidlig: 0, midt: 0, sent: 0 },
  variert: { tidlig: 0.3, midt: 0.25, sent: 0.1 },
  gameshow: { tidlig: 0.45, midt: 0.4, sent: 0.15 },
}

/** Hvor mange nylig brukte fraser som er sperret. */
const HUSKER = 5

export interface TaleKontekst {
  /** Finnes det et lydklipp for dette navnet? Avgjør navnefri formulering. */
  harNavn?: (navn: string) => boolean
}

export class SpeechDirector {
  /** Nylig brukte id-er per gruppe, nyeste først. */
  private nylig = new Map<string, string[]>()
  private sisteIntro: string | null = null

  constructor(
    private innstillinger: TaleInnstillinger,
    private readonly rng: Rng,
    private readonly kontekst: TaleKontekst = {},
  ) {}

  settInnstillinger(innstillinger: TaleInnstillinger): void {
    this.innstillinger = innstillinger
  }

  /**
   * Oversetter en hendelse til noe som skal sies, eller null når programlederen
   * skal tie. Null er et fullgodt svar: det er bedre å si ingenting enn å fylle
   * hver eneste pause med lyd.
   */
  taleFor(event: GameEventData): Utspill | null {
    const { modus } = this.innstillinger
    if (modus === 'av') return null

    // «Bare tall» betyr bare tall. Alt annet på skjermen står der uansett.
    if (modus === 'bareTall' && event.kind !== 'numberDrawn') return null

    const deler = this.delerFor(event)
    if (!deler || deler.length === 0) return null

    return {
      deler,
      text: settSammenTekst(deler),
      priority: priorityOf(event),
      // Premien og rundens slutt skal få snakke ferdig. Alt annet kan kuttes.
      interruptible: event.kind !== 'bingoApproved' && event.kind !== 'roundFinished',
    }
  }

  private delerFor(event: GameEventData): Klipp[] | null {
    switch (event.kind) {
      case 'numberDrawn':
        return this.tallet(event.value, event.letter, event.drawnCount, event.remaining)

      case 'roomOpened':
        return [frase('sys-velkommen-1'), frase('sys-velkommen-2')]

      case 'playerJoined':
        return this.medNavn(event.name, 'sys-blemed-1', 'sys-noen-blemed')

      case 'playerReady': {
        const mangler = event.playerCount - event.readyCount
        const klar = this.medNavn(event.name, 'sys-klar-1', 'sys-enklartil')
        return mangler === 1 ? [...klar, frase('sys-mangler-en')] : klar
      }

      case 'allReady':
        return [frase('sys-alleklare'), frase('sys-spennende')]

      case 'roundStarted':
        return [
          ...this.hilsen(event.names),
          frase('sys-finnfrem'),
          ...this.stadium(0, false),
          frase('sys-trykkbingo'),
          frase('sys-starter'),
        ]

      case 'stageAnnounced':
        return [
          ...this.stadium(event.stageIndex, event.isFinalStage),
          frase('sys-beholdmarkeringer'),
        ]

      case 'paused':
        return [frase('sys-pause')]

      case 'resumed':
        return [frase('sys-fortsetter')]

      case 'bingoClaimed': {
        const navn = this.navnKlipp(event.name)
        return navn
          ? [navn, frase('sys-bingotrykk-3')]
          : [frase('sys-bingotrykk-1'), frase('sys-bingotrykk-2')]
      }

      case 'bingoRejected':
        // Vennlig, uten straff, og uten navn — et bomtrykk skal ikke henges ut.
        return [this.velg('bom', ['sys-bom-1', 'sys-bom-2', 'sys-bom-3', 'sys-bom-4', 'sys-bom-5'])]

      case 'bingoApproved':
        return this.premie(event.names, event.isFinalStage)

      case 'drawExhausted':
        return [frase('sys-tomkule')]

      case 'roundFinished':
        return [frase('sys-takk-1'), frase('sys-gratulerer-alle'), frase('sys-nyrunde')]

      case 'newRoundStarted':
        return [frase('sys-velkommen-1')]

      case 'gameEnded':
        return [frase('sys-takkfordag')]

      case 'playerDisconnected':
        return [frase('sys-venter')]

      case 'playerReconnected':
        return [frase('sys-tilbake')]
    }
  }

  // --- Tallet ---------------------------------------------------------------

  /**
   * Selve opplesningen (§5).
   *
   * Rekkefølgen er fast: innledning, bokstav, hele tallet, tallet igjen, og
   * eventuelt en avslutning. Bare det midterste er obligatorisk, og det er
   * grunnen til at pynten trygt kan variere.
   */
  private tallet(
    value: number,
    letter: string | null,
    drawnCount: number,
    remaining: number,
  ): Klipp[] {
    const { nivå, tallogsifre, bokstav } = this.tallvalg()
    const fase = faseFor(drawnCount, remaining)
    const deler: Klipp[] = []

    const innledning = this.innledning(value, fase)
    if (innledning) deler.push(innledning)

    const bokstavKlipp =
      letter && bokstav !== 'av'
        ? { id: klippForBokstav(letter), tekst: letter }
        : null
    if (bokstavKlipp && bokstav === 'før') deler.push(bokstavKlipp)

    deler.push(tallKlipp(value))
    if (bokstavKlipp && bokstav === 'etter') deler.push(bokstavKlipp)

    if (tallogsifre) {
      // Ensifret gjentas som «nummer sju»; tosifret leses siffer for siffer.
      // Begge deler har samme hensikt: at ingen er i tvil om hvilket tall det er.
      if (value < 10) {
        deler.push({ id: klippForNummer(value), tekst: `nummer ${sifferOrd(value)}` })
      } else {
        for (const siffer of sifreneI(value)) {
          deler.push({ id: klippForSiffer(siffer), tekst: sifferOrd(siffer) })
        }
      }
    }

    if (this.innstillinger.gjentaTallet) deler.push(tallKlipp(value))

    const avslutning = this.avslutning(nivå, fase)
    if (avslutning) deler.push(avslutning)

    return deler
  }

  /** Nivået brytes ned til de valgene som faktisk styrer opplesningen. */
  private tallvalg() {
    const { nivå, tallopplesning, bokstav } = this.innstillinger
    return {
      nivå,
      // Læringsmodus leser alltid sifrene, uansett hva som ellers er valgt.
      tallogsifre: nivå === 'rolig' || tallopplesning !== 'helt',
      // Bokstavvalget står for seg. «av» gjelder også når man har bedt om
      // bokstav-og-sifre, siden det mest spesifikke valget skal vinne.
      bokstav,
    }
  }

  /**
   * En tallvariant hvis tallet har en og vi er i gameshowmodus, ellers en
   * vanlig intro — eller ingenting. Varianten går foran introen, siden begge
   * gjør samme jobb og to innledninger på rad er én for mye.
   */
  private innledning(value: number, fase: Fase): Klipp | null {
    const { nivå, modus } = this.innstillinger

    if (modus === 'fulltGameshow' && nivå === 'gameshow' && fase !== 'sent') {
      const varianter = variantFor(value)
      if (varianter.length > 0 && this.rng() < 0.5) {
        return this.velgBlant('variant', varianter)
      }
    }

    if (this.rng() >= INTRO_SJANSE[nivå][fase]) return null

    const valgt = this.velgBlant('intro', INTROER)
    // Aldri samme innledning to ganger på rad, uansett hva tilfeldigheten sier.
    if (valgt.id === this.sisteIntro && INTROER.length > 1) {
      const annen = this.velgBlant('intro', INTROER.filter((k) => k.id !== valgt.id))
      this.sisteIntro = annen.id
      return annen
    }
    this.sisteIntro = valgt.id
    return valgt
  }

  private avslutning(nivå: Opplesningsnivå, fase: Fase): Klipp | null {
    if (this.rng() >= AVSLUTNING_SJANSE[nivå][fase]) return null
    return this.velgBlant('avslutning', AVSLUTNINGER)
  }

  // --- Navn og sammensatte replikker ---------------------------------------

  /** Navneklippet, eller null når navnet ikke kan leses opp. */
  private navnKlipp(navn: string): Klipp | null {
    if (!this.innstillinger.lesNavn) return null
    if (this.kontekst.harNavn && !this.kontekst.harNavn(navn)) return null
    return { id: navnKlippId(navn), tekst: navn }
  }

  /** «Ada er klar!» hvis navnet finnes, ellers «Én spiller til er klar.» */
  private medNavn(navn: string, medId: string, utenId: string): Klipp[] {
    const klipp = this.navnKlipp(navn)
    return klipp ? [klipp, frase(medId)] : [frase(utenId)]
  }

  private hilsen(navn: string[]): Klipp[] {
    const klipp = navn.map((n) => this.navnKlipp(n)).filter((k): k is Klipp => k !== null)
    if (klipp.length !== navn.length || klipp.length === 0) {
      return [frase('sys-velkommen-1')]
    }
    return [frase('sys-velkommen-navn'), ...klipp]
  }

  private stadium(stageIndex: number, isFinalStage: boolean): Klipp[] {
    if (isFinalStage) return [frase('sys-stadium-fullt')]
    const i = Math.min(stageIndex, 2)
    return [frase(`sys-stadium-${i}`)]
  }

  private premie(navn: string[], isFinalStage: boolean): Klipp[] {
    const bekreftelse = this.velg('godkjent', [
      'sys-godkjent-1',
      'sys-godkjent-2',
      'sys-godkjent-3',
    ])
    const klipp = navn.map((n) => this.navnKlipp(n)).filter((k): k is Klipp => k !== null)

    const kjerne =
      klipp.length === navn.length && klipp.length > 0
        ? [bekreftelse, ...klipp, frase('sys-harbingo')]
        : [bekreftelse, frase('sys-vivinner')]

    return isFinalStage
      ? [...kjerne, frase('sys-avslutning-flott'), frase('sys-applaus')]
      : [...kjerne, frase('sys-gratulerer')]
  }

  // --- Variasjon ------------------------------------------------------------

  private velg(gruppe: string, ider: string[]): Klipp {
    return this.velgBlant(
      gruppe,
      ider.map((id) => frase(id)),
    )
  }

  /**
   * Trekker en frase som ikke er brukt nylig.
   *
   * Ren tilfeldighet gir «Neste tall er» tre ganger på rad omtrent like ofte
   * som noe annet, og da høres programlederen ut som en maskin selv om
   * variasjonen finnes. Derfor sperres de sist brukte.
   */
  private velgBlant(gruppe: string, valg: Klipp[]): Klipp {
    if (valg.length === 0) throw new Error(`Ingen fraser i gruppen ${gruppe}`)

    const brukt = this.nylig.get(gruppe) ?? []
    const ledige = valg.filter((klipp) => !brukt.includes(klipp.id))
    // Er alt brukt nylig, starter vi på nytt heller enn å si ingenting.
    const kandidater = ledige.length > 0 ? ledige : valg

    const valgt = kandidater[Math.floor(this.rng() * kandidater.length)]
    this.nylig.set(gruppe, [valgt.id, ...brukt].slice(0, HUSKER))
    return valgt
  }
}

/** Tallet som klipp, med ordet skrevet ut slik det uttales. */
function tallKlipp(value: number): Klipp {
  const ord = tallOrd(value)
  return { id: klippForTall(value), tekst: ord.charAt(0).toUpperCase() + ord.slice(1) }
}

/**
 * Teksten som svarer til klippene. Brukes til teksting og til nettleserstemmen,
 * så den må lese like naturlig som lyden høres ut.
 */
export function settSammenTekst(deler: Klipp[]): string {
  return deler
    .map((klipp) => klipp.tekst.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+([.,!?])/g, '$1')
    .replace(/([.!?])\s+([.,!?])/g, '$1')
    .trim()
}
