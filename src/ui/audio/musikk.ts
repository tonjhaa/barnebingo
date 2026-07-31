'use client'

/**
 * Musikk og lydeffekter.
 *
 * Den eneste virkelig vanskelige delen her er ducking: bakgrunnsmusikken må
 * ned når programlederen snakker, og opp igjen etterpå — jevnt, ikke i ett
 * hopp. Et brått volumfall høres like galt ut som musikk over tale.
 *
 * Alt annet er bevisst enkelt. Ingen AudioContext, ingen node-graf: `Audio` med
 * volum holder, og det er det eneste som virker likt i Safari på en iPhone.
 */

export const EFFEKTMAPPE = '/lyd/effekt'
export const MUSIKKMAPPE = '/lyd/musikk'

export const EFFEKTER = [
  'knapp',
  'trekk',
  'markering',
  'overgang',
  'spenning',
  'bingo',
  'fanfare',
  'applaus',
  'konfetti',
  'bom',
  'nedtelling',
] as const
export type Effekt = (typeof EFFEKTER)[number]

export const NIVÅER = ['av', 'lav', 'normal'] as const
export type Nivå = (typeof NIVÅER)[number]

const VOLUM: Record<Nivå, number> = { av: 0, lav: 0.25, normal: 0.6 }

/** Hvor mye musikken dempes mens noen snakker. */
const DUCK = 0.25
/** Hvor lang tid dempingen tar. Kort nok til å rekke ordet, langt nok til å gli. */
const DUCK_MS = 220
const FADE_MS = 900

export class MusicManager {
  private lyd: HTMLAudioElement | null = null
  private nivå: Nivå = 'lav'
  private dempet = false
  private timer: ReturnType<typeof setInterval> | null = null

  constructor(private readonly spor: string = `${MUSIKKMAPPE}/bakgrunn.wav`) {}

  private get mål(): number {
    return VOLUM[this.nivå] * (this.dempet ? DUCK : 1)
  }

  settNivå(nivå: Nivå): void {
    this.nivå = nivå
    if (nivå === 'av') return this.stopp()
    this.gliTil(this.mål, FADE_MS)
  }

  /** Kalles når programlederen begynner og slutter å snakke. */
  settDempet(dempet: boolean): void {
    if (this.dempet === dempet) return
    this.dempet = dempet
    this.gliTil(this.mål, DUCK_MS)
  }

  async start(): Promise<void> {
    if (this.nivå === 'av') return
    if (!this.lyd) {
      this.lyd = new Audio(this.spor)
      this.lyd.loop = true
      this.lyd.volume = 0
    }
    // Manglende musikkfil skal ikke stoppe noe. Da spilles det bare ingenting.
    await this.lyd.play().catch(() => undefined)
    this.gliTil(this.mål, FADE_MS)
  }

  pause(): void {
    this.gliTil(0, FADE_MS, () => this.lyd?.pause())
  }

  fortsett(): void {
    void this.start()
  }

  stopp(): void {
    this.gliTil(0, FADE_MS, () => {
      this.lyd?.pause()
      if (this.lyd) this.lyd.currentTime = 0
    })
  }

  /** Volumet flyttes i små steg. Én tråd om gangen, så to fades ikke slåss. */
  private gliTil(mål: number, tid: number, etterpå?: () => void): void {
    const lyd = this.lyd
    if (!lyd) return
    if (this.timer) clearInterval(this.timer)

    const steg = 20
    const antall = Math.max(1, Math.round(tid / steg))
    const fra = lyd.volume
    let i = 0

    this.timer = setInterval(() => {
      i++
      lyd.volume = Math.max(0, Math.min(1, fra + ((mål - fra) * i) / antall))
      if (i >= antall) {
        if (this.timer) clearInterval(this.timer)
        this.timer = null
        etterpå?.()
      }
    }, steg)
  }

  frigi(): void {
    if (this.timer) clearInterval(this.timer)
    this.lyd?.pause()
    this.lyd = null
  }
}

export class SoundEffectManager {
  private bufret = new Map<Effekt, HTMLAudioElement>()
  private nivå: Nivå = 'normal'

  settNivå(nivå: Nivå): void {
    this.nivå = nivå
  }

  /**
   * Spiller en effekt. Aldri ventet på, aldri kritisk: en effekt som ikke
   * finnes eller ikke får lov å spille skal passere ubemerket.
   */
  spill(effekt: Effekt): void {
    if (this.nivå === 'av') return
    let lyd = this.bufret.get(effekt)
    if (!lyd) {
      lyd = new Audio(`${EFFEKTMAPPE}/${effekt}.wav`)
      lyd.preload = 'auto'
      this.bufret.set(effekt, lyd)
    }
    lyd.volume = VOLUM[this.nivå]
    lyd.currentTime = 0
    void lyd.play().catch(() => undefined)
  }

  frigi(): void {
    for (const lyd of this.bufret.values()) lyd.pause()
    this.bufret.clear()
  }
}
