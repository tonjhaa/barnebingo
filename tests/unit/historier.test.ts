import { describe, expect, it } from 'vitest'
import type { GameEventData } from '@/domain/audio/events'
import { StoryDirector, type HistorieKontekst } from '@/domain/audio/story'
import { FRITTSTÅENDE, INNSLAG, innslagFor, KATEGORIER } from '@/content/historier'
import { fraseAntall, MAKS_TEGN_INNSLAG, validerInnhold } from '@/content/valider'
import { seededRng } from '@/domain/rng'

function trekk(value = 42, drawnCount = 10, remaining = 80): GameEventData {
  return { kind: 'numberDrawn', value, letter: null, drawnCount, remaining }
}

const NORMALT: HistorieKontekst = { frekvens: 'normal', fase: 'midt', spent: false }

/** Trekker `antall` tall og teller hvor mange innslag som kom. */
function kjør(
  director: StoryDirector,
  antall: number,
  kontekst: Partial<HistorieKontekst> = {},
  value = 42,
): string[] {
  const innslag: string[] = []
  for (let i = 0; i < antall; i++) {
    const utspill = director.innslagEtter(trekk(value), { ...NORMALT, ...kontekst })
    if (utspill) innslag.push(utspill.deler[0].id)
  }
  return innslag
}

describe('når det kommer innslag', () => {
  it('kommer ikke etter hvert tall', () => {
    const d = new StoryDirector(seededRng(1))
    expect(kjør(d, 30).length).toBeLessThan(10)
  })

  it('kommer oftere når verten ber om det', () => {
    const sjelden = kjør(new StoryDirector(seededRng(1)), 60, { frekvens: 'sjelden' })
    const normal = kjør(new StoryDirector(seededRng(1)), 60, { frekvens: 'normal' })
    const ofte = kjør(new StoryDirector(seededRng(1)), 60, { frekvens: 'ofte' })

    expect(sjelden.length).toBeLessThan(normal.length)
    expect(normal.length).toBeLessThan(ofte.length)
  })

  it('kommer aldri når verten har slått dem av', () => {
    expect(kjør(new StoryDirector(seededRng(1)), 100, { frekvens: 'av' })).toEqual([])
  })

  it('tier når noen er nær bingo', () => {
    expect(kjør(new StoryDirector(seededRng(1)), 100, { spent: true })).toEqual([])
  })

  it('kommer sjeldnere sent i runden', () => {
    const tidlig = kjør(new StoryDirector(seededRng(2)), 60, { fase: 'midt' })
    const sent = kjør(new StoryDirector(seededRng(2)), 60, { fase: 'sent' })
    expect(sent.length).toBeLessThan(tidlig.length)
  })
})

describe('hvilke innslag som velges', () => {
  it('foretrekker et innslag knyttet til tallet', () => {
    const d = new StoryDirector(seededRng(1))
    // 7 har både en historie og en vits.
    const funnet = kjør(d, 20, {}, 7)
    expect(funnet.length).toBeGreaterThan(0)
    const knyttet = innslagFor(7).map((i) => i.id)
    expect(knyttet).toContain(funnet[0])
  })

  it('bruker et frittstående innslag når tallet ikke har noe', () => {
    const d = new StoryDirector(seededRng(1))
    // 44 har ingen egne innslag.
    const funnet = kjør(d, 20, {}, 44)
    expect(funnet.length).toBeGreaterThan(0)
    expect(FRITTSTÅENDE.map((i) => i.id)).toContain(funnet[0])
  })

  it('gjentar aldri et innslag i samme runde', () => {
    const d = new StoryDirector(seededRng(4))
    const funnet = kjør(d, 400, { frekvens: 'ofte' })
    expect(new Set(funnet).size).toBe(funnet.length)
  })

  it('lar vitsene leve opp igjen i neste runde', () => {
    const d = new StoryDirector(seededRng(4))
    const første = kjør(d, 400, { frekvens: 'ofte' })
    d.nullstill()
    const andre = kjør(d, 400, { frekvens: 'ofte' })

    expect(første.length).toBeGreaterThan(0)
    expect(andre.length).toBeGreaterThan(0)
    expect(andre.some((id) => første.includes(id))).toBe(true)
  })

  it('går tom uten å krasje', () => {
    const d = new StoryDirector(seededRng(5))
    // Langt flere trekk enn det finnes innslag.
    const funnet = kjør(d, 2000, { frekvens: 'ofte' })
    expect(funnet.length).toBeLessThanOrEqual(INNSLAG.length)
  })

  it('gir samme innslag for samme seed', () => {
    const a = kjør(new StoryDirector(seededRng(77)), 100)
    const b = kjør(new StoryDirector(seededRng(77)), 100)
    expect(a).toEqual(b)
  })
})

