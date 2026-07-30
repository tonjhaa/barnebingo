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
    const ada = await Telefon.velgNavn(browser, kode, 'Ada')

    await expect(ada.page.getByText('Hei, Ada!')).toBeVisible()
    await expect(ada.page.getByRole('button', { name: 'Jeg er klar!' })).toHaveCount(0)

    // Kameraet finnes ikke i en hodeløs nettleser. Appen skal si det vennlig og
    // la spilleren gå videre med dyret sitt (§14).
    await ada.page.getByRole('button', { name: /^Ta bilde/ }).click()
    await expect(ada.page.getByRole('alert')).toBeVisible()

    await ada.velgAvatar()
    await expect(ada.page.getByRole('button', { name: 'Jeg er klar!' })).toBeVisible()
  })

  test('valget huskes gjennom en reconnect', async ({ browser }) => {
    const vert = await Hovedskjerm.åpne(browser)
    const kode = await vert.lagRom({ format: 'Barnebingo' })
    const ada = await Telefon.bliMed(browser, kode, 'Ada')

    const context = ada.page.context()
    await ada.page.close()
    const nySide = await context.newPage()
    await nySide.goto(`/bli-med/${kode}`)

    // Spilleren skal ikke sendes tilbake til kameraet fordi telefonen låste seg.
    await expect(nySide.getByRole('button', { name: 'Jeg er klar!' })).toBeVisible()
    await expect(nySide.getByRole('button', { name: /^Ta bilde/ })).toHaveCount(0)
  })

  test('et navn som er i bruk krever at verten sier ja', async ({ browser }) => {
    const vert = await Hovedskjerm.åpne(browser)
    const kode = await vert.lagRom({ format: 'Barnebingo' })
    await Telefon.bliMed(browser, kode, 'Ada')

    const andre = await browser.newContext()
    const side = await andre.newPage()
    await side.goto(`/bli-med/${kode}`)
    await expect(side.getByText('Med fra før: Ada')).toBeVisible()

    // Skriver du et navn som allerede er i bruk, får du ikke plassen — du
    // spør verten (§23).
    await side.getByRole('textbox', { name: 'Navnet ditt' }).fill('Ada')
    await expect(side.getByText('Ada er allerede med.')).toBeVisible()
    await side.getByRole('button', { name: 'Det er meg — spør verten' }).click()
    await expect(side.getByText('Spør verten…')).toBeVisible()
    await expect(side.getByRole('button', { name: 'Jeg er klar!' })).toHaveCount(0)
  })

  test('lar spilleren skrive sitt eget navn', async ({ browser }) => {
    const vert = await Hovedskjerm.åpne(browser)
    const kode = await vert.lagRom({ format: 'Barnebingo' })
    const bjørn = await Telefon.bliMed(browser, kode, 'Bjørn-Ove')
    await bjørn.meldKlar()

    // Navnet finnes ingen steder i koden — det kom fra telefonen.
    await expect(vert.page.getByText('Bjørn-Ove', { exact: true })).toBeVisible()
  })
})

test.describe('75-tallsbingo', () => {
  test('viser alle tre brettene under hverandre, med B-I-N-G-O', async ({
    browser,
  }) => {
    const vert = await Hovedskjerm.åpne(browser)
    const kode = await vert.lagRom({
      format: '75-tallsbingo',
      nivå: 'Normal',
      brett: 3,
      markering: 'Selv',
    })
    const ada = await Telefon.bliMed(browser, kode, 'Ada')
    await ada.meldKlar()
    await vert.startSpillet()

    // Tre brett à 24 tall, alle på siden samtidig — ingen faner å bla i.
    await expect(ada.ruter()).toHaveCount(72)
    for (const nummer of [1, 2, 3]) {
      await expect(ada.page.getByText(`Brett ${nummer}`, { exact: true })).toBeVisible()
    }
    for (const bokstav of ['B', 'I', 'N', 'G', 'O']) {
      await expect(ada.page.getByText(bokstav, { exact: true }).first()).toBeVisible()
    }
    await expect(ada.page.getByRole('tab')).toHaveCount(0)
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
    const ada = await Telefon.bliMed(browser, kode, 'Ada')
    await ada.meldKlar()
    await vert.startSpillet()

    // Trekk til et tall på brettet dukker opp.
    let trukket = 0
    await trekkTil(vert, async () => {
      const tall = await ada.trukketTall()
      if (tall && (await ada.harTall(tall))) {
        trukket = tall
        return true
      }
      return false
    })
    expect(trukket).toBeGreaterThan(0)

    await ada.rute(trukket).click()
    await expect(ada.rute(trukket)).toHaveAttribute('aria-pressed', 'true')
    expect(await ada.kryss()).toBe(1)

    // Trekkingen stoppet ved det første tallet som sto på brettet, så alle de
    // andre tallene på brettet er garantert utrukne. De skal ikke feste seg.
    const utrukket = (await ada.brettTall()).find((n) => n !== trukket)!
    expect(utrukket).toBeGreaterThan(0)

    await ada.rute(utrukket).click()
    await expect(ada.rute(utrukket)).toHaveAttribute('aria-pressed', 'false')
    expect(await ada.kryss()).toBe(1)
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
    const ada = await Telefon.bliMed(browser, kode, 'Ada')
    await ada.meldKlar()
    await vert.startSpillet()

    // Femten tall betyr femten trykkbare ruter; resten er hull i mønsteret.
    await expect(ada.ruter()).toHaveCount(15)
    expect(await ada.kryss()).toBe(0)

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
    const ada = await Telefon.bliMed(browser, kode, 'Ada')
    const edvin = await Telefon.bliMed(browser, kode, 'Bo')
    await ada.meldKlar()
    await edvin.meldKlar()
    await vert.startSpillet()

    await trekkTil(
      vert,
      async () => (await ada.heleRader()) >= 1 && (await edvin.heleRader()) >= 1,
    )

    // Bingo-vinduet skal fange begge, selv om den ene er et halvsekund treg.
    await Promise.all([ada.ropBingo(), edvin.ropBingo()])

    await expect(vert.premie()).toBeVisible()
    await expect(vert.page.getByText('Ada', { exact: true })).toBeVisible()
    await expect(vert.page.getByText('Bo', { exact: true })).toBeVisible()
  })

  test('roper bingo selv når verten har valgt automatisk vinner', async ({
    browser,
  }) => {
    const vert = await Hovedskjerm.åpne(browser)
    const kode = await vert.lagRom({ format: 'Barnebingo', nivå: 'Nybegynner' })
    const ada = await Telefon.bliMed(browser, kode, 'Ada')
    await ada.meldKlar()
    await vert.startSpillet()

    // Ingen trykker BINGO her — serveren kårer vinneren selv.
    await trekkTil(vert, async () => vert.premie().isVisible())

    await expect(vert.premie()).toBeVisible()
    await expect(ada.page.getByText('Du vant!')).toBeVisible()
  })
})

