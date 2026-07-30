import { describe, expect, it } from 'vitest'
import { C, E, type HostView, type PlayerView } from '@/shared/protocol'
import { setupHarness, startRound, watch } from './harness'

/**
 * Runden ende-til-ende: brett deles ut, tall trekkes, alle klientene ser det
 * samme, og ingen kan trekke som ikke skal.
 */
const h = setupHarness()

const KIDS = { format: 'kids', difficulty: 'enkel' }
const B75 = { format: 'bingo75', difficulty: 'normal' }

describe('start av runden', () => {
  it('deler ut brett til alle spillerne', async () => {
    const lobby = await h.createLobby(B75)
    const ada = await h.joinAs(lobby, 'Ada')
    const edvin = await h.joinAs(lobby, 'Bo')
    const adaState = watch<PlayerView>(ada.socket, E.playerState)
    const edvinState = watch<PlayerView>(edvin.socket, E.playerState)

    await startRound(h, lobby, [ada, edvin])

    const k = await adaState.until((view) => view.boards.length > 0)
    const e = await edvinState.until((view) => view.boards.length > 0)

    expect(k.boards).toHaveLength(1)
    expect(k.boards[0].cells).toHaveLength(5)
    expect(k.boards[0].numberCount).toBe(24)
    expect(k.activeBoardId).toBe(k.boards[0].id)

    // To spillere skal aldri få samme brett.
    const tallene = (view: PlayerView) =>
      view.boards[0].cells
        .flat()
        .map((cell) => cell.value)
        .join(',')
    expect(tallene(k)).not.toBe(tallene(e))
  })

  it('gir hver spiller tre brett når verten har valgt det', async () => {
    const lobby = await h.createLobby({ ...B75, boardsPerPlayer: 3 })
    const ada = await h.joinAs(lobby, 'Ada')
    const state = watch<PlayerView>(ada.socket, E.playerState)

    await startRound(h, lobby, [ada])

    const view = await state.until((v) => v.boards.length === 3)
    expect(view.boards.map((b) => b.index)).toEqual([1, 2, 3])
    expect(new Set(view.boards.map((b) => b.id)).size).toBe(3)
  })

  it('sender aldri en spiller et annet barns brett', async () => {
    const lobby = await h.createLobby(KIDS)
    const ada = await h.joinAs(lobby, 'Ada')
    const edvin = await h.joinAs(lobby, 'Bo')
    const state = watch<PlayerView>(ada.socket, E.playerState)

    await startRound(h, lobby, [ada, edvin])

    const view = await state.until((v) => v.boards.length > 0)
    expect(view.boards).toHaveLength(1)
    expect(view.boards[0].id).toBeDefined()
    // Ingen andre spilleres brett finnes i meldingen i det hele tatt.
    expect(JSON.stringify(view)).not.toContain(edvin.playerId)
  })

  it('starter ikke før alle er klare', async () => {
    const lobby = await h.createLobby(KIDS)
    const ada = await h.joinAs(lobby, 'Ada')
    await h.joinAs(lobby, 'Bo')

    await h.expectOk(ada.socket, C.playerSetReady, { ...ada.auth, ready: true })

    const response = await h.ask(lobby.host, C.hostStartGame, lobby.next())
    expect(response.ok).toBe(false)
    if (!response.ok) expect(response.code).toBe('start/notReady')
  })

  it('starter ikke en runde to ganger', async () => {
    const lobby = await h.createLobby(KIDS)
    const ada = await h.joinAs(lobby, 'Ada')
    await startRound(h, lobby, [ada])

    const response = await h.ask(lobby.host, C.hostStartGame, lobby.next())
    expect(response.ok).toBe(false)
    if (!response.ok) expect(response.code).toBe('start/notReady')
  })
})

