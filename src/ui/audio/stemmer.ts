'use client'

import type { Klippdel, Klippspiller } from '@/domain/audio/queue'

/**
 * De to måtene programlederen kan få stemme på.
 *
 * `Filstemme` spiller de genererte klippene. Det er den ekte stemmen, den samme
 * på en TV, en gammel PC og en iPad, uavhengig av hvilke stemmer akkurat den
 * maskinen har installert.
 *
 * `Nettleserstemme` leser den samme teksten med maskinens egen talesyntese.
 * Den er tydelig dårligere, og det er meningen: den finnes så appen aldri er
 * stum — under utvikling før klippene er generert, og hvis en fil skulle mangle
 * i drift. Spillet skal aldri stoppe fordi lyden gjorde det.
 */

export const LYDMAPPE = '/lyd'

export class Filstemme implements Klippspiller {
  private bufret = new Map<string, HTMLAudioElement>()
  private aktiv: HTMLAudioElement | null = null

  constructor(private readonly mappe: string = LYDMAPPE) {}

  private hent(id: string): HTMLAudioElement {
    let lyd = this.bufret.get(id)
    if (!lyd) {
      lyd = new Audio(`${this.mappe}/${id}.mp3`)
      lyd.preload = 'auto'
      this.bufret.set(id, lyd)
    }
    return lyd
  }

  forhåndslast(del: Klippdel): void {
    this.hent(del.id).load()
  }

  spill(del: Klippdel): Promise<void> {
    return new Promise((resolve, reject) => {
      const lyd = this.hent(del.id)
      this.aktiv = lyd
      lyd.currentTime = 0
      lyd.onended = () => resolve()
      // En manglende fil er ikke krise, men kalleren skal få vite det, så den
      // kan falle tilbake til nettleserstemmen.
      lyd.onerror = () => reject(new Error(`Mangler lydklipp: ${del.id}`))
      lyd.play().catch(reject)
    })
  }

  stopp(): void {
    if (!this.aktiv) return
    this.aktiv.pause()
    this.aktiv.onended = null
    this.aktiv.onerror = null
    this.aktiv = null
  }

  /** Finnes klippene i det hele tatt? Ett oppslag avgjør for hele mappa. */
  static async tilgjengelig(mappe = LYDMAPPE): Promise<boolean> {
    try {
      const svar = await fetch(`${mappe}/tall-1.mp3`, { method: 'HEAD' })
      return svar.ok
    } catch {
      return false
    }
  }
}

/** Rekkefølgen vi leter etter en stemme i: norsk først, så nabospråk. */
const SPRÅK = ['nb', 'no', 'nn', 'da', 'sv']

/**
 * Apple og Microsoft leverer to utgaver av samme stemme: en liten, komprimert
 * som høres mekanisk ut, og en nedlastbar av langt høyere kvalitet. Standarden
 * er den mekaniske, så vi leter etter den gode først.
 */
const GODE = /enhanced|premium|neural|siri|natural/i

export function velgSystemstemme(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null
  const stemmer = window.speechSynthesis.getVoices()

  for (const språk of SPRÅK) {
    const kandidater = stemmer.filter((stemme) => stemme.lang.toLowerCase().startsWith(språk))
    if (kandidater.length === 0) continue
    return kandidater.find((stemme) => GODE.test(stemme.name)) ?? kandidater[0]
  }
  return null
}

export class Nettleserstemme implements Klippspiller {
  private stemme: SpeechSynthesisVoice | null = null

  constructor() {
    this.oppdaterStemme()
    // Chrome laster stemmelista asynkront, og den er tom ved første oppslag.
    window.speechSynthesis?.addEventListener('voiceschanged', this.oppdaterStemme)
  }

  private oppdaterStemme = (): void => {
    this.stemme = velgSystemstemme()
  }

  spill(del: Klippdel): Promise<void> {
    return new Promise((resolve) => {
      if (!window.speechSynthesis || !del.tekst) return resolve()
      const ytring = new SpeechSynthesisUtterance(del.tekst)
      ytring.lang = this.stemme?.lang ?? 'nb-NO'
      if (this.stemme) ytring.voice = this.stemme
      ytring.rate = 0.95
      ytring.onend = () => resolve()
      ytring.onerror = () => resolve()
      window.speechSynthesis.speak(ytring)
    })
  }

  stopp(): void {
    window.speechSynthesis?.cancel()
  }

  frigi(): void {
    window.speechSynthesis?.removeEventListener('voiceschanged', this.oppdaterStemme)
  }

  static støttes(): boolean {
    return typeof window !== 'undefined' && Boolean(window.speechSynthesis)
  }
}

/**
 * Filklippene med nettleserstemmen som fallback per bit.
 *
 * Fallbacken er per klipp, ikke per replikk. Mangler bare navneklippet, sies
 * resten med den ekte stemmen og navnet med maskinens — det er langt bedre enn
 * å bytte stemme midt i kvelden fordi én fil manglet.
 */
export class Reservestemme implements Klippspiller {
  private brukt: Klippspiller | null = null

  constructor(
    private readonly filer: Filstemme,
    private readonly reserve: Klippspiller | null,
  ) {}

  forhåndslast(del: Klippdel): void {
    if (pauseLengde(del.id) === null) this.filer.forhåndslast(del)
  }

  async spill(del: Klippdel): Promise<void> {
    // En pause er en «bit» uten lyd. Å gi den et eget klipp ville betydd 
    // en fil som bare inneholder stillhet, og en ekstra nedlasting for
    // ingenting.
    const pause = pauseLengde(del.id)
    if (pause !== null) return new Promise((resolve) => setTimeout(resolve, pause))

    try {
      this.brukt = this.filer
      await this.filer.spill(del)
    } catch {
      if (!this.reserve) return
      this.brukt = this.reserve
      await this.reserve.spill(del)
    }
  }

  stopp(): void {
    this.brukt?.stopp()
    this.filer.stopp()
    this.reserve?.stopp()
  }
}

/** Millisekunder for en pausebit, eller null om det ikke er en. */
function pauseLengde(id: string): number | null {
  const treff = /^pause-(\d+)$/.exec(id)
  return treff ? Number(treff[1]) : null
}
