import { describe, expect, it } from 'vitest'
import { C, E, type PlayerView } from '@/shared/protocol'
import { setupHarness, startRound, watch } from './harness'

/**
 * Slutten på en runde og starten på den neste (§15, §28), og veien tilbake inn
 * for en telefon som er borte for godt (§23).
 */
const h = setupHarness()

const KIDS = { format: 'kids', difficulty: 'enkel' }

/** Spiller runden helt til kula er tom. */
async function spillFerdig(lobby: Awaited<ReturnType<typeof h.createLobby>>) {
  for (let i = 1; i <= 41; i++) {
    const result = await h.ask(lobby.host, C.hostDrawNext, lobby.next())
    if (!result.ok) break
    await lobby.state.until((v) => (v.round?.drawnCount ?? 0) >= i)
  }
}

describe('resultatskjermen', () => {
  it('kommer fram når kula er tom, ikke bare når siste premie er vunnet', async () => {
    const lobby = await h.createLobby(KIDS)
    const ada = await h.joinAs(lobby, 'Ada')
    await startRound(h, lobby, [ada])
    await spillFerdig(lobby)

    const view = await lobby.state.until((v) => v.results !== null)
    expect(view.status).toBe('finished')
    expect(view.results?.formatName).toBe('Barnebingo')
    expect(view.results?.roundsPlayed).toBe(1)
    // Ingen markerte noe, så ingen vant.
    expect(view.results?.stages).toEqual([])
  })

  it('viser hvem som vant hvert stadium', async () => {
    const lobby = await h.createLobby({
      ...KIDS,
      markingMode: 'auto',
      winMode: 'autoWin',
      enabledStageIds: ['row1', 'full'],
    })
    const ada = await h.joinAs(lobby, 'Ada')
    await startRound(h, lobby, [ada])

    for (let i = 1; i <= 60; i++) {
      const prize = lobby.state.latest?.round?.prize
      if (prize && !prize.isFinalStage) {
        await h.expectOk(lobby.host, C.hostAdvancePrize, lobby.next())
        await lobby.state.until((v) => v.round?.prize == null)
        continue
      }
      if (lobby.state.latest?.results) break
      const result = await h.ask(lobby.host, C.hostDrawNext, lobby.next())
      if (!result.ok) break
      await lobby.state.until((v) => (v.round?.drawnCount ?? 0) > 0)
    }

    const view = await lobby.state.until((v) => v.results !== null, 5000)
    expect(view.results?.stages.map((s) => s.stageLabel)).toEqual([
      'Én rad',
      'Fullt brett',
    ])
    expect(view.results?.stages[0].winners[0].name).toBe('Ada')
    expect(view.results?.standings.find((s) => s.name === 'Ada')?.prizes).toBe(2)
  }, 30000)

  it('sender sluttbildet til telefonene også', async () => {
    const lobby = await h.createLobby(KIDS)
    const ada = await h.joinAs(lobby, 'Ada')
    const telefon = watch<PlayerView>(ada.socket, E.playerState)
    await startRound(h, lobby, [ada])
    await spillFerdig(lobby)

    const view = await telefon.until((v) => v.results !== null)
    expect(view.results?.standings.map((s) => s.name)).toContain('Ada')
  })
})

describe('ny runde', () => {
  it('gir nye brett til de samme spillerne', async () => {
    const lobby = await h.createLobby(KIDS)
    const ada = await h.joinAs(lobby, 'Ada')
    const telefon = watch<PlayerView>(ada.socket, E.playerState)
    await startRound(h, lobby, [ada])
    const førsteBrett = (await telefon.until((v) => v.boards.length > 0)).boards[0].id
    await spillFerdig(lobby)
    await lobby.state.until((v) => v.results !== null)

    await h.expectOk(lobby.host, C.hostNewRound, lobby.next())

    // Tilbake i lobbyen: plassen er i behold, men klar-status er nullstilt.
    const iLobby = await lobby.state.until((v) => v.status === 'lobby')
    expect(iLobby.roster.map((s) => s.name)).toEqual(['Ada'])
    expect(iLobby.roster.find((s) => s.name === 'Ada')?.ready).toBe(false)
    expect(iLobby.results).toBeNull()
    expect(iLobby.round).toBeNull()

    // Brettene ble delt ut på nytt, så vi venter på et brett som ikke er det
    // gamle — ikke bare på «et brett», som ville truffet forrige runde.
    await startRound(h, lobby, [ada])
    const nyttBrett = (
      await telefon.until((v) => v.boards.length > 0 && v.boards[0].id !== førsteBrett)
    ).boards[0]
    expect(nyttBrett.id).not.toBe(førsteBrett)
    expect(nyttBrett.markedCount).toBe(0)
  })

  it('lar premiene telle videre gjennom hele kvelden', async () => {
    const lobby = await h.createLobby({
      ...KIDS,
      markingMode: 'auto',
      winMode: 'autoWin',
      enabledStageIds: ['row1'],
    })
    const ada = await h.joinAs(lobby, 'Ada')

    for (const runde of [1, 2]) {
      if (runde === 2) {
        await h.expectOk(lobby.host, C.hostNewRound, lobby.next())
        await lobby.state.until((v) => v.status === 'lobby')
      }
      await startRound(h, lobby, [ada])
      for (let i = 1; i <= 45; i++) {
        if (lobby.state.latest?.results) break
        const result = await h.ask(lobby.host, C.hostDrawNext, lobby.next())
        if (!result.ok) break
        await lobby.state.until((v) => (v.round?.drawnCount ?? 0) > 0)
      }
      await lobby.state.until((v) => v.results !== null, 5000)
    }

    const view = lobby.state.latest!
    expect(view.results?.roundsPlayed).toBe(2)
    expect(view.results?.standings.find((s) => s.name === 'Ada')?.prizes).toBe(2)
  }, 40000)

  it('avviser ny runde mens spillet pågår', async () => {
    const lobby = await h.createLobby(KIDS)
    const ada = await h.joinAs(lobby, 'Ada')
    await startRound(h, lobby, [ada])

    const svar = await h.ask(lobby.host, C.hostNewRound, lobby.next())
    expect(svar.ok).toBe(false)
    if (!svar.ok) expect(svar.code).toBe('newRound/notFinished')
  })
})

