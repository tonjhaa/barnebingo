import { describe, expect, it } from 'vitest'
import type { GameEventData } from '@/domain/audio/events'
import {
  faseFor,
  SpeechDirector,
  STANDARD_TALE,
  type TaleInnstillinger,
} from '@/domain/audio/speech'
import { MAKS_TALL, sifferOrd, tallOrd } from '@/content/tall'
import { FRASEKLIPP } from '@/content/fraser'
import { navnKlippId } from '@/content/navn'
import { VARIANTKLIPP } from '@/content/tallvarianter'
import { seededRng } from '@/domain/rng'

function regissør(over: Partial<TaleInnstillinger> = {}, seed = 1, harNavn?: (n: string) => boolean) {
  return new SpeechDirector({ ...STANDARD_TALE, ...over }, seededRng(seed), { harNavn })
}

function trekk(value: number, letter: string | null = null, drawnCount = 1, remaining = 89): GameEventData {
  return { kind: 'numberDrawn', value, letter, drawnCount, remaining }
}

/** Klippene i det som ble sagt, som én streng — enklere å lese i påstander. */
function klippene(director: SpeechDirector, event: GameEventData): string[] {
  return director.taleFor(event)?.deler.map((del) => del.id) ?? []
}

describe('norske tallord', () => {
  it('skriver ut hvert tall fra 1 til 90', () => {
    for (let n = 1; n <= MAKS_TALL; n++) {
      expect(tallOrd(n), `tall ${n}`).toMatch(/^[a-zæøåé]+$/)
    }
  })

  it('bruker den trykksterke formen for tallet én og den trykklette som siffer', () => {
    expect(tallOrd(1)).toBe('én')
    expect(sifferOrd(1)).toBe('en')
  })

  it('skriver sammensatte tall i ett ord', () => {
    expect(tallOrd(21)).toBe('tjueen')
    expect(tallOrd(34)).toBe('trettifire')
    expect(tallOrd(58)).toBe('femtiåtte')
    expect(tallOrd(75)).toBe('syttifem')
  })

  it('skriver runde tiere uten ener', () => {
    expect(tallOrd(20)).toBe('tjue')
    expect(tallOrd(70)).toBe('sytti')
    expect(tallOrd(90)).toBe('nitti')
  })

  it('har et eget ord for null, som bare finnes som siffer', () => {
    expect(sifferOrd(0)).toBe('null')
    expect(tallOrd(10)).toBe('ti')
  })
})

describe('opplesning av tall', () => {
  it('leser ensifrede tall som «Sju … nummer sju»', () => {
    const d = regissør({ nivå: 'enkel' })
    expect(klippene(d, trekk(7))).toEqual(['tall-7', 'nummer-7'])
    expect(d.taleFor(trekk(7))!.text).toBe('Sju nummer sju')
  })

  it('leser tosifrede tall som helt tall og deretter sifrene', () => {
    const d = regissør({ nivå: 'enkel' })
    expect(klippene(d, trekk(21))).toEqual(['tall-21', 'siffer-2', 'siffer-1'])
    expect(d.taleFor(trekk(58))!.text).toBe('Femtiåtte fem åtte')
  })

  it('leser null som siffer i tall som slutter på null', () => {
    const d = regissør({ nivå: 'enkel' })
    expect(klippene(d, trekk(70))).toEqual(['tall-70', 'siffer-7', 'siffer-0'])
    expect(d.taleFor(trekk(90))!.text).toBe('Nitti ni null')
  })

  it('gir hvert tall fra 1 til 90 en gyldig opplesning', () => {
    const d = regissør({ nivå: 'enkel' })
    for (let n = 1; n <= MAKS_TALL; n++) {
      const utspill = d.taleFor(trekk(n))!
      expect(utspill.deler[0].id, `tall ${n}`).toBe(`tall-${n}`)
      expect(utspill.deler.length, `tall ${n}`).toBeGreaterThanOrEqual(2)
      expect(utspill.text.toLowerCase(), `tall ${n}`).toContain(tallOrd(n))
    }
  })

  it('sier bare det hele tallet når verten har valgt det', () => {
    const d = regissør({ nivå: 'enkel', tallopplesning: 'helt' })
    expect(klippene(d, trekk(58))).toEqual(['tall-58'])
    expect(klippene(d, trekk(7))).toEqual(['tall-7'])
  })

  it('leser sifrene også i læringsmodus, uansett hva som ellers er valgt', () => {
    const d = regissør({ nivå: 'rolig', tallopplesning: 'helt' })
    expect(klippene(d, trekk(34))).toEqual(['tall-34', 'siffer-3', 'siffer-4'])
  })

  it('gjentar tallet til slutt når hjelpen er slått på', () => {
    const d = regissør({ nivå: 'enkel', gjentaTallet: true })
    expect(klippene(d, trekk(34))).toEqual(['tall-34', 'siffer-3', 'siffer-4', 'tall-34'])
  })
})

