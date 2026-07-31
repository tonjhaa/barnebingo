import { describe, expect, it } from 'vitest'
import { Lydkø, type Klippdel, type Klippspiller, type Utspill } from '@/domain/audio/queue'
import { appendEvent, createEventLog, eventsSince, MAX_EVENTS } from '@/domain/audio/log'
import { EVENT_PRIORITY, PRIORITIES, higherPriority } from '@/domain/audio/events'

/**
 * En spiller som lar testen bestemme når hvert klipp er ferdig. Uten den ville
 * testene enten sovet i ekte tid eller ikke kunnet treffe øyeblikket midt i en
 * setning, som er nettopp der avbruddene skal skje.
 */
class Teststemme implements Klippspiller {
  spilte: string[] = []
  stoppet = 0
  forhåndslastet: string[] = []
  private ferdig: (() => void) | null = null

  spill(del: Klippdel): Promise<void> {
    this.spilte.push(del.id)
    return new Promise((resolve) => {
      this.ferdig = resolve
    })
  }

  stopp(): void {
    this.stoppet++
    // Et stoppet klipp løser seg, akkurat som `onended` uteblir og `pause`
    // avslutter det i nettleseren.
    this.fullfør()
  }

  forhåndslast(del: Klippdel): void {
    this.forhåndslastet.push(del.id)
  }

  /** Lar det klippet som spilles bli ferdig. */
  fullfør(): void {
    const resolve = this.ferdig
    this.ferdig = null
    resolve?.()
  }

  /** Spiller ferdig alt som ligger i kø, ett klipp om gangen. */
  async spillFerdig(maks = 50): Promise<void> {
    for (let i = 0; i < maks && this.ferdig; i++) {
      this.fullfør()
      await Promise.resolve()
      await Promise.resolve()
    }
  }
}

/** `clips` er id-er; teksten er uinteressant her og settes lik id-en. */
function utspill(
  over: Omit<Partial<Utspill>, 'deler'> & Pick<Utspill, 'priority'> & { clips?: string[] },
): Utspill {
  const { clips = ['a'], ...resten } = over
  return { deler: clips.map((id) => ({ id, tekst: id })), text: clips.join(' '), ...resten }
}

