import { higherPriority, PRIORITY_ORDER, type Priority } from './events'

/**
 * Lydkøen.
 *
 * To ting skal aldri skje: at to replikker snakker i munnen på hverandre, og at
 * en vits står i veien for et trukket tall. Køen løser begge ved å være ett
 * enkelt spor med prioritet — det som spilles kan bli avbrutt av noe viktigere,
 * og det som venter kastes hvis det ble uaktuelt mens det sto i kø.
 *
 * Logikken er skilt fra avspillingen med vilje. En kø som eier `new Audio()`
 * kan bare testes i en nettleser, og da testes den ikke.
 */

/**
 * En bit av en replikk: et filnavn og de samme ordene skrevet ut.
 *
 * Begge deler følger med hele veien fordi den som spiller lyden kan være to
 * forskjellige ting. Er lydfilene generert, brukes `id`. Er de ikke det, leser
 * nettleserens egen stemme `tekst`. Uten teksten ville en app uten genererte
 * filer vært stum, og det er akkurat den tilstanden en utvikler jobber i.
 */
export interface Klippdel {
  id: string
  tekst: string
}

export interface Utspill {
  /** Bitene som spilles etter hverandre, uten pause imellom. */
  deler: Klippdel[]
  /** Hele replikken som én setning. Brukes til teksting. */
  text: string
  priority: Priority
  /**
   * Kan et viktigere utspill kutte dette midt i setningen? Et trukket tall skal
   * kunne kuttes av en godkjent bingo. En premieutdeling skal ikke kuttes av
   * noe som helst.
   */
  interruptible?: boolean
}

/** Den delen som faktisk lager lyd. Byttes ut i test og uten lydfiler. */
export interface Klippspiller {
  /** Løser når biten er ferdig — eller straks, hvis fila mangler. */
  spill(del: Klippdel): Promise<void>
  stopp(): void
  forhåndslast?(del: Klippdel): void
}

export interface KøLytter {
  /** Kalles når køen begynner å snakke. Musikken dempes her. */
  påTaleStart?(utspill: Utspill): void
  /** Kalles når det ble stille igjen. Musikken kommer tilbake. */
  påTaleSlutt?(): void
}

export class Lydkø {
  private ventende: Utspill[] = []
  private aktiv: Utspill | null = null
  /** Økes ved hvert avbrudd, så en avbrutt avspilling vet at den er forbi. */
  private generasjon = 0
  private kjører = false

  constructor(
    private readonly spiller: Klippspiller,
    private readonly lytter: KøLytter = {},
  ) {}

  get snakker(): boolean {
    return this.aktiv !== null
  }

  /** Det som spilles nå, for teksting og for utviklingspanelet. */
  get nå(): Utspill | null {
    return this.aktiv
  }

  get køLengde(): number {
    return this.ventende.length
  }

  /**
   * Setter et utspill i kø.
   *
   * Er det viktigere enn det som spilles, tar det over med én gang — og alt som
   * sto i kø med lavere prioritet kastes, siden det uansett handlet om et
   * øyeblikk som er over.
   */
  si(utspill: Utspill): void {
    if (this.aktiv && higherPriority(utspill.priority, this.aktiv.priority)) {
      if (this.aktiv.interruptible !== false) {
        this.ventende = this.ventende.filter(
          (venter) => !higherPriority(utspill.priority, venter.priority),
        )
        this.ventende.unshift(utspill)
        this.avbryt()
        return
      }
    }

    this.ventende.push(utspill)
    // Viktigst først. Array.sort er stabil, så like viktige utspill beholder
    // rekkefølgen de kom i.
    this.ventende.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])
    this.forhåndslastNeste()
    void this.kjør()
  }

  /** Kaster alt som venter, men lar det som spilles snakke ferdig. */
  tømKø(): void {
    this.ventende = []
  }

  /** Full stopp. Brukes når verten slår av lyden eller skjermen forlates. */
  stopp(): void {
    this.ventende = []
    this.avbryt()
  }

  /**
   * Det neste som skal sies lastes mens det forrige spiller. Uten dette får
   * hver overgang et lite hull der fila hentes, og programlederen høres
   * nølende ut i stedet for øvet.
   */
  private forhåndslastNeste(): void {
    const neste = this.ventende[0]?.deler[0]
    if (neste) this.spiller.forhåndslast?.(neste)
  }

  private avbryt(): void {
    const snakket = this.aktiv !== null
    this.generasjon++
    this.spiller.stopp()
    this.aktiv = null
    this.kjører = false
    if (snakket) this.lytter.påTaleSlutt?.()
    void this.kjør()
  }

  private async kjør(): Promise<void> {
    if (this.kjører) return
    this.kjører = true

    while (this.ventende.length > 0) {
      const utspill = this.ventende.shift()!
      const min = ++this.generasjon
      this.aktiv = utspill
      this.lytter.påTaleStart?.(utspill)

      this.forhåndslastNeste()

      for (const del of utspill.deler) {
        // En manglende fil skal ikke stoppe resten av setningen, og en feil i
        // lyden skal aldri kunne stoppe bingospillet.
        await this.spiller.spill(del).catch(() => undefined)
        if (this.generasjon !== min) break
      }

      if (this.generasjon === min) {
        this.aktiv = null
        this.lytter.påTaleSlutt?.()
      } else {
        // Vi ble avbrutt. Den som avbrøt har allerede satt i gang neste runde.
        return
      }
    }

    this.kjører = false
  }
}