describe('B–I–N–G–O', () => {
  it('setter bokstaven foran tallet som standard', () => {
    const d = regissør({ nivå: 'enkel' })
    expect(klippene(d, trekk(12, 'B'))).toEqual(['bokstav-b', 'tall-12', 'siffer-1', 'siffer-2'])
    expect(d.taleFor(trekk(12, 'B'))!.text).toBe('B Tolv en to')
  })

  it('kan sette bokstaven etter tallet', () => {
    const d = regissør({ nivå: 'enkel', bokstav: 'etter' })
    expect(klippene(d, trekk(58, 'G'))).toEqual(['tall-58', 'bokstav-g', 'siffer-5', 'siffer-8'])
  })

  it('kan la bokstaven være helt', () => {
    const d = regissør({ nivå: 'enkel', bokstav: 'av' })
    expect(klippene(d, trekk(12, 'B'))).toEqual(['tall-12', 'siffer-1', 'siffer-2'])
  })

  it('nevner ingen bokstav i 90-formatet, som ikke har noen', () => {
    const d = regissør({ nivå: 'enkel' })
    expect(klippene(d, trekk(68, null))).toEqual(['tall-68', 'siffer-6', 'siffer-8'])
  })
})

describe('variasjon', () => {
  it('bruker ikke samme innledning to ganger på rad', () => {
    const d = regissør({ nivå: 'gameshow' }, 7)
    let forrige: string | null = null

    for (let i = 0; i < 200; i++) {
      const clips = klippene(d, trekk(30 + (i % 40), null, 5, 85))
      const først = clips[0]
      const innledning = først.startsWith('intro-') || først.startsWith('variant-') ? først : null
      if (innledning && forrige) expect(innledning).not.toBe(forrige)
      forrige = innledning
    }
  })

  it('varierer formuleringen mellom trekk', () => {
    const d = regissør({ nivå: 'gameshow' }, 3)
    const setninger = new Set<string>()
    for (let i = 0; i < 40; i++) {
      setninger.add(klippene(d, trekk(42, null, 5, 85)).join('|'))
    }
    expect(setninger.size).toBeGreaterThan(5)
  })

  it('gir samme opplesning for samme seed', () => {
    const a = regissør({ nivå: 'gameshow' }, 99)
    const b = regissør({ nivå: 'gameshow' }, 99)
    for (let i = 0; i < 30; i++) {
      expect(klippene(a, trekk(i + 1, null, i, 90 - i))).toEqual(
        klippene(b, trekk(i + 1, null, i, 90 - i)),
      )
    }
  })

  it('gir ulik opplesning for ulike seed', () => {
    const a = regissør({ nivå: 'gameshow' }, 1)
    const b = regissør({ nivå: 'gameshow' }, 2)
    const enA = Array.from({ length: 20 }, () => klippene(a, trekk(40, null, 5, 85)).join())
    const enB = Array.from({ length: 20 }, () => klippene(b, trekk(40, null, 5, 85)).join())
    expect(enA).not.toEqual(enB)
  })

  it('sier aldri noe som gjør tallet utydelig', () => {
    // Uansett hvor mye pynt som velges, skal det hele tallet alltid være med.
    const d = regissør({ nivå: 'gameshow' }, 5)
    for (let i = 0; i < 300; i++) {
      const n = (i % MAKS_TALL) + 1
      expect(klippene(d, trekk(n, null, i % 60, 60 - (i % 60)))).toContain(`tall-${n}`)
    }
  })

  it('holder seg kort på enkelt nivå', () => {
    const d = regissør({ nivå: 'enkel' }, 5)
    for (let i = 0; i < 50; i++) {
      const clips = klippene(d, trekk(42, null, i, 48))
      expect(clips.every((id) => !id.startsWith('intro-') && !id.startsWith('slutt-'))).toBe(true)
    }
  })

  it('snakker mindre når runden nærmer seg slutten', () => {
    const tidlig = regissør({ nivå: 'gameshow' }, 11)
    const sent = regissør({ nivå: 'gameshow' }, 11)

    const lengde = (d: SpeechDirector, drawn: number, igjen: number) =>
      Array.from({ length: 60 }, () => klippene(d, trekk(42, null, drawn, igjen)).length).reduce(
        (sum, n) => sum + n,
        0,
      )

    expect(lengde(sent, 55, 5)).toBeLessThan(lengde(tidlig, 2, 58))
  })
})

describe('dramaturgi', () => {
  it('deler runden i tre faser', () => {
    expect(faseFor(0, 90)).toBe('tidlig')
    expect(faseFor(30, 60)).toBe('midt')
    expect(faseFor(70, 20)).toBe('sent')
  })

  it('tåler at runden ikke har begynt', () => {
    expect(faseFor(0, 0)).toBe('tidlig')
  })
})

