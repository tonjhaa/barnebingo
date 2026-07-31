'use client'

/**
 * Ferdiginnspilt opplesning.
 *
 * Tallene leses fra små lydklipp i stedet for av nettleserens talesyntese.
 * Det gir samme stemme på alle skjermer — en TV, en gammel PC, en iPad — i
 * stedet for at kvaliteten avhenger av hvilke stemmer akkurat den maskinen
 * har installert.
 *
 * «B tolv» settes sammen av to klipp: bokstaven og tallet. Det holder antallet
 * filer nede fra 165 til 96, og pausen imellom er den samme en bingovert
 * ville lagt inn uansett.
 */

const MAPPE = '/lyd'

export type Klipp = string

/** Filnavnene et trukket tall skal spilles som, i rekkefølge. */
export function klippForTall(value: number, letter: string | null): Klipp[] {
  return letter ? [letter.toLowerCase(), String(value)] : ['nummer', String(value)]
}

/** Premiestadier har hver sin ferdige setning. */
export function klippForStadium(stageId: string): Klipp[] {
  return [`stadium-${stageId}`]
}

export const KLIPP_BINGO: Klipp[] = ['bingo']

/**
 * Spiller klipp etter hverandre. Et nytt tall avbryter et gammelt — man skal
 * aldri høre forrige tall lest opp etter at det neste er trukket.
 */
export class Lydkø {
  private aktiv: HTMLAudioElement | null = null
  private avbrutt = false
  private bufret = new Map<string, HTMLAudioElement>()

  /** Sant hvis lydfilene finnes. Er de ikke generert ennå, faller vi tilbake. */
  private tilgjengelig: boolean | null = null

  async harLyd(): Promise<boolean> {
    if (this.tilgjengelig !== null) return this.tilgjengelig
    try {
      const svar = await fetch(`${MAPPE}/bingo.mp3`, { method: 'HEAD' })
      this.tilgjengelig = svar.ok
    } catch {
      this.tilgjengelig = false
    }
    return this.tilgjengelig
  }

  stopp(): void {
    this.avbrutt = true
    this.aktiv?.pause()
    this.aktiv = null
  }

  async spill(klipp: Klipp[]): Promise<void> {
    this.stopp()
    this.avbrutt = false

    for (const navn of klipp) {
      if (this.avbrutt) return
      await this.spillEtt(navn)
    }
  }

  private spillEtt(navn: string): Promise<void> {
    return new Promise((resolve) => {
      let lyd = this.bufret.get(navn)
      if (!lyd) {
        lyd = new Audio(`${MAPPE}/${navn}.mp3`)
        lyd.preload = 'auto'
        this.bufret.set(navn, lyd)
      }

      this.aktiv = lyd
      lyd.currentTime = 0
      // En manglende fil skal ikke stoppe resten av setningen.
      lyd.onended = () => resolve()
      lyd.onerror = () => resolve()
      void lyd.play().catch(() => resolve())
    })
  }

  /** Et stumt spill gir nettleseren brukertrykket den krever. */
  async låsOpp(): Promise<void> {
    const stille = new Audio(`${MAPPE}/nummer.mp3`)
    stille.volume = 0
    await stille.play().catch(() => undefined)
    stille.pause()
  }
}