describe('innslag og kritiske hendelser', () => {
  const kritiske: GameEventData[] = [
    { kind: 'bingoClaimed', name: 'Ada' },
    { kind: 'bingoApproved', names: ['Ada'], stageLabel: 'Én rad', isFinalStage: false },
    { kind: 'bingoRejected', name: 'Ada' },
    { kind: 'roundFinished', roundsPlayed: 1 },
    { kind: 'gameEnded' },
  ]

  it('kommer aldri på en kritisk hendelse', () => {
    const d = new StoryDirector(seededRng(1))
    for (const event of kritiske) {
      expect(d.innslagEtter(event, NORMALT), event.kind).toBeNull()
    }
  })

  it('legger seg ikke i kø bak spenningen', () => {
    const d = new StoryDirector(seededRng(1))
    // Bygg opp telleren nesten til et innslag skal komme.
    kjør(d, 5)
    // Noen roper bingo. Etterpå skal ikke et innslag komme «til gode».
    d.innslagEtter({ kind: 'bingoClaimed', name: 'Ada' }, NORMALT)
    expect(kjør(d, 1)).toEqual([])
  })

  it('kommer ikke på lobbyhendelser', () => {
    const d = new StoryDirector(seededRng(1))
    expect(d.innslagEtter({ kind: 'playerJoined', name: 'Ada' }, NORMALT)).toBeNull()
    expect(d.innslagEtter({ kind: 'paused' }, NORMALT)).toBeNull()
  })

  it('gir innslaget lavest prioritet, så et tall alltid vinner', () => {
    const d = new StoryDirector(seededRng(1))
    const funnet = kjør(d, 20)
    expect(funnet.length).toBeGreaterThan(0)

    const d2 = new StoryDirector(seededRng(1))
    let utspill = null
    for (let i = 0; i < 20 && !utspill; i++) {
      utspill = d2.innslagEtter(trekk(), NORMALT)
    }
    expect(utspill!.priority).toBe('lav')
    expect(utspill!.interruptible).toBe(true)
  })
})

describe('innholdet holder mål', () => {
  it('har ingen feil', () => {
    const feil = validerInnhold()
    expect(feil.map((f) => `${f.kode} ${f.id ?? ''}: ${f.melding}`)).toEqual([])
  })

  it('har nok fraser til at variasjonen merkes', () => {
    const antall = fraseAntall()
    expect(antall.introer).toBeGreaterThanOrEqual(12)
    expect(antall.avslutninger).toBeGreaterThanOrEqual(10)
    expect(antall.innslag).toBeGreaterThanOrEqual(20)
  })

  it('gir hvert innslag en kategori som finnes', () => {
    for (const innslag of INNSLAG) {
      expect(KATEGORIER, innslag.id).toContain(innslag.kategori)
    }
  })

  it('krever kilde for faktapåstander', () => {
    for (const innslag of INNSLAG.filter((i) => i.kategori === 'fakta')) {
      expect(innslag.kilde?.trim(), innslag.id).toBeTruthy()
    }
  })

  it('lar ingen oppdiktet historie se ut som et faktum', () => {
    for (const innslag of INNSLAG.filter((i) => i.kategori !== 'fakta')) {
      expect(innslag.kilde, innslag.id).toBeUndefined()
    }
  })

  it('holder innslagene korte nok til å fylle en pause', () => {
    for (const innslag of INNSLAG) {
      expect(innslag.tekst.length, innslag.id).toBeLessThanOrEqual(MAKS_TEGN_INNSLAG)
    }
  })

  it('lar alle oppgaver kunne gjøres sittende innendørs', () => {
    // §8: ingen skal måtte hente noe, forlate plassen eller konkurrere fysisk.
    const forbudt = /løp|hent|spring|utenfor|kappløp|først til|raskest/i
    for (const oppgave of INNSLAG.filter((i) => i.kategori === 'oppgave')) {
      expect(forbudt.test(oppgave.tekst), oppgave.id).toBe(false)
    }
  })
})
