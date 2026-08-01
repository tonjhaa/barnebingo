import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { alleKlipp, klippEtterId } from '@/content'
import type { Klipp } from '@/content/typer'
import {
  innholdsnøkkel,
  MANIFESTFIL,
  VoiceAssetService,
  type Manifest,
} from '@/server/tts/VoiceAssetService'
import {
  elevenlabsSpråk,
  escapeXml,
  lagLeverandør,
  NØKKELVARIABEL,
} from '@/server/tts/leverandorer'
import { LEVERANDØRER, type Stemmeoppsett, type TextToSpeechProvider } from '@/server/tts/provider'
import { stemmeoppsett } from '@/server/tts/stemme'

const OPPSETT: Stemmeoppsett = {
  leverandør: 'elevenlabs',
  stemme: 'stemme-a',
  modell: 'modell-1',
  språk: 'nb-NO',
  instruksjon: 'vennlig',
}

/** En leverandør som teller kall i stedet for å ringe ut på nettet. */
function testleverandør(overstyr: { feilPå?: string } = {}) {
  const kall: string[] = []
  const provider: TextToSpeechProvider = {
    id: 'elevenlabs',
    navn: 'Test',
    format: 'mp3',
    async syntetiser({ tekst }) {
      kall.push(tekst)
      if (overstyr.feilPå && tekst.includes(overstyr.feilPå)) {
        throw new Error('nettverket falt ut')
      }
      return Buffer.from(`lyd:${tekst}`)
    },
  }
  return { provider, kall }
}

let mappe: string

beforeEach(async () => {
  mappe = await mkdtemp(join(tmpdir(), 'barnebingo-lyd-'))
})

afterEach(async () => {
  await rm(mappe, { recursive: true, force: true })
})

async function lesManifest(): Promise<Manifest> {
  return JSON.parse(await readFile(join(mappe, MANIFESTFIL), 'utf8')) as Manifest
}

describe('innholdsnøkkelen', () => {
  it('gir samme nøkkel for samme tekst og oppsett', () => {
    expect(innholdsnøkkel('Sju', OPPSETT)).toBe(innholdsnøkkel('Sju', OPPSETT))
  })

  it('gir ulik nøkkel for ulik tekst', () => {
    expect(innholdsnøkkel('Sju', OPPSETT)).not.toBe(innholdsnøkkel('Åtte', OPPSETT))
  })

  it('skiller på alt som kan høres', () => {
    const grunn = innholdsnøkkel('Sju', OPPSETT)
    const varianter: Array<Partial<Stemmeoppsett>> = [
      { stemme: 'stemme-b' },
      { modell: 'modell-2' },
      { språk: 'nn-NO' },
      { instruksjon: 'streng' },
      { fart: 1.2 },
      { leverandør: 'openai' },
    ]
    for (const variant of varianter) {
      expect(innholdsnøkkel('Sju', { ...OPPSETT, ...variant }), JSON.stringify(variant)).not.toBe(
        grunn,
      )
    }
  })
})