describe('trekking', () => {
  it('gir alle klientene det samme tallet', async () => {
    const lobby = await h.createLobby(B75)
    const ada = await h.joinAs(lobby, 'Ada')
    const edvin = await h.joinAs(lobby, 'Bo')
    const k = watch<PlayerView>(ada.socket, E.playerState)
    const e = watch<PlayerView>(edvin.socket, E.playerState)

    await startRound(h, lobby, [ada, edvin])
    const trukket = await h.expectOk<{ number: number }>(
      lobby.host,
      C.hostDrawNext,
      lobby.next(),
    )

    const vert = await lobby.state.until((v) => v.round?.currentNumber != null)
    expect(vert.round?.currentNumber).toBe(trukket.number)
    expect(vert.round?.currentLabel).toMatch(/^[BINGO] \d+$/)

    for (const state of [k, e]) {
      const view = await state.until((v) => v.round?.currentNumber != null)
      expect(view.round?.currentNumber).toBe(trukket.number)
    }
  })

  it('trekker aldri det samme tallet to ganger gjennom en hel runde', async () => {
    const lobby = await h.createLobby(KIDS)
    const ada = await h.joinAs(lobby, 'Ada')
    await startRound(h, lobby, [ada])

    const trukket: number[] = []
    for (let i = 0; i < 40; i++) {
      const result = await h.expectOk<{ number: number }>(
        lobby.host,
        C.hostDrawNext,
        lobby.next(),
      )
      trukket.push(result.number)
    }

    expect(new Set(trukket).size).toBe(40)

    // Etter siste tall lever runden fortsatt, slik at en bingo på akkurat det
    // tallet rekker fram. Den lukkes når verten prøver å trekke fra tom kule.
    const etterSiste = await lobby.state.until((v) => v.round?.drawnCount === 40)
    expect(etterSiste.round?.status).toBe('active')

    const tomt = await h.ask(lobby.host, C.hostDrawNext, lobby.next())
    expect(tomt.ok).toBe(false)
    if (!tomt.ok) expect(tomt.code).toBe('draw/exhausted')
    const slutt = await lobby.state.until((v) => v.round?.status === 'finished')
    expect(slutt.round?.drawnCount).toBe(40)
  })

  it('markerer ingenting av seg selv i manuell modus', async () => {
    const lobby = await h.createLobby(KIDS)
    const ada = await h.joinAs(lobby, 'Ada')
    const state = watch<PlayerView>(ada.socket, E.playerState)
    await startRound(h, lobby, [ada])

    for (let i = 0; i < 10; i++) {
      await h.expectOk(lobby.host, C.hostDrawNext, lobby.next())
    }

    const view = await state.until((v) => (v.round?.drawnCount ?? 0) >= 10)
    expect(view.boards[0].markedCount).toBe(0)
    expect(view.boards[0].completedRows).toEqual([])
  })

  it('viser tidligere tall på hovedskjermen, nyeste først', async () => {
    const lobby = await h.createLobby(KIDS)
    const ada = await h.joinAs(lobby, 'Ada')
    await startRound(h, lobby, [ada])

    const trukket: number[] = []
    for (let i = 0; i < 4; i++) {
      const result = await h.expectOk<{ number: number }>(
        lobby.host,
        C.hostDrawNext,
        lobby.next(),
      )
      trukket.push(result.number)
    }

    const view = await lobby.state.until((v) => v.round?.drawnCount === 4)
    expect(view.round?.previousNumbers).toEqual(trukket.slice(0, 3).reverse())
    expect(view.round?.currentNumber).toBe(trukket[3])
  })

  it('avviser trekk fra noen som ikke er vert', async () => {
    const lobby = await h.createLobby(KIDS)
    const ada = await h.joinAs(lobby, 'Ada')
    await startRound(h, lobby, [ada])

    const response = await h.ask(ada.socket, C.hostDrawNext, {
      roomId: lobby.roomId,
      hostKey: 'z'.repeat(43),
      seq: 999,
    })
    expect(response.ok).toBe(false)
    if (!response.ok) expect(response.code).toBe('auth/host')
  })
})

describe('pause', () => {
  it('stopper trekkingen og slipper den løs igjen', async () => {
    const lobby = await h.createLobby(KIDS)
    const ada = await h.joinAs(lobby, 'Ada')
    await startRound(h, lobby, [ada])

    await h.expectOk(lobby.host, C.hostPause, lobby.next())
    await lobby.state.until((v) => v.round?.status === 'paused')

    const nektet = await h.ask(lobby.host, C.hostDrawNext, lobby.next())
    expect(nektet.ok).toBe(false)
    if (!nektet.ok) expect(nektet.code).toBe('draw/notActive')

    await h.expectOk(lobby.host, C.hostResumeGame, lobby.next())
    await lobby.state.until((v) => v.round?.status === 'active')
    await h.expectOk(lobby.host, C.hostDrawNext, lobby.next())
  })
})

describe('automatisk trekking', () => {
  it('trekker av seg selv, og stopper når verten pauser', async () => {
    const lobby = await h.createLobby({
      ...KIDS,
      drawMode: 'auto',
      drawIntervalMs: 3000,
      markingMode: 'auto',
    })
    const ada = await h.joinAs(lobby, 'Ada')
    await startRound(h, lobby, [ada])

    // Ingen manuelle trekk her — timeren gjør jobben.
    const etterFørste = await lobby.state.until((v) => (v.round?.drawnCount ?? 0) >= 1, 6000)
    expect(etterFørste.round?.currentNumber).not.toBeNull()

    await h.expectOk(lobby.host, C.hostPause, lobby.next())
    const påPause = await lobby.state.until((v) => v.round?.status === 'paused')
    const antall = påPause.round?.drawnCount ?? 0

    await new Promise((resolve) => setTimeout(resolve, 4000))
    expect(h.game.store.get(lobby.roomId)?.round?.drawnCount).toBe(antall)
  }, 20000)
})