describe('navn', () => {
  it('bruker navnet når klippet finnes', () => {
    const d = regissør({}, 1, () => true)
    const utspill = d.taleFor({ kind: 'playerReady', name: 'Klara', readyCount: 1, playerCount: 3 })!
    expect(utspill.deler[0].id).toBe(navnKlippId('Klara'))
    expect(utspill.text).toContain('Klara')
  })

  it('formulerer seg uten navn når klippet mangler', () => {
    const d = regissør({}, 1, () => false)
    const utspill = d.taleFor({ kind: 'playerReady', name: 'Klara', readyCount: 1, playerCount: 3 })!
    expect(utspill.deler.some((del) => del.id.startsWith('navn-'))).toBe(false)
    expect(utspill.text).not.toContain('Klara')
  })

  it('sier ingen navn når verten har slått det av', () => {
    const d = regissør({ lesNavn: false }, 1, () => true)
    const utspill = d.taleFor({ kind: 'bingoApproved', names: ['Klara'], stageLabel: 'Én rad', isFinalStage: false })!
    expect(utspill.deler.some((del) => del.id.startsWith('navn-'))).toBe(false)
    expect(utspill.text).toContain('vinner')
  })

  it('lager filnavn uten æ, ø og å', () => {
    expect(navnKlippId('Åse')).toBe('navn-aase')
    expect(navnKlippId('Bjørn')).toBe('navn-bjoern')
    expect(navnKlippId('Kjæ Ra')).toBe('navn-kjae-ra')
  })

  it('henger aldri ut et barn som trykket feil', () => {
    const d = regissør({}, 1, () => true)
    const utspill = d.taleFor({ kind: 'bingoRejected', name: 'Klara' })!
    expect(utspill.text).not.toContain('Klara')
  })
})

describe('vertens innstillinger', () => {
  it('tier helt når programlederen er av', () => {
    const d = regissør({ modus: 'av' })
    expect(d.taleFor(trekk(42))).toBeNull()
    expect(d.taleFor({ kind: 'paused' })).toBeNull()
  })

  it('sier bare tall i tallmodus', () => {
    const d = regissør({ modus: 'bareTall' })
    expect(d.taleFor(trekk(42))).not.toBeNull()
    expect(d.taleFor({ kind: 'paused' })).toBeNull()
    expect(d.taleFor({ kind: 'allReady', playerCount: 2 })).toBeNull()
  })
})

describe('prioritet og avbrudd', () => {
  it('lar premien snakke ferdig', () => {
    const d = regissør()
    const premie = d.taleFor({ kind: 'bingoApproved', names: ['Klara'], stageLabel: 'Én rad', isFinalStage: false })!
    expect(premie.priority).toBe('kritisk')
    expect(premie.interruptible).toBe(false)
  })

  it('lar et tall kunne avbrytes av noe viktigere', () => {
    const d = regissør()
    const tall = d.taleFor(trekk(42))!
    expect(tall.priority).toBe('høy')
    expect(tall.interruptible).toBe(true)
  })
})

describe('alle hendelser', () => {
  const alle: GameEventData[] = [
    { kind: 'roomOpened' },
    { kind: 'playerJoined', name: 'Klara' },
    { kind: 'playerReady', name: 'Edvin', readyCount: 1, playerCount: 2 },
    { kind: 'allReady', playerCount: 2 },
    { kind: 'roundStarted', names: ['Klara', 'Edvin'], stageLabel: 'Én rad', roundNumber: 1 },
    { kind: 'stageAnnounced', stageLabel: 'To rader', stageIndex: 1, isFinalStage: false },
    { kind: 'numberDrawn', value: 42, letter: null, drawnCount: 1, remaining: 89 },
    { kind: 'paused' },
    { kind: 'resumed' },
    { kind: 'bingoClaimed', name: 'Klara' },
    { kind: 'bingoRejected', name: 'Klara' },
    { kind: 'bingoApproved', names: ['Klara'], stageLabel: 'Én rad', isFinalStage: false },
    { kind: 'drawExhausted' },
    { kind: 'roundFinished', roundsPlayed: 1 },
    { kind: 'newRoundStarted', roundNumber: 2 },
    { kind: 'gameEnded' },
    { kind: 'playerDisconnected', name: 'Klara' },
    { kind: 'playerReconnected', name: 'Klara' },
  ]

  it('har en replikk for hver hendelse spillet kan sende', () => {
    const d = regissør({}, 1, () => true)
    for (const event of alle) {
      const utspill = d.taleFor(event)
      expect(utspill, event.kind).not.toBeNull()
      expect(utspill!.deler.length, event.kind).toBeGreaterThan(0)
      expect(utspill!.text.length, event.kind).toBeGreaterThan(0)
    }
  })

  it('viser til klipp som faktisk finnes i innholdet', () => {
    const kjente = new Set([
      ...FRASEKLIPP.map((k) => k.id),
      ...VARIANTKLIPP.map((k) => k.id),
    ])
    const d = regissør({}, 3, () => true)

    for (const event of [...alle, ...Array.from({ length: 200 }, (_, i) => trekk((i % 90) + 1, i % 3 === 0 ? 'B' : null, i, 90 - i))]) {
      for (const id of klippene(d, event)) {
        const kjentMønster =
          id.startsWith('tall-') ||
          id.startsWith('siffer-') ||
          id.startsWith('nummer-') ||
          id.startsWith('bokstav-') ||
          id.startsWith('navn-')
        expect(kjentMønster || kjente.has(id), id).toBe(true)
      }
    }
  })
})
