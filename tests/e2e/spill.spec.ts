import { expect, test } from '@playwright/test'
import { Hovedskjerm, lukkAlleKontekster, SPILLERE, Telefon, trekkTil } from './bingo'

/**
 * Ende-til-ende med ekte nettlesere: én hovedskjerm og opptil fire telefoner,
 * hver i sin egen kontekst med sin egen localStorage. Det er dette som skiller
 * testene her fra integrasjonstestene — her finnes QR-koden, trykkflatene og
 * gjenopprettingsnøkkelen på ordentlig.
 */

// Uten dette lever hver tests nettleserkontekster videre ut kjøringen.
test.afterEach(lukkAlleKontekster)

test.describe('lobbyen', () => {
  test('fire spillere kobler seg til og blir klare', async ({ browser }) => {
    const vert = await Hovedskjerm.åpne(browser)
    const kode = await vert.lagRom({ format: 'Barnebingo', nivå: 'Enkel' })
    expect(kode).toMatch(/^[A-HJ-NP-Z2-9]{4}$/)

    const telefoner: Telefon[] = []
    for (const navn of SPILLERE) {
      telefoner.push(await Telefon.bliMed(browser, kode, navn))
      await expect(
        vert.page.getByText(navn, { exact: true }).first(),
      ).toBeVisible()
    }

    // Startknappen skal ikke virke før alle faktisk er klare.
    await expect(vert.page.getByRole('button', { name: 'Start spillet' })).toBeDisabled()
    for (const telefon of telefoner) await telefon.meldKlar()

    await expect(vert.page.getByText('Alle er klare!')).toBeVisible()
    await expect(vert.page.getByRole('button', { name: 'Start spillet' })).toBeEnabled()
  })

  test('bildesteget kommer mellom navnet og klar-knappen', async ({ browser }) => {
    const vert = await Hovedskjerm.åpne(browser)
    const kode = await vert.lagRom({ format: 'Barnebingo' })
    const klara = await Telefon.velgNavn(browser, kode, 'Klara')

    await expect(klara.page.getByText('Hei, Klara!')).toBeVisible()
    await expect(klara.page.getByRole('button', { name: 'Jeg er klar!' })).toHaveCount(0)

    // Kameraet finnes ikke i en hodeløs nettleser. Appen skal si det vennlig og
    // la spilleren gå videre med dyret sitt (§14).
    await klara.page.getByRole('button', { name: /^Ta bilde/ }).click()
    await expect(klara.page.getByRole('alert')).toBeVisible()

    await klara.velgAvatar()
    await expect(klara.page.getByRole('button', { name: 'Jeg er klar!' })).toBeVisible()
  })

  test('valget huskes gjennom en reconnect', async ({ browser }) => {
    const vert = await Hovedskjerm.åpne(browser)
    const kode = await vert.lagRom({ format: 'Barnebingo' })
    const klara = await Telefon.bliMed(browser, kode, 'Klara')

    const context = klara.page.context()
    await klara.page.close()
    const nySide = await context.newPage()
    await nySide.goto(`/bli-med/${kode}`)

    // Spilleren skal ikke sendes tilbake til kameraet fordi telefonen låste seg.
    await expect(nySide.getByRole('button', { name: 'Jeg er klar!' })).toBeVisible()
    await expect(nySide.getByRole('button', { name: /^Ta bilde/ })).toHaveCount(0)
  })

  test('en opptatt plass krever at verten sier ja', async ({ browser }) => {
    const vert = await Hovedskjerm.åpne(browser)
    const kode = await vert.lagRom({ format: 'Barnebingo' })
    await Telefon.bliMed(browser, kode, 'Klara')

    const andre = await browser.newContext()
    const side = await andre.newPage()
    await side.goto(`/bli-med/${kode}`)
    await expect(side.getByText('Opptatt — trykk om det er deg')).toBeVisible()

    // Et trykk gir ikke plassen — det spør verten (§23).
    await side.getByRole('button', { name: /^Klara/ }).click()
    await expect(side.getByText('Venter på verten…')).toBeVisible()
    await expect(side.getByRole('button', { name: 'Jeg er klar!' })).toHaveCount(0)
  })
})

