import {
  expect,
  devices,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test'

/**
 * Kontekstene testene lager, så de kan lukkes etterpå. Playwright rydder ikke
 * opp i kontekster man lager selv fra `browser` — uten dette hoper de seg opp
 * med levende socketer gjennom hele kjøringen, og de siste testene kjemper om
 * ressursene med alle de forrige.
 */
const åpneKontekster: BrowserContext[] = []

function husk(context: BrowserContext): BrowserContext {
  åpneKontekster.push(context)
  return context
}

/** Kalles fra en afterEach. */
export async function lukkAlleKontekster(): Promise<void> {
  await Promise.all(åpneKontekster.splice(0).map((c) => c.close().catch(() => undefined)))
}

/**
 * Sidemodeller for E2E. Hver «telefon» er en egen nettleserkontekst med sin egen
 * localStorage — det er det som gjør fire spillere og én vert til fire ekte
 * enheter, ikke fire faner som deler nøkler.
 */

/** Testdata, ikke lenger noe appen kjenner til. */
export const SPILLERE = ['Ada', 'Bo', 'Cleo', 'Dina'] as const
export type Spillernavn = string

export interface Innstillinger {
  format?: 'Barnebingo' | '75-tallsbingo' | '90-tallsbingo'
  nivå?: 'Nybegynner' | 'Enkel' | 'Normal' | 'Vanskelig'
  brett?: 1 | 2 | 3
  markering?: 'Selv' | 'Med hint' | 'Automatisk'
  bingo?: 'Selv' | 'Knappen lyser' | 'Automatisk'
  stadier?: string[]
}

export class Hovedskjerm {
  constructor(readonly page: Page) {}

  static async åpne(browser: Browser): Promise<Hovedskjerm> {
    const context = husk(
      await browser.newContext({ viewport: { width: 1440, height: 1000 } }),
    )
    const page = await context.newPage()
    await page.goto('/')
    return new Hovedskjerm(page)
  }

  async lagRom(innstillinger: Innstillinger = {}): Promise<string> {
    await this.page.getByRole('button', { name: 'Lag nytt spillrom' }).click()
    await expect(this.page.getByRole('heading', { name: 'Sett opp spillet' })).toBeVisible()
    await this.velg(innstillinger)
    await this.page.getByRole('button', { name: 'Åpne lobbyen' }).click()
    // Et ferskt rom har ingen spillere. Uten denne vakten kunne en test som
    // havnet i feil rom brukt to minutter på å oppdage det.
    await expect(this.page.getByText('Venter på spillere…')).toBeVisible()
    return this.romkode()
  }

  private async velg(innstillinger: Innstillinger): Promise<void> {
    const { page } = this

    // Nivået nullstiller overstyringer, så det må settes før alt annet.
    if (innstillinger.nivå) {
      await page.getByRole('radio', { name: innstillinger.nivå, exact: true }).click()
    }
    if (innstillinger.format) {
      await page.getByRole('radio', { name: innstillinger.format, exact: true }).click()
    }
    if (innstillinger.brett) {
      await page
        .getByRole('radiogroup', { name: 'Brett per spiller' })
        .getByRole('radio', { name: String(innstillinger.brett), exact: true })
        .click()
    }
    if (innstillinger.markering) {
      await page
        .getByRole('radiogroup', { name: 'Markering' })
        .getByRole('radio', { name: innstillinger.markering, exact: true })
        .click()
    }
    if (innstillinger.bingo) {
      await page
        .getByRole('radiogroup', { name: 'Bingo', exact: true })
        .getByRole('radio', { name: innstillinger.bingo, exact: true })
        .click()
    }
    if (innstillinger.stadier) {
      const ønsket = new Set(innstillinger.stadier)
      // Hvert klikk må ha slått inn før neste leses av. Uten ventingen leste
      // testen en avhuking som React ennå ikke hadde tegnet om, og tok feil
      // beslutning på boksen etter — med en varm server slo det til hver gang.
      for (const boks of await page.getByRole('checkbox').all()) {
        const navn = (await boks.getAttribute('aria-label')) ?? ''
        const skalVære = ønsket.has(navn)
        if (((await boks.getAttribute('aria-checked')) === 'true') === skalVære) continue
        await boks.click()
        await expect(boks).toHaveAttribute('aria-checked', String(skalVære))
      }
    }
  }

  async romkode(): Promise<string> {
    const kode = this.page.locator('p.font-mono').first()
    await expect(kode).toBeVisible()
    return (await kode.innerText()).trim()
  }

  async startSpillet(): Promise<void> {
    const knapp = this.page.getByRole('button', { name: 'Start spillet' })
    await expect(knapp).toBeEnabled()
    await knapp.click()
    // Vent på trekktelleren, ikke på «Vi spiller om» — den teksten står også i
    // lobbyens regelliste, så den ville sluppet testen videre for tidlig.
    await expect(this.page.getByText(/\d+ av \d+ trukket/)).toBeVisible()
  }

  async trekk(): Promise<void> {
    await this.page.getByRole('button', { name: 'Trekk neste tall' }).click()
  }

  /**
   * Er det flere tall igjen? Knappen forsvinner når runden er ferdig — og den
   * kan forsvinne mellom to spørsmål, så vi bruker `isVisible`, som svarer med
   * en gang i stedet for å vente på et element som aldri kommer tilbake.
   */
  async kanTrekke(): Promise<boolean> {
    return this.page
      .getByRole('button', { name: 'Trekk neste tall' })
      .first()
      .isVisible()
      .catch(() => false)
  }

  async antallTrukket(): Promise<number> {
    const tekst = await this.page.getByText(/\d+ av \d+ trukket/).innerText()
    return Number(tekst.match(/(\d+) av/)?.[1] ?? 0)
  }

  /**
   * Venter på at trekk nummer N har landet. Premievisningen tar over hele
   * skjermen når noen vinner, og da finnes telleren ikke lenger — det er et
   * gyldig utfall av et trekk, ikke en feil.
   */
  async ventPåTrekk(antall: number): Promise<void> {
    await this.page.waitForFunction(
      (n) => {
        const tekst = document.body.innerText
        return tekst.includes(`${n} av `) || tekst.includes('har bingo!')
      },
      antall,
      { timeout: 15_000 },
    )
  }

  premie() {
    return this.page.getByText('har bingo!')
  }

  async fortsett(): Promise<void> {
    await this.page.getByRole('button', { name: 'Fortsett spillet' }).click()
  }

  async premiestadium(): Promise<string> {
    return (await this.page.getByText(/^Vi spiller om /).innerText()).replace(
      'Vi spiller om ',
      '',
    )
  }
}

export class Telefon {
  constructor(
    readonly page: Page,
    readonly navn: Spillernavn,
  ) {}

  /**
   * Blir med og tar bildevalget. Kameraet finnes ikke i en hodeløs nettleser,
   * så telefonene velger dyret sitt — akkurat som et barn som ikke vil bli
   * fotografert. `medSelfie` finnes for testen som skal innom kameraet.
   */
  static async bliMed(
    browser: Browser,
    kode: string,
    navn: Spillernavn,
  ): Promise<Telefon> {
    const telefon = await Telefon.velgNavn(browser, kode, navn)
    await telefon.velgAvatar()
    return telefon
  }

  /** Stopper på bildesteget, uten å ha valgt noe ennå. */
  static async velgNavn(
    browser: Browser,
    kode: string,
    navn: Spillernavn,
  ): Promise<Telefon> {
    const context = husk(await browser.newContext({ ...devices['iPhone 13'] }))
    const page = await context.newPage()
    await page.goto(`/bli-med/${kode}`)
    await page.getByRole('textbox', { name: 'Navnet ditt' }).fill(navn)
    await page.getByRole('button', { name: 'Bli med' }).click()
    await expect(page.getByRole('button', { name: /^Ta bilde/ })).toBeVisible()
    return new Telefon(page, navn)
  }

  async velgAvatar(): Promise<void> {
    await this.page.getByRole('button', { name: /^Bruk / }).click()
    await expect(this.page.getByRole('button', { name: 'Jeg er klar!' })).toBeVisible()
  }

  async meldKlar(): Promise<void> {
    await this.page.getByRole('button', { name: 'Jeg er klar!' }).click()
    await expect(this.page.getByText('Du er klar!')).toBeVisible()
  }

  /** Antall hele rader på det åpne brettet, slik telefonen viser det. */
  async heleRader(): Promise<number> {
    const tekst = await this.page.getByText(/\d+ av \d+ · \d+ hele rader/).innerText()
    return Number(tekst.match(/(\d+) hele rader/)?.[1] ?? 0)
  }

  async kryss(): Promise<number> {
    const tekst = await this.page.getByText(/\d+ av \d+ · \d+ hele rader/).innerText()
    return Number(tekst.match(/^(\d+) av/)?.[1] ?? 0)
  }

  rute(tall: number) {
    return this.page.getByRole('button', { name: new RegExp(`^${tall}(,|$)`) })
  }

  ruter() {
    return this.page.getByRole('button', { name: /^\d+(,|$)/ })
  }

  /** Tallene på det åpne brettet, lest av rutene selv. */
  async brettTall(): Promise<number[]> {
    const merkelapper = await this.ruter().evaluateAll((noder) =>
      noder.map((node) => node.getAttribute('aria-label') ?? ''),
    )
    return merkelapper.map((merkelapp) => Number(merkelapp.split(',')[0]))
  }

  async harTall(tall: number): Promise<boolean> {
    return (await this.rute(tall).count()) > 0
  }

  async trukketTall(): Promise<number | null> {
    const felt = this.page.getByText('Nå trukket')
    if ((await felt.count()) === 0) return null
    const tekst = await felt.locator('..').innerText()
    return Number(tekst.match(/(\d+)\s*$/)?.[1] ?? 0) || null
  }

  async ropBingo(): Promise<void> {
    await this.page.getByRole('button', { name: 'BINGO!' }).click()
  }

  async lukk(): Promise<void> {
    await this.page.context().close()
  }
}

/**
 * Trekker helt til betingelsen slår til. Feiler tydelig og raskt hvis kula blir
 * tom først — uten denne vakten ville testen ventet på et tall nummer 41 av 40
 * og brukt to minutter på å si det.
 */
export async function trekkTil(
  vert: Hovedskjerm,
  ferdig: () => Promise<boolean>,
  maksTrekk = 95,
): Promise<number> {
  for (let i = 1; i <= maksTrekk; i++) {
    if (await ferdig()) return i - 1
    if (!(await vert.kanTrekke())) {
      throw new Error(`Kula ble tom etter ${i - 1} trekk uten at betingelsen slo til`)
    }
    await vert.trekk()
    await vert.ventPåTrekk(i)
  }
  if (await ferdig()) return maksTrekk
  throw new Error(`Betingelsen slo ikke til på ${maksTrekk} trekk`)
}
