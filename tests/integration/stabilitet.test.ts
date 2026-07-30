import { describe, expect, it } from 'vitest'
import { C, E, type HostView, type PlayerView } from '@/shared/protocol'
import { setupHarness, startRound, watch } from './harness'

/**
 * Det som går galt når nettet gjør det: hovedskjermen forsvinner, to telefoner
 * gjør det samme samtidig, og noen hamrer på en knapp.
 */
const h = setupHarness()

const KIDS = { format: 'kids', difficulty: 'enkel' }

describe('hovedskjermen forsvinner', () => {
  it('stopper automatisk trekking til den er tilbake', async () => {
    const lobby = await h.createLobby({
      ...KIDS,
      drawMode: 'auto',
      drawIntervalMs: 3000,
      markingMode: 'auto',
    })
    const ada = await h.joinAs(lobby, 'Ada')
    const telefon = watch<PlayerView>(ada.socket, E.playerState)
    await startRound(h, lobby, [ada])

    await lobby.state.until((v) => (v.round?.drawnCount ?? 0) >= 1, 6000)
    const førAntall = h.game.store.get(lobby.roomId)!.round!.drawnCount

    lobby.host.disconnect()
    await telefon.until((v) => v.round?.hostAway === true)

    // Ingen ser tallene, så det trekkes ingen.
    await new Promise((resolve) => setTimeout(resolve, 4500))
    expect(h.game.store.get(lobby.roomId)!.round!.drawnCount).toBe(førAntall)
  }, 25000)

  it('setter trekkingen i gang igjen når skjermen kommer tilbake', async () => {
    const lobby = await h.createLobby({
      ...KIDS,
      drawMode: 'auto',
      drawIntervalMs: 3000,
      markingMode: 'auto',
    })
    const ada = await h.joinAs(lobby, 'Ada')
    const telefon = watch<PlayerView>(ada.socket, E.playerState)
    await startRound(h, lobby, [ada])
    await lobby.state.until((v) => (v.round?.drawnCount ?? 0) >= 1, 6000)

    lobby.host.disconnect()
    await telefon.until((v) => v.round?.hostAway === true)
    const førAntall = h.game.store.get(lobby.roomId)!.round!.drawnCount

    const nySkjerm = await h.newClient()
    const nyState = watch<HostView>(nySkjerm, E.hostState)
    await h.expectOk(nySkjerm, C.hostResume, {
      roomId: lobby.roomId,
      hostKey: lobby.hostKey,
    })

    await nyState.until((v) => (v.round?.drawnCount ?? 0) > førAntall, 8000)
    expect((await telefon.until((v) => v.round?.hostAway === false)).round?.hostAway).toBe(
      false,
    )
  }, 25000)

  it('lar manuell trekking være helt upåvirket', async () => {
    const lobby = await h.createLobby(KIDS)
    const ada = await h.joinAs(lobby, 'Ada')
    await startRound(h, lobby, [ada])

    // Manuell trekking krever uansett at verten trykker, så det finnes ingen
    // timer å stoppe. Verten skal kunne trekke rett etter en reconnect.
    lobby.host.disconnect()
    const nySkjerm = await h.newClient()
    await h.expectOk(nySkjerm, C.hostResume, {
      roomId: lobby.roomId,
      hostKey: lobby.hostKey,
    })

    const state = watch<HostView>(nySkjerm, E.hostState)
    await h.expectOk(nySkjerm, C.hostDrawNext, lobby.next())
    const view = await state.until((v) => (v.round?.drawnCount ?? 0) >= 1)
    expect(view.round?.drawnCount).toBe(1)
  })
})