describe('vertsgodkjent overtakelse', () => {
  it('slipper en ny telefon inn på en opptatt plass', async () => {
    const lobby = await h.createLobby(KIDS)
    const ada = await h.joinAs(lobby, 'Ada')
    await h.expectOk(ada.socket, C.playerUseAvatar, ada.auth)

    // Telefonen er borte for godt — nøkkelen finnes ikke lenger noe sted.
    ada.socket.disconnect()

    const nyTelefon = await h.newClient()
    await h.expectOk(nyTelefon, C.playerLookupRoom, { code: lobby.code })

    const godkjent = new Promise<{ playerId: string; recoveryKey: string }>((resolve) =>
      nyTelefon.once(E.takeoverApproved, resolve),
    )
    await h.expectOk(nyTelefon, C.playerRequestTakeover, {
      roomId: lobby.roomId,
      name: 'Ada',
    })

    const medForespørsel = await lobby.state.until(
      (v) => v.takeoverRequests.length === 1,
    )
    expect(medForespørsel.takeoverRequests[0].name).toBe('Ada')

    await h.expectOk(lobby.host, C.hostApproveTakeover, {
      ...lobby.next(),
      name: 'Ada',
    })

    const nøkler = await godkjent
    expect(nøkler.playerId).toBe(ada.playerId)
    // Ny nøkkel: den gamle telefonen kommer ikke inn igjen.
    expect(nøkler.recoveryKey).not.toBe(ada.recoveryKey)

    const etter = await lobby.state.until((v) => v.takeoverRequests.length === 0)
    expect(etter.roster.find((s) => s.name === 'Ada')?.connected).toBe(true)
  })

  it('stenger den gamle nøkkelen ute etter overtakelsen', async () => {
    const lobby = await h.createLobby(KIDS)
    const ada = await h.joinAs(lobby, 'Ada')
    ada.socket.disconnect()

    const nyTelefon = await h.newClient()
    await h.expectOk(nyTelefon, C.playerRequestTakeover, {
      roomId: lobby.roomId,
      name: 'Ada',
    })
    await h.expectOk(lobby.host, C.hostApproveTakeover, {
      ...lobby.next(),
      name: 'Ada',
    })

    const gammel = await h.newClient()
    const svar = await h.ask(gammel, C.playerResume, ada.auth)
    expect(svar.ok).toBe(false)
    if (!svar.ok) expect(svar.code).toBe('auth/player')
  })

  it('lar verten si nei', async () => {
    const lobby = await h.createLobby(KIDS)
    const ada = await h.joinAs(lobby, 'Ada')

    const nyTelefon = await h.newClient()
    const avvist = new Promise<{ name: string }>((resolve) =>
      nyTelefon.once(E.takeoverDenied, resolve),
    )
    await h.expectOk(nyTelefon, C.playerRequestTakeover, {
      roomId: lobby.roomId,
      name: 'Ada',
    })
    await lobby.state.until((v) => v.takeoverRequests.length === 1)

    await h.expectOk(lobby.host, C.hostDenyTakeover, { ...lobby.next(), name: 'Ada' })

    expect((await avvist).name).toBe('Ada')
    const etter = await lobby.state.until((v) => v.takeoverRequests.length === 0)
    expect(etter.takeoverRequests).toEqual([])
    // Adas opprinnelige nøkkel gjelder fortsatt.
    expect(
      (await h.ask(ada.socket, C.playerSetReady, { ...ada.auth, ready: true })).ok,
    ).toBe(true)
    void etter
  })

  it('avviser en forespørsel om en ledig plass', async () => {
    const lobby = await h.createLobby(KIDS)
    const socket = await h.newClient()

    const svar = await h.ask(socket, C.playerRequestTakeover, {
      roomId: lobby.roomId,
      name: 'Ada',
    })
    expect(svar.ok).toBe(false)
    if (!svar.ok) expect(svar.code).toBe('takeover/free')
  })

  it('lar ingen andre enn verten godkjenne', async () => {
    const lobby = await h.createLobby(KIDS)
    await h.joinAs(lobby, 'Ada')
    const nyTelefon = await h.newClient()
    await h.expectOk(nyTelefon, C.playerRequestTakeover, {
      roomId: lobby.roomId,
      name: 'Ada',
    })

    const svar = await h.ask(nyTelefon, C.hostApproveTakeover, {
      roomId: lobby.roomId,
      hostKey: 'x'.repeat(43),
      seq: 999,
      name: 'Ada',
    })
    expect(svar.ok).toBe(false)
    if (!svar.ok) expect(svar.code).toBe('auth/host')
  })
})