describe('generering og cache', () => {
  const klipp: Klipp[] = [
    { id: 'tall-7', tekst: 'Sju' },
    { id: 'tall-8', tekst: 'Åtte' },
  ]

  it('lager klippene første gang', async () => {
    const { provider, kall } = testleverandør()
    const tjeneste = new VoiceAssetService(mappe, OPPSETT, provider)

    const resultat = await tjeneste.sikreAlle(klipp)

    expect(resultat.laget).toEqual(['tall-7', 'tall-8'])
    expect(kall).toEqual(['Sju', 'Åtte'])
    expect(await readFile(join(mappe, 'tall-7.mp3'), 'utf8')).toBe('lyd:Sju')
  })

  it('lager ikke det samme to ganger', async () => {
    const { provider, kall } = testleverandør()
    await new VoiceAssetService(mappe, OPPSETT, provider).sikreAlle(klipp)

    const resultat = await new VoiceAssetService(mappe, OPPSETT, provider).sikreAlle(klipp)

    expect(resultat.gjenbrukt).toEqual(['tall-7', 'tall-8'])
    expect(resultat.laget).toEqual([])
    expect(kall).toHaveLength(2)
  })

  it('lager på nytt når teksten er endret', async () => {
    const { provider, kall } = testleverandør()
    await new VoiceAssetService(mappe, OPPSETT, provider).sikreAlle(klipp)

    const endret = [{ id: 'tall-7', tekst: 'Sju!' }, klipp[1]]
    const resultat = await new VoiceAssetService(mappe, OPPSETT, provider).sikreAlle(endret)

    expect(resultat.laget).toEqual(['tall-7'])
    expect(kall).toEqual(['Sju', 'Åtte', 'Sju!'])
  })

  it('lager alt på nytt når stemmen er byttet', async () => {
    const { provider } = testleverandør()
    await new VoiceAssetService(mappe, OPPSETT, provider).sikreAlle(klipp)

    const nyStemme = { ...OPPSETT, stemme: 'stemme-b' }
    const resultat = await new VoiceAssetService(mappe, nyStemme, provider).sikreAlle(klipp)

    // Ellers ville halve kvelden hatt gammel stemme og halve ny.
    expect(resultat.laget).toEqual(['tall-7', 'tall-8'])
  })

  it('lager klippet på nytt når fila er borte, selv om manifestet står', async () => {
    const { provider } = testleverandør()
    await new VoiceAssetService(mappe, OPPSETT, provider).sikreAlle(klipp)
    await rm(join(mappe, 'tall-7.mp3'))

    const resultat = await new VoiceAssetService(mappe, OPPSETT, provider).sikreAlle(klipp)
    expect(resultat.laget).toEqual(['tall-7'])
  })

  it('lar én feil stå igjen alene i stedet for å ta med seg resten', async () => {
    const { provider } = testleverandør({ feilPå: 'Åtte' })
    const resultat = await new VoiceAssetService(mappe, OPPSETT, provider).sikreAlle(klipp)

    expect(resultat.laget).toEqual(['tall-7'])
    expect(resultat.feilet.map((f) => f.id)).toEqual(['tall-8'])
    // Det som gikk gjennom er lagret, så neste kjøring tar bare resten.
    expect((await lesManifest()).klipp['tall-7']).toBeDefined()
  })

  it('sier tydelig fra når det ikke finnes noen leverandør', async () => {
    const tjeneste = new VoiceAssetService(mappe, OPPSETT, null)
    const resultat = await tjeneste.sikreAlle(klipp)
    expect(resultat.laget).toEqual([])
    expect(resultat.feilet).toHaveLength(2)
    expect(resultat.feilet[0].feil).toContain('stemmeleverandør')
  })

  it('skriver et manifest som kan leses av mennesker', async () => {
    const { provider } = testleverandør()
    await new VoiceAssetService(mappe, OPPSETT, provider).sikreAlle(klipp)

    const manifest = await lesManifest()
    expect(manifest.versjon).toBe(1)
    expect(Object.keys(manifest.klipp)).toEqual(['tall-7', 'tall-8'])
    expect(manifest.klipp['tall-7']).toMatchObject({
      id: 'tall-7',
      tekst: 'Sju',
      stemme: 'stemme-a',
      modell: 'modell-1',
    })
    expect(manifest.klipp['tall-7'].bytes).toBeGreaterThan(0)
  })

  it('tåler et ødelagt manifest uten å miste filene', async () => {
    const { provider } = testleverandør()
    await new VoiceAssetService(mappe, OPPSETT, provider).sikreAlle(klipp)
    await writeFile(join(mappe, MANIFESTFIL), 'ikke json')

    const resultat = await new VoiceAssetService(mappe, OPPSETT, provider).sikreAlle(klipp)
    expect(resultat.laget).toEqual(['tall-7', 'tall-8'])
  })

  it('sender bare teksten til leverandøren', async () => {
    // Ingen romkode, ingen spiller-id, ingen IP-adresse (§21).
    const sett: unknown[] = []
    const provider: TextToSpeechProvider = {
      id: 'elevenlabs',
      navn: 'Test',
      format: 'mp3',
      async syntetiser(bestilling) {
        sett.push(bestilling)
        return Buffer.from('x')
      },
    }
    await new VoiceAssetService(mappe, OPPSETT, provider).sikreAlle([klipp[0]])

    expect(sett).toEqual([{ tekst: 'Sju', oppsett: OPPSETT }])
  })
})

