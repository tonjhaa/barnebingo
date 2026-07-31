import { expect, test } from '@playwright/test'
import { Hovedskjerm, lukkAlleKontekster, Telefon, trekkTil } from './bingo'

/**
 * Lyden gjennom en hel runde.
 *
 * Testene ser på underteksten, ikke på lyden. Det er med vilje: i en hodeløs
 * nettleser finnes ingen høyttaler, og lydfilene er kanskje ikke generert.
 * Underteksten er den samme strengen som leses opp, så den forteller nøyaktig
 * hva programlederen sa — og at den står der, er i seg selv et krav (§13:
 * lyd er aldri eneste informasjonskilde).
 */

test.afterEach(lukkAlleKontekster)

/** Det programlederen sier nå. Tom streng når det er stille. */
async function undertekst(vert: Hovedskjerm): Promise<string> {
  const felt = vert.page.locator('[data-undertekst]')
  if ((await felt.count()) === 0) return ''
  return (await felt.first().innerText()).trim()
}

/** Venter til programlederen sier noe som passer. */
async function ventPåTale(vert: Hovedskjerm, passer: RegExp, timeout = 15000) {
  await expect
    .poll(async () => undertekst(vert), { timeout })
    .toMatch(passer)
}

test.describe('programlederen', () => {
  test('leser opp tallet med bokstav og sifre i 75-formatet', async ({ browser }) => {
    const vert = await Hovedskjerm.åpne(browser)
    const kode = await vert.lagRom({ format: '75-tallsbingo', nivå: 'Normal' })
    const ada = await Telefon.bliMed(browser, kode, 'Ada')
    await ada.meldKlar()
    await vert.startSpillet()

    await vert.trekk()
    // «B tolv en to», eventuelt med en innledning foran.
    await ventPåTale(vert, /\b[BINGO]\b.*\b(én|to|tre|fire|fem|seks|sju|åtte|ni|ti|elleve|tolv|tretten|fjorten|femten|seksten|sytten|atten|nitten|tjue|tretti|førti|femti|seksti|sytti)/i)
  })

  test('leser tosifrede tall som helt tall og deretter sifre', async ({ browser }) => {
    const vert = await Hovedskjerm.åpne(browser)
    const kode = await vert.lagRom({ format: '90-tallsbingo', nivå: 'Normal' })
    const ada = await Telefon.bliMed(browser, kode, 'Ada')
    await ada.meldKlar()
    await vert.startSpillet()

    // Åttien av de nitti tallene er tosifrede, så noen få trekk holder. Vi
    // samler opp alt som blir sagt framfor å lese av på ett bestemt tidspunkt:
    // underteksten skifter når neste replikk begynner, ikke når testen ser.
    const sagt: string[] = []
    const TOSIFRET =
      /(ti|elleve|tolv|tretten|fjorten|femten|seksten|sytten|atten|nitten|tjue|tretti|førti|femti|seksti|sytti|åtti|nitti)\S*\s+(null|en|to|tre|fire|fem|seks|sju|åtte|ni)\s+(null|en|to|tre|fire|fem|seks|sju|åtte|ni)\b/i

    for (let i = 1; i <= 8 && !sagt.some((linje) => TOSIFRET.test(linje)); i++) {
      await vert.trekk()
      await vert.ventPåTrekk(i)
      await expect
        .poll(
          async () => {
            const nå = await undertekst(vert)
            if (nå && !sagt.includes(nå)) sagt.push(nå)
            return sagt.length
          },
          { timeout: 15000 },
        )
        .toBeGreaterThanOrEqual(i)
    }

    // «Femtiåtte fem åtte»: det hele tallet, så sifrene hver for seg.
    expect(sagt.filter((linje) => TOSIFRET.test(linje)).length, sagt.join(' | ')).toBeGreaterThan(0)
  })

  test('sier ingenting når verten slår av lyden', async ({ browser }) => {
    const vert = await Hovedskjerm.åpne(browser)
    const kode = await vert.lagRom({ format: 'Barnebingo', nivå: 'Enkel' })
    const ada = await Telefon.bliMed(browser, kode, 'Ada')
    await ada.meldKlar()
    await vert.startSpillet()

    await vert.page.getByRole('button', { name: 'Slå av lyd' }).click()
    await vert.trekk()
    await vert.ventPåTrekk(1)

    // Litt slingringsmonn: teksten skal bli borte, ikke bare aldri komme.
    await expect.poll(async () => undertekst(vert), { timeout: 5000 }).toBe('')
  })

  test('bytter til rolig læringsmodus når verten ber om det', async ({ browser }) => {
    const vert = await Hovedskjerm.åpne(browser)
    const kode = await vert.lagRom({ format: 'Barnebingo', nivå: 'Enkel' })
    const ada = await Telefon.bliMed(browser, kode, 'Ada')
    await ada.meldKlar()
    await vert.startSpillet()

    await vert.page.getByRole('button', { name: 'Lydinnstillinger' }).click()
    await vert.page.getByRole('button', { name: 'Rolig læringsmodus' }).click()
    await expect(
      vert.page.getByRole('radiogroup', { name: 'Historier' }).getByRole('radio', { name: 'Av' }),
    ).toHaveAttribute('aria-checked', 'true')
    await expect(
      vert.page
        .getByRole('radiogroup', { name: 'Gjenta tallet' })
        .getByRole('radio', { name: 'Gjenta tallet' }),
    ).toHaveAttribute('aria-checked', 'true')

    await vert.trekk()
    // Læringsmodus gjentar tallet til slutt: samme ord først og sist.
    await expect
      .poll(async () => undertekst(vert), { timeout: 15000 })
      .toMatch(/^(\S+).*\1$/i)
  })
})