test.describe('overtakelse av en plass', () => {
  test('verten kan slippe inn en ny telefon på Adas plass', async ({ browser }) => {
    const vert = await Hovedskjerm.åpne(browser)
    const kode = await vert.lagRom({ format: 'Barnebingo' })
    const ada = await Telefon.bliMed(browser, kode, 'Ada')
    await ada.meldKlar()

    // Telefonen er borte for godt: ny kontekst, ingen nøkkel i localStorage.
    await ada.lukk()
    const nyKontekst = await browser.newContext()
    const nySide = await nyKontekst.newPage()
    await nySide.goto(`/bli-med/${kode}`)

    await nySide.getByRole('textbox', { name: 'Navnet ditt' }).fill('Ada')
    await nySide.getByRole('button', { name: 'Det er meg — spør verten' }).click()
    await expect(nySide.getByText('Spør verten…')).toBeVisible()

    await expect(vert.page.getByText('En telefon vil overta plassen til')).toBeVisible()
    await vert.page.getByRole('button', { name: 'Slipp inn' }).click()

    // Den nye telefonen er inne, med plassen og bildevalget i behold.
    await expect(nySide.getByRole('button', { name: /Jeg er klar|Vent litt/ })).toBeVisible()
    await expect(vert.page.getByText('En telefon vil overta plassen til')).toHaveCount(0)
  })

  test('verten kan si nei', async ({ browser }) => {
    const vert = await Hovedskjerm.åpne(browser)
    const kode = await vert.lagRom({ format: 'Barnebingo' })
    await Telefon.bliMed(browser, kode, 'Ada')

    const fremmed = await browser.newContext()
    const side = await fremmed.newPage()
    await side.goto(`/bli-med/${kode}`)
    await side.getByRole('textbox', { name: 'Navnet ditt' }).fill('Ada')
    await side.getByRole('button', { name: 'Det er meg — spør verten' }).click()

    await expect(vert.page.getByText('En telefon vil overta plassen til')).toBeVisible()
    await vert.page.getByRole('button', { name: 'Nei' }).click()

    await expect(side.getByText('Spør verten…')).toHaveCount(0)
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
    const ada = await Telefon.bliMed(browser, kode, 'Ada')
    await ada.meldKlar()
    await vert.startSpillet()

    await vert.trekk()
    await vert.ventPåTrekk(1)
    const førKryss = await ada.kryss()

    // Telefonen låser seg og appen lastes på nytt. Nøkkelen ligger i
    // localStorage, så spilleren skal rett tilbake i spillet.
    const context = ada.page.context()
    await ada.page.close()
    await expect(
      vert.page.getByText('Frakoblet', { exact: true }).first(),
    ).toBeVisible()

    const nySide = await context.newPage()
    await nySide.goto(`/bli-med/${kode}`)
    const tilbake = new Telefon(nySide, 'Ada')

    await expect(nySide.getByText('Vi spiller om')).toBeVisible()
    expect(await tilbake.kryss()).toBe(førKryss)
    await expect(vert.page.getByText('Frakoblet', { exact: true })).toHaveCount(0)
  })

  test('verten som hamrer på trekk-knappen får ett tall per trykk', async ({
    browser,
  }) => {
    const vert = await Hovedskjerm.åpne(browser)
    const kode = await vert.lagRom({ format: 'Barnebingo', nivå: 'Enkel' })
    const ada = await Telefon.bliMed(browser, kode, 'Ada')
    await ada.meldKlar()
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
    await Telefon.bliMed(browser, kode, 'Ada')

    // Uten vertsnøkkel i localStorage er vertssiden stengt.
    const fremmed = await browser.newContext()
    const side = await fremmed.newPage()
    const romId = vert.page.url().split('/vert/')[1]
    await side.goto(`/vert/${romId}`)
    await expect(side.getByText('Dette er ikke ditt rom')).toBeVisible()
  })
})