describe('leverandørvalg', () => {
  it('velger ElevenLabs som standard', () => {
    expect(stemmeoppsett({}).leverandør).toBe('elevenlabs')
  })

  it('lar stemmen settes i miljøet, ikke i koden', () => {
    const oppsett = stemmeoppsett({ TTS_VOICE: 'min-stemme', TTS_MODEL: 'min-modell' })
    expect(oppsett.stemme).toBe('min-stemme')
    expect(oppsett.modell).toBe('min-modell')
  })

  it('har en standardstemme for hver leverandør', () => {
    for (const leverandør of LEVERANDØRER) {
      const oppsett = stemmeoppsett({ TTS_PROVIDER: leverandør })
      expect(oppsett.leverandør, leverandør).toBe(leverandør)
      expect(oppsett.stemme, leverandør).toBeTruthy()
      expect(oppsett.modell, leverandør).toBeTruthy()
    }
  })

  it('faller tilbake på standard ved ukjent leverandør', () => {
    expect(stemmeoppsett({ TTS_PROVIDER: 'tull' }).leverandør).toBe('elevenlabs')
  })

  it('gir ingen leverandør uten nøkkel, og det er ikke en feil', () => {
    expect(lagLeverandør(stemmeoppsett({}), {})).toBeNull()
  })

  it('bygger hver leverandør når nøkkelen finnes', () => {
    for (const leverandør of LEVERANDØRER) {
      const bygd = lagLeverandør(stemmeoppsett({ TTS_PROVIDER: leverandør }), {
        [NØKKELVARIABEL[leverandør]]: 'hemmelig',
      })
      expect(bygd?.id, leverandør).toBe(leverandør)
    }
  })

  it('utelater språkkoden for modeller som ikke tar imot den', () => {
    // eleven_multilingual_v2 avviser hele forespørselen hvis language_code er
    // med. Den gjenkjenner språket fra teksten selv.
    expect(elevenlabsSpråk('eleven_multilingual_v2', 'nb-NO')).toBeNull()
  })

  it('forkorter språkkoden til ISO 639-1 for modeller som tar imot den', () => {
    // ElevenLabs vil ha «nb», ikke «nb-NO». De tre andre leverandørene vil ha
    // lokaliteten, så oversettelsen hører hjemme i ElevenLabs-adapteren.
    expect(elevenlabsSpråk('eleven_turbo_v2_5', 'nb-NO')).toBe('nb')
    expect(elevenlabsSpråk('eleven_flash_v2_5', 'NB-no')).toBe('nb')
  })

  it('escaper tekst som skal inn i SSML', () => {
    // Et spillernavn er data, ikke markup (§20).
    expect(escapeXml('Ada & <Bo>')).toBe('Ada &amp; &lt;Bo&gt;')
  })
})

describe('klippregisteret', () => {
  it('samler alt som skal genereres', () => {
    const ider = alleKlipp().map((k) => k.id)
    expect(ider).toContain('tall-90')
    expect(ider).toContain('siffer-0')
    expect(ider).toContain('bokstav-b')
    expect(ider).toContain('intro-1')
    expect(ider).toContain('sys-starter')
    expect(ider).toContain('navn-klara')
  })

  it('har ingen dobbelte id-er', () => {
    const ider = alleKlipp().map((k) => k.id)
    expect(new Set(ider).size).toBe(ider.length)
  })

  it('gir hvert klipp en tekst som kan leses opp', () => {
    for (const klipp of alleKlipp()) {
      expect(klipp.tekst.trim(), klipp.id).not.toBe('')
      // Ingen siffer skal nå leverandøren — de skal være skrevet ut.
      expect(klipp.tekst, klipp.id).not.toMatch(/\d/)
    }
  })

  it('kan slås opp på id', () => {
    expect(klippEtterId().get('tall-42')?.tekst).toBe('Førtito')
  })
})