test.describe('75-tallsbingo', () => {
  test('gir tre brett med B-I-N-G-O og lar spilleren bytte mellom dem', async ({
    browser,
  }) => {
    const vert = await Hovedskjerm.åpne(browser)
    const kode = await vert.lagRom({
      format: '75-tallsbingo',
      nivå: 'Normal',
      brett: 3,
      markering: 'Selv',
    })
    const klara = await Telefon.bliMed(browser, kode, 'Klara')
    await klara.meldKlar()
    await vert.startSpillet()

    await expect(klara.brettFaner()).toHaveCount(3)
    for (const bokstav of ['B', 'I', 'N', 'G', 'O']) {
      await expect(klara.page.getByText(bokstav, { exact: true }).first()).toBeVisible()
    }

    await klara.byttBrett(2)
    await expect(klara.page.getByRole('tab', { name: /^Brett 2/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    await klara.byttBrett(1)
    await expect(klara.page.getByRole('tab', { name: /^Brett 1/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  test('lar spilleren markere et trukket tall, men ikke et utrukket', async ({
    browser,
  }) => {
    const vert = await Hovedskjerm.åpne(browser)
    const kode = await vert.lagRom({
      format: '75-tallsbingo',
      nivå: 'Normal',
      markering: 'Selv',
    })
    const klara = await Telefon.bliMed(browser, kode, 'Klara')
    await klara.meldKlar()
    await vert.startSpillet()

    // Trekk til et tall på brettet dukker opp.
    let trukket = 0
    await trekkTil(vert, async () => {
      const tall = await klara.trukketTall()
      if (tall && (await klara.harTall(tall))) {
        trukket = tall
        return true
      }
      return false
    })
    expect(trukket).toBeGreaterThan(0)

    await klara.rute(trukket).click()
    await expect(klara.rute(trukket)).toHaveAttribute('aria-pressed', 'true')
    expect(await klara.kryss()).toBe(1)

    // Trekkingen stoppet ved det første tallet som sto på brettet, så alle de
    // andre tallene på brettet er garantert utrukne. De skal ikke feste seg.
    const utrukket = (await klara.brettTall()).find((n) => n !== trukket)!
    expect(utrukket).toBeGreaterThan(0)

    await klara.rute(utrukket).click()
    await expect(klara.rute(utrukket)).toHaveAttribute('aria-pressed', 'false')
    expect(await klara.kryss()).toBe(1)
  })
})

test.describe('90-tallsbingo', () => {
  test('gir et 3 × 9-brett med femten tall og tomme ruter', async ({ browser }) => {
    const vert = await Hovedskjerm.åpne(browser)
    const kode = await vert.lagRom({
      format: '90-tallsbingo',
      nivå: 'Normal',
      markering: 'Selv',
    })
    const klara = await Telefon.bliMed(browser, kode, 'Klara')
    await klara.meldKlar()
    await vert.startSpillet()

    // Femten tall betyr femten trykkbare ruter; resten er hull i mønsteret.
    await expect(klara.ruter()).toHaveCount(15)
    expect(await klara.kryss()).toBe(0)

    // Formatet har ikke kolonneoverskrifter, og heller ikke tre-rader-premien.
    await expect(vert.page.getByText('Premie 1 av 3')).toBeVisible()
  })
})

test.describe('en hel runde', () => {
  test('fire spillere spiller til noen roper bingo og premien går videre', async ({
    browser,
  }) => {
    const vert = await Hovedskjerm.åpne(browser)
    const kode = await vert.lagRom({
      format: 'Barnebingo',
      nivå: 'Enkel',
      markering: 'Automatisk',
      bingo: 'Selv',
    })

    const telefoner: Telefon[] = []
    for (const navn of SPILLERE) {
      const telefon = await Telefon.bliMed(browser, kode, navn)
      await telefon.meldKlar()
      telefoner.push(telefon)
    }
    await vert.startSpillet()
    expect(await vert.premiestadium()).toBe('Én rad')

    let vinner: Telefon | undefined
    await trekkTil(vert, async () => {
      for (const telefon of telefoner) {
        if ((await telefon.heleRader()) >= 1) {
          vinner = telefon
          return true
        }
      }
      return false
    })

    expect(vinner, 'ingen fikk en hel rad på 60 trekk').toBeDefined()

    // Leses før bingoen: premieskjermen tar over telefonen og viser ikke brettet.
    const førKryss = await vinner!.kryss()
    await vinner!.ropBingo()

    await expect(vert.premie()).toBeVisible()
    await expect(vert.page.getByText(vinner!.navn, { exact: true })).toBeVisible()
    await expect(vinner!.page.getByText('Du vant!')).toBeVisible()

    // Neste stadium fortsetter på de samme brettene, med krysseneisbehold.
    await vert.fortsett()
    expect(await vert.premiestadium()).toBe('To rader')
    await expect(vinner!.page.getByText('Vi spiller om')).toBeVisible()
    expect(await vinner!.kryss()).toBe(førKryss)
  })

  test('lar to som roper nesten samtidig vinne sammen', async ({ browser }) => {
    const vert = await Hovedskjerm.åpne(browser)
    const kode = await vert.lagRom({
      format: 'Barnebingo',
      nivå: 'Enkel',
      markering: 'Automatisk',
      bingo: 'Selv',
    })
    const klara = await Telefon.bliMed(browser, kode, 'Klara')
    const edvin = await Telefon.bliMed(browser, kode, 'Edvin')
    await klara.meldKlar()
    await edvin.meldKlar()
    await vert.startSpillet()

    await trekkTil(
      vert,
      async () => (await klara.heleRader()) >= 1 && (await edvin.heleRader()) >= 1,
    )

    // Bingo-vinduet skal fange begge, selv om den ene er et halvsekund treg.
    await Promise.all([klara.ropBingo(), edvin.ropBingo()])

    await expect(vert.premie()).toBeVisible()
    await expect(vert.page.getByText('Klara', { exact: true })).toBeVisible()
    await expect(vert.page.getByText('Edvin', { exact: true })).toBeVisible()
  })

  test('roper bingo selv når verten har valgt automatisk vinner', async ({
    browser,
  }) => {
    const vert = await Hovedskjerm.åpne(browser)
    const kode = await vert.lagRom({ format: 'Barnebingo', nivå: 'Nybegynner' })
    const klara = await Telefon.bliMed(browser, kode, 'Klara')
    await klara.meldKlar()
    await vert.startSpillet()

    // Ingen trykker BINGO her — serveren kårer vinneren selv.
    await trekkTil(vert, async () => vert.premie().isVisible())

    await expect(vert.premie()).toBeVisible()
    await expect(klara.page.getByText('Du vant!')).toBeVisible()
  })
})

test.describe('overtakelse av en plass', () => {
  test('verten kan slippe inn en ny telefon på Klaras plass', async ({ browser }) => {
    const vert = await Hovedskjerm.åpne(browser)
    const kode = await vert.lagRom({ format: 'Barnebingo' })
    const klara = await Telefon.bliMed(browser, kode, 'Klara')
    await klara.meldKlar()

    // Telefonen er borte for godt: ny kontekst, ingen nøkkel i localStorage.
    await klara.lukk()
    const nyKontekst = await browser.newContext()
    const nySide = await nyKontekst.newPage()
    await nySide.goto(`/bli-med/${kode}`)

    await nySide.getByRole('button', { name: /^Klara/ }).click()
    await expect(nySide.getByText('Venter på verten…')).toBeVisible()

    await expect(vert.page.getByText('En telefon vil overta plassen til')).toBeVisible()
    await vert.page.getByRole('button', { name: 'Slipp inn' }).click()

    // Den nye telefonen er inne, med plassen og bildevalget i behold.
    await expect(nySide.getByRole('button', { name: /Jeg er klar|Vent litt/ })).toBeVisible()
    await expect(vert.page.getByText('En telefon vil overta plassen til')).toHaveCount(0)
  })

  test('verten kan si nei', async ({ browser }) => {
    const vert = await Hovedskjerm.åpne(browser)
    const kode = await vert.lagRom({ format: 'Barnebingo' })
    await Telefon.bliMed(browser, kode, 'Klara')

    const fremmed = await browser.newContext()
    const side = await fremmed.newPage()
    await side.goto(`/bli-med/${kode}`)
    await side.getByRole('button', { name: /^Klara/ }).click()

    await expect(vert.page.getByText('En telefon vil overta plassen til')).toBeVisible()
    await vert.page.getByRole('button', { name: 'Nei' }).click()

    await expect(side.getByText('Venter på verten…')).toHaveCount(0)
    await expect(vert.page.getByText('En telefon vil overta plassen til')).toHaveCount(0)
  })
})

test.describe('nettverk og feilbruk', () => {
  test('en spiller som mister telefonen får brettet sitt tilbake', async ({
    browser,
  }) => {
    const vert = await Hovedskjerm.åpne(browser)
    const kode = await vert.lagRom({
      format: 'Barnebingo',
      nivå: 'Enkel',
      markering: 'Automatisk',
    })
    const klara = await Telefon.bliMed(browser, kode, 'Klara')
    await klara.meldKlar()
    await vert.startSpillet()

    await vert.trekk()
    await vert.ventPåTrekk(1)
    const førKryss = await klara.kryss()

    // Telefonen låser seg og appen lastes på nytt. Nøkkelen ligger i
    // localStorage, så spilleren skal rett tilbake i spillet.
    const context = klara.page.context()
    await klara.page.close()
    await expect(
      vert.page.getByText('Frakoblet', { exact: true }).first(),
    ).toBeVisible()

    const nySide = await context.newPage()
    await nySide.goto(`/bli-med/${kode}`)
    const tilbake = new Telefon(nySide, 'Klara')

    await expect(nySide.getByText('Vi spiller om')).toBeVisible()
    expect(await tilbake.kryss()).toBe(førKryss)
    await expect(vert.page.getByText('Frakoblet', { exact: true })).toHaveCount(0)
  })

  test('verten som hamrer på trekk-knappen får ett tall per trykk', async ({
    browser,
  }) => {
    const vert = await Hovedskjerm.åpne(browser)
    const kode = await vert.lagRom({ format: 'Barnebingo', nivå: 'Enkel' })
    const klara = await Telefon.bliMed(browser, kode, 'Klara')
    await klara.meldKlar()
    await vert.startSpillet()

    for (let i = 0; i < 5; i++) await vert.trekk()

    await vert.ventPåTrekk(5)
    expect(await vert.antallTrukket()).toBe(5)

    // Fire tidligere tall pluss det gjeldende, alle forskjellige.
    const tidligere = await vert.page.locator('ol li').allInnerTexts()
    expect(tidligere).toHaveLength(4)
    expect(new Set(tidligere).size).toBe(4)
  })

  test('en tilfeldig telefon kan ikke trekke eller starte spillet', async ({
    browser,
  }) => {
    const vert = await Hovedskjerm.åpne(browser)
    const kode = await vert.lagRom({ format: 'Barnebingo' })
    await Telefon.bliMed(browser, kode, 'Klara')

    // Uten vertsnøkkel i localStorage er vertssiden stengt.
    const fremmed = await browser.newContext()
    const side = await fremmed.newPage()
    const romId = vert.page.url().split('/vert/')[1]
    await side.goto(`/vert/${romId}`)
    await expect(side.getByText('Dette er ikke ditt rom')).toBeVisible()
  })
})
