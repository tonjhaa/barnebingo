import { expect, test } from '@playwright/test'
import { Hovedskjerm, lukkAlleKontekster, Telefon } from './bingo'

/**
 * At lydfilene faktisk finnes der nettleseren leter.
 *
 * De andre lydtestene ser på underteksten, som står der uansett om lyden virker.
 * Denne ser på nettverket i stedet: et klipp som mangler gir 404, og appen
 * faller stille tilbake på nettleserstemmen uten å si fra. Det er nettopp en
 * feil som ikke merkes før noen sitter i sofaen og lurer på hvorfor stemmen
 * plutselig ble en annen midt i en setning.
 */

test.afterEach(lukkAlleKontekster)

test('henter klipp, effekt og musikk uten manglende filer', async ({ browser }) => {
  const vert = await Hovedskjerm.åpne(browser)
  const svar: Array<{ fil: string; status: number }> = []
  vert.page.on('response', (r) => {
    const url = r.url()
    if (url.includes('/lyd/')) svar.push({ fil: url.split('/lyd/')[1], status: r.status() })
  })

  const kode = await vert.lagRom({ format: '75-tallsbingo', nivå: 'Normal' })
  const ada = await Telefon.bliMed(browser, kode, 'Ada')
  await ada.meldKlar()
  await vert.startSpillet()
  await vert.trekk()
  await vert.ventPåTrekk(1)

  // Klippene hentes etter hvert som setningen spilles, ikke alle på én gang.
  // Derfor ventes det på begge to framfor å lese av på et bestemt tidspunkt.
  await expect
    .poll(
      () => ({
        tall: svar.some((s) => /^tall-\d+\.mp3$/.test(s.fil)),
        effekt: svar.some((s) => s.fil === 'effekt/trekk.wav'),
      }),
      { timeout: 15000 },
    )
    .toEqual({ tall: true, effekt: true })

  const mangler = svar.filter((s) => s.status >= 400)
  expect(mangler, `Manglende filer: ${JSON.stringify(mangler)}`).toEqual([])
})