test.describe('gjennom en hel runde', () => {
  test('sier fra ved bomtrykk, bingo og slutt', async ({ browser }) => {
    const vert = await Hovedskjerm.åpne(browser)
    const kode = await vert.lagRom({
      format: 'Barnebingo',
      nivå: 'Enkel',
      // Automatisk markering, så testen slipper å trykke seg gjennom brettet
      // for å komme fram til det som faktisk testes: hva som blir sagt.
      markering: 'Automatisk',
      bingo: 'Selv',
    })
    const ada = await Telefon.bliMed(browser, kode, 'Ada')
    await ada.meldKlar()
    await vert.startSpillet()

    // Bomtrykk før noe er trukket. Svaret skal være vennlig, uten navnet.
    await ada.ropBingo()
    await ventPåTale(vert, /ennå|forsøk|mangler|fare|nesten/i)
    expect(await undertekst(vert)).not.toContain('Ada')

    // Spill fram til én hel rad.
    await trekkTil(vert, async () => (await ada.heleRader()) >= 1)
    await ada.ropBingo()

    // Premien skal annonseres på hovedskjermen. Flere stadier står igjen, så
    // vi blir stående på premievisningen i stedet for å hoppe til resultatet.
    await expect(vert.premie()).toBeVisible({ timeout: 15000 })
    await ventPåTale(vert, /stemmer|riktig|fantastisk|vinner|bingo/i)
  })

  test('holder telefonen stille', async ({ browser }) => {
    const vert = await Hovedskjerm.åpne(browser)
    const kode = await vert.lagRom({ format: 'Barnebingo', nivå: 'Enkel' })
    const ada = await Telefon.bliMed(browser, kode, 'Ada')
    await ada.meldKlar()
    await vert.startSpillet()
    await vert.trekk()
    await vert.ventPåTrekk(1)

    // Lyd hører hjemme på hovedskjermen (§13). Telefonen sier ingenting, og
    // har derfor heller ingen undertekst.
    expect(await ada.page.locator('[data-undertekst]').count()).toBe(0)
    expect(await vert.page.locator('[data-undertekst]').count()).toBe(1)
  })
})