async function tikk() {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

describe('lydkøen', () => {
  it('spiller klippene i et utspill etter hverandre', async () => {
    const stemme = new Teststemme()
    const kø = new Lydkø(stemme)

    kø.si(utspill({ priority: 'høy', clips: ['b', 'tolv'] }))
    await tikk()
    expect(stemme.spilte).toEqual(['b'])

    await stemme.spillFerdig()
    expect(stemme.spilte).toEqual(['b', 'tolv'])
  })

  it('lar aldri to utspill snakke samtidig', async () => {
    const stemme = new Teststemme()
    const kø = new Lydkø(stemme)

    kø.si(utspill({ priority: 'høy', clips: ['en'] }))
    kø.si(utspill({ priority: 'høy', clips: ['to'] }))
    await tikk()

    expect(stemme.spilte).toEqual(['en'])
    await stemme.spillFerdig()
    expect(stemme.spilte).toEqual(['en', 'to'])
  })

  it('lar en kritisk hendelse avbryte noe mindre viktig', async () => {
    const stemme = new Teststemme()
    const kø = new Lydkø(stemme)

    kø.si(utspill({ priority: 'lav', clips: ['historie-1', 'historie-2'] }))
    await tikk()
    expect(stemme.spilte).toEqual(['historie-1'])

    kø.si(utspill({ priority: 'kritisk', clips: ['bingo'] }))
    await tikk()

    expect(stemme.stoppet).toBe(1)
    expect(stemme.spilte).toEqual(['historie-1', 'bingo'])
    // Resten av historien skal ikke komme etterpå. Øyeblikket er forbi.
    await stemme.spillFerdig()
    expect(stemme.spilte).not.toContain('historie-2')
  })

  it('kaster ventende småprat når noe viktigere kommer', async () => {
    const stemme = new Teststemme()
    const kø = new Lydkø(stemme)

    kø.si(utspill({ priority: 'høy', clips: ['tall'] }))
    kø.si(utspill({ priority: 'lav', clips: ['vits'] }))
    await tikk()
    expect(kø.køLengde).toBe(1)

    kø.si(utspill({ priority: 'kritisk', clips: ['bingo'] }))
    await tikk()

    await stemme.spillFerdig()
    expect(stemme.spilte).not.toContain('vits')
  })

  it('lar et utspill som ikke kan avbrytes snakke ferdig', async () => {
    const stemme = new Teststemme()
    const kø = new Lydkø(stemme)

    kø.si(
      utspill({ priority: 'normal', clips: ['premie-1', 'premie-2'], interruptible: false }),
    )
    await tikk()

    kø.si(utspill({ priority: 'kritisk', clips: ['bingo'] }))
    await tikk()

    expect(stemme.stoppet).toBe(0)
    await stemme.spillFerdig()
    expect(stemme.spilte).toEqual(['premie-1', 'premie-2', 'bingo'])
  })

  it('spiller viktigst først når flere venter', async () => {
    const stemme = new Teststemme()
    const kø = new Lydkø(stemme)

    kø.si(utspill({ priority: 'høy', clips: ['tall'] }))
    kø.si(utspill({ priority: 'lav', clips: ['vits'] }))
    kø.si(utspill({ priority: 'normal', clips: ['klar'] }))
    await tikk()

    await stemme.spillFerdig()
    expect(stemme.spilte).toEqual(['tall', 'klar', 'vits'])
  })

  it('lar en manglende fil gå videre til neste klipp', async () => {
    const spilt: string[] = []
    const kø = new Lydkø({
      spill: async (del) => {
        spilt.push(del.id)
        if (del.id === 'mangler') throw new Error('404')
      },
      stopp: () => undefined,
    })

    kø.si(utspill({ priority: 'høy', clips: ['nummer', 'mangler', 'sju'] }))
    await tikk()
    await tikk()

    expect(spilt).toEqual(['nummer', 'mangler', 'sju'])
  })

  it('sier fra når det snakkes, så musikken kan dempes', async () => {
    const stemme = new Teststemme()
    const hendelser: string[] = []
    const kø = new Lydkø(stemme, {
      påTaleStart: () => hendelser.push('start'),
      påTaleSlutt: () => hendelser.push('slutt'),
    })

    kø.si(utspill({ priority: 'høy', clips: ['tall'] }))
    await tikk()
    expect(hendelser).toEqual(['start'])

    await stemme.spillFerdig()
    expect(hendelser).toEqual(['start', 'slutt'])
  })

  it('forhåndslaster neste utspill mens det pågående spiller', async () => {
    const stemme = new Teststemme()
    const kø = new Lydkø(stemme)

    kø.si(utspill({ priority: 'høy', clips: ['tall'] }))
    kø.si(utspill({ priority: 'høy', clips: ['neste'] }))
    await tikk()

    expect(stemme.forhåndslastet).toContain('neste')
  })

  it('blir stille når alt stoppes', async () => {
    const stemme = new Teststemme()
    const kø = new Lydkø(stemme)

    kø.si(utspill({ priority: 'høy', clips: ['a', 'b'] }))
    kø.si(utspill({ priority: 'høy', clips: ['c'] }))
    await tikk()

    kø.stopp()
    await tikk()

    expect(kø.snakker).toBe(false)
    expect(kø.køLengde).toBe(0)
    expect(stemme.spilte).toEqual(['a'])
  })
})

describe('hendelsesloggen', () => {
  it('deler ut stigende sekvensnumre fra én', () => {
    const log = createEventLog()
    const a = appendEvent(log, { kind: 'roomOpened' }, 1000)
    const b = appendEvent(log, { kind: 'paused' }, 1001)
    expect([a.seq, b.seq]).toEqual([1, 2])
  })

  it('gir bare det mottakeren ikke har hørt', () => {
    const log = createEventLog()
    appendEvent(log, { kind: 'roomOpened' }, 1)
    appendEvent(log, { kind: 'paused' }, 2)
    appendEvent(log, { kind: 'resumed' }, 3)

    expect(eventsSince(log, 1).map((e) => e.data.kind)).toEqual(['paused', 'resumed'])
    expect(eventsSince(log, 3)).toEqual([])
  })

  it('vokser ikke i et rom som lever hele kvelden', () => {
    const log = createEventLog()
    for (let i = 0; i < MAX_EVENTS * 3; i++) {
      appendEvent(log, { kind: 'paused' }, i)
    }
    expect(log.events).toHaveLength(MAX_EVENTS)
    // Sekvensen fortsetter selv om de eldste er kastet.
    expect(log.seq).toBe(MAX_EVENTS * 3)
    expect(log.events[0].seq).toBe(MAX_EVENTS * 2 + 1)
  })
})

describe('prioriteter', () => {
  it('rangerer kritisk over alt annet', () => {
    for (const annen of PRIORITIES.filter((p) => p !== 'kritisk')) {
      expect(higherPriority('kritisk', annen)).toBe(true)
    }
  })

  it('gir hver hendelse en prioritet', () => {
    for (const [kind, priority] of Object.entries(EVENT_PRIORITY)) {
      expect(PRIORITIES, kind).toContain(priority)
    }
  })

  it('lar godkjent bingo og avsluttet runde være kritiske', () => {
    expect(EVENT_PRIORITY.bingoApproved).toBe('kritisk')
    expect(EVENT_PRIORITY.roundFinished).toBe('kritisk')
    expect(EVENT_PRIORITY.numberDrawn).toBe('høy')
    expect(EVENT_PRIORITY.playerDisconnected).toBe('lav')
  })
})