describe('flere brett', () => {
  it('lar spilleren bytte aktivt brett', async () => {
    const lobby = await h.createLobby({ ...B75, boardsPerPlayer: 3 })
    const ada = await h.joinAs(lobby, 'Ada')
    const state = watch<PlayerView>(ada.socket, E.playerState)
    await startRound(h, lobby, [ada])

    const start = await state.until((v) => v.boards.length === 3)
    const andre = start.boards[1].id

    await h.expectOk(ada.socket, C.playerSetActiveBoard, {
      ...ada.auth,
      boardId: andre,
    })
    const etter = await state.until((v) => v.activeBoardId === andre)
    expect(etter.activeBoardId).toBe(andre)
  })

  it('lar ingen gjøre et fremmed brett til sitt aktive', async () => {
    const lobby = await h.createLobby({ ...B75, boardsPerPlayer: 2 })
    const ada = await h.joinAs(lobby, 'Ada')
    const edvin = await h.joinAs(lobby, 'Bo')
    const edvinState = watch<PlayerView>(edvin.socket, E.playerState)
    await startRound(h, lobby, [ada, edvin])

    const edvinsBrett = (await edvinState.until((v) => v.boards.length === 2)).boards[0].id

    const response = await h.ask(ada.socket, C.playerSetActiveBoard, {
      ...ada.auth,
      boardId: edvinsBrett,
    })
    expect(response.ok).toBe(false)
    if (!response.ok) expect(response.code).toBe('board/notYours')
  })
})

describe('hjelpemidler på telefonen', () => {
  it('sender ikke tallet til telefonen når verten har slått det av', async () => {
    const lobby = await h.createLobby({
      ...B75,
      showCurrentNumberOnPhone: false,
      showDrawHistoryOnPhone: false,
    })
    const ada = await h.joinAs(lobby, 'Ada')
    const state = watch<PlayerView>(ada.socket, E.playerState)
    await startRound(h, lobby, [ada])

    for (let i = 0; i < 3; i++) {
      await h.expectOk(lobby.host, C.hostDrawNext, lobby.next())
    }

    const vert = await lobby.state.until((v) => (v.round?.drawnCount ?? 0) === 3)
    expect(vert.round?.currentNumber).not.toBeNull()

    const telefon = await state.until((v) => (v.round?.drawnCount ?? 0) === 3)
    // Tallet er ikke skjult i grensesnittet — det er ikke sendt.
    expect(telefon.round?.currentNumber).toBeNull()
    expect(telefon.round?.currentLabel).toBeNull()
    expect(telefon.round?.previousNumbers).toEqual([])
  })
})

describe('reconnect midt i runden', () => {
  it('gir spilleren brettene sine tilbake', async () => {
    const lobby = await h.createLobby({ ...B75, boardsPerPlayer: 2 })
    const ada = await h.joinAs(lobby, 'Ada')
    const first = watch<PlayerView>(ada.socket, E.playerState)
    await startRound(h, lobby, [ada])

    const før = await first.until((v) => v.boards.length === 2)
    await h.expectOk(lobby.host, C.hostDrawNext, lobby.next())
    ada.socket.disconnect()

    const nyTelefon = await h.newClient()
    const etterState = watch<PlayerView>(nyTelefon, E.playerState)
    await h.expectOk(nyTelefon, C.playerResume, ada.auth)

    const etter = await etterState.until((v) => v.boards.length === 2)
    expect(etter.boards.map((b) => b.id)).toEqual(før.boards.map((b) => b.id))
    expect(etter.round?.drawnCount).toBe(1)
  })
})

describe('hovedskjermens spillerstatus', () => {
  it('viser hvor mange kryss og rader hver spiller har', async () => {
    const lobby = await h.createLobby(KIDS)
    const ada = await h.joinAs(lobby, 'Ada')
    await startRound(h, lobby, [ada])

    const view: HostView = await lobby.state.until((v) => v.round !== null)
    const slot = view.roster.find((s) => s.name === 'Ada')
    expect(slot?.progress).toEqual({
      boards: 1,
      bestCompletedRows: 0,
      markedCount: 0,
      prizes: 0,
    })
    // Bare de som faktisk er med står i lista.
    expect(view.roster.map((s) => s.name)).toEqual(['Ada'])
  })
})