describe('samtidige hendelser', () => {
  it('gir plassen til bare én når to telefoner tar samme navn samtidig', async () => {
    const lobby = await h.createLobby(KIDS)
    const a = await h.newClient()
    const b = await h.newClient()
    await h.expectOk(a, C.playerLookupRoom, { code: lobby.code })
    await h.expectOk(b, C.playerLookupRoom, { code: lobby.code })

    const svar = await Promise.all([
      h.ask(a, C.playerClaim, { roomId: lobby.roomId, name: 'Ada' }),
      h.ask(b, C.playerClaim, { roomId: lobby.roomId, name: 'Ada' }),
    ])

    expect(svar.filter((s) => s.ok)).toHaveLength(1)
    expect(svar.filter((s) => !s.ok)).toHaveLength(1)
    expect(h.game.store.get(lobby.roomId)!.players).toHaveLength(1)
  })

  it('teller fem raske trekk som fem tall, ikke flere og ikke færre', async () => {
    const lobby = await h.createLobby(KIDS)
    const ada = await h.joinAs(lobby, 'Ada')
    await startRound(h, lobby, [ada])

    const svar = await Promise.all(
      Array.from({ length: 5 }, () => h.ask(lobby.host, C.hostDrawNext, lobby.next())),
    )
    expect(svar.every((s) => s.ok)).toBe(true)

    const round = h.game.store.get(lobby.roomId)!.round!
    expect(round.drawnCount).toBe(5)
    expect(new Set(round.drawOrder.slice(0, 5)).size).toBe(5)
  })

  it('avviser en gjenbrukt sekvens selv om kommandoen kommer to ganger', async () => {
    const lobby = await h.createLobby(KIDS)
    const ada = await h.joinAs(lobby, 'Ada')
    await startRound(h, lobby, [ada])

    const kommando = lobby.next()
    const [første, gjentatt] = await Promise.all([
      h.ask(lobby.host, C.hostDrawNext, kommando),
      h.ask(lobby.host, C.hostDrawNext, kommando),
    ])

    expect([første.ok, gjentatt.ok].filter(Boolean)).toHaveLength(1)
    expect(h.game.store.get(lobby.roomId)!.round!.drawnCount).toBe(1)
  })

  it('lar ingen markere mens en bingo kontrolleres', async () => {
    const lobby = await h.createLobby({
      ...KIDS,
      markingMode: 'auto',
      bingoWindowMs: 1500,
    })
    const ada = await h.joinAs(lobby, 'Ada')
    const state = watch<PlayerView>(ada.socket, E.playerState)
    await startRound(h, lobby, [ada])

    for (let i = 1; i <= 40; i++) {
      if ((state.latest?.boards[0]?.completedRows.length ?? 0) >= 1) break
      const result = await h.ask(lobby.host, C.hostDrawNext, lobby.next())
      if (!result.ok) break
      await lobby.state.until((v) => (v.round?.drawnCount ?? 0) >= i)
    }

    await h.expectOk(ada.socket, C.playerClaimBingo, ada.auth)
    const brett = state.latest!.boards[0]

    const svar = await h.ask(ada.socket, C.playerMark, {
      ...ada.auth,
      boardId: brett.id,
      value: 1,
    })
    expect(svar.ok).toBe(false)
    if (!svar.ok) expect(svar.code).toBe('mark/notActive')
  }, 20000)
})

describe('rate limiting over ledningen', () => {
  it('bremser en telefon som hamrer på BINGO', async () => {
    const lobby = await h.createLobby(KIDS)
    const ada = await h.joinAs(lobby, 'Ada')
    await startRound(h, lobby, [ada])

    const svar = await Promise.all(
      Array.from({ length: 12 }, () => h.ask(ada.socket, C.playerClaimBingo, ada.auth)),
    )
    const bremset = svar.filter((s) => !s.ok && s.code === 'rate/limited')
    expect(bremset.length).toBeGreaterThan(0)

    // De som slapp gjennom ble avvist på reglene, ikke på farten — og
    // ingen av dem fikk premie.
    expect(h.game.store.get(lobby.roomId)!.round!.status).toBe('active')
  })

  it('bremser en flom av navneforsøk', async () => {
    const lobby = await h.createLobby(KIDS)
    const socket = await h.newClient()
    await h.expectOk(socket, C.playerLookupRoom, { code: lobby.code })

    const svar = await Promise.all(
      Array.from({ length: 10 }, () =>
        h.ask(socket, C.playerClaim, { roomId: lobby.roomId, name: 'Ada' }),
      ),
    )
    expect(svar.some((s) => !s.ok && s.code === 'rate/limited')).toBe(true)
  })
})

describe('opprydding', () => {
  it('etterlater ingen bindinger når alle kobler fra', async () => {
    const lobby = await h.createLobby(KIDS)
    const ada = await h.joinAs(lobby, 'Ada')
    const edvin = await h.joinAs(lobby, 'Bo')

    ada.socket.disconnect()
    edvin.socket.disconnect()
    lobby.host.disconnect()

    await new Promise((resolve) => setTimeout(resolve, 300))
    expect(h.game.hostPresent(lobby.roomId)).toBe(false)
  })

  it('stopper alle timere når rommet ryddes bort', async () => {
    const lobby = await h.createLobby({
      ...KIDS,
      drawMode: 'auto',
      drawIntervalMs: 3000,
      markingMode: 'auto',
    })
    const ada = await h.joinAs(lobby, 'Ada')
    await startRound(h, lobby, [ada])

    const rom = h.game.store.get(lobby.roomId)!
    rom.lastActivityAt = Date.now() - 60 * 60 * 1000
    expect(h.game.sweep()).toBe(1)

    // Ingen timer skal kunne vekke et rom som ikke finnes lenger.
    await new Promise((resolve) => setTimeout(resolve, 3500))
    expect(h.game.store.get(lobby.roomId)).toBeUndefined()
  }, 15000)
})
