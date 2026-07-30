import { describe, expect, it } from 'vitest'
import type { Socket } from 'socket.io-client'
import {
  C,
  E,
  type ClaimResult,
  type CreateRoomResult,
  type HostView,
  type LookupRoomResult,
  type PlayerView,
} from '@/shared/protocol'
import { setupHarness, watch } from './harness'

/**
 * Lobbyen ende-til-ende: vert, fire telefoner, navnevalg, klar-status,
 * frakobling og reconnect. Riggen er felles med de andre integrasjonstestene.
 */
const h = setupHarness()

const newClient = () => h.newClient()
const ask = <T,>(socket: Socket, event: string, payload: unknown) =>
  h.ask<T>(socket, event, payload)
const expectOk = <T,>(socket: Socket, event: string, payload: unknown) =>
  h.expectOk<T>(socket, event, payload)

/** Beholder den flate formen testene under er skrevet mot. */
async function createLobby() {
  const lobby = await h.createLobby()
  return {
    host: lobby.host,
    room: { roomId: lobby.roomId, code: lobby.code, hostKey: lobby.hostKey },
    seq: lobby.seq,
    state: lobby.state,
  }
}

async function joinAs(code: string, roomId: string, name: string) {
  const socket = await h.newClient()
  await h.expectOk(socket, C.playerLookupRoom, { code })
  const claim = await h.expectOk<ClaimResult>(socket, C.playerClaim, { roomId, name })
  return { socket, ...claim }
}

// --- Testene ----------------------------------------------------------------

describe('vert oppretter rom', () => {
  it('gir romkode, vertsnøkkel og første tilstand', async () => {
    const host = await newClient()
    const state = watch<HostView>(host, E.hostState)
    const room = await expectOk<CreateRoomResult>(host, C.hostCreateRoom, {})

    expect(room.code).toMatch(/^[A-HJ-NP-Z2-9]{4}$/)
    expect(room.hostKey.length).toBeGreaterThan(20)

    const view = await state.until(() => true)
    expect(view.code).toBe(room.code)
    expect(view.status).toBe('configuring')
    // Rommet kjenner ingen navn på forhånd — lista fylles av spillerne selv.
    expect(view.roster).toEqual([])
    expect(view.freeSlots).toBe(6)
    expect(view.joinUrl).toContain(`/bli-med/${room.code}`)
  })

  it('sender aldri vertsnøkkelen ut i en tilstand', async () => {
    const { room, state } = await createLobby()
    expect(state.latest).toBeDefined()
    expect(JSON.stringify(state.latest)).not.toContain(room.hostKey)
  })

  it('avviser en vertskommando med feil nøkkel', async () => {
    const { host, room } = await createLobby()
    const response = await ask(host, C.hostCloseRoom, {
      roomId: room.roomId,
      hostKey: 'x'.repeat(43),
      seq: 99,
    })
    expect(response.ok).toBe(false)
    if (!response.ok) expect(response.code).toBe('auth/host')
  })

  it('utfører et dobbelttrykk bare én gang', async () => {
    const { host, room } = await createLobby()
    const payload = { roomId: room.roomId, hostKey: room.hostKey, seq: 5 }

    const first = await ask(host, C.hostUpdateConfig, {
      ...payload,
      config: { format: 'bingo75', difficulty: 'normal' },
    })
    const replay = await ask(host, C.hostUpdateConfig, {
      ...payload,
      config: { format: 'bingo90', difficulty: 'normal' },
    })

    expect(first.ok).toBe(true)
    expect(replay.ok).toBe(false)
    if (!replay.ok) expect(replay.code).toBe('auth/replay')
    expect(h.game.store.get(room.roomId)?.profile.format).toBe('bingo75')
  })
})

describe('vertens oppsett', () => {
  it('sprer nye regler til hovedskjerm og telefoner', async () => {
    const { host, room, state, seq } = await createLobby()
    const ada = await joinAs(room.code, room.roomId, 'Ada')
    const telefon = watch<PlayerView>(ada.socket, E.playerState)

    await expectOk(host, C.hostUpdateConfig, {
      roomId: room.roomId,
      hostKey: room.hostKey,
      seq: seq + 1,
      config: {
        format: 'bingo75',
        difficulty: 'vanskelig',
        boardsPerPlayer: 3,
        enabledStageIds: ['row1', 'full'],
      },
    })

    const vertsView = await state.until((view) => view.config.formatName.includes('75'))
    expect(vertsView.config.boardsPerPlayer).toBe(3)
    expect(vertsView.config.stageLabels).toEqual(['Én rad', 'Fullt brett'])

    const spillerView = await telefon.until((view) =>
      view.config.formatName.includes('75'),
    )
    expect(spillerView.config.boardsPerPlayer).toBe(3)
  })

  it('nullstiller klar-status når reglene endres', async () => {
    const { host, room, state, seq } = await createLobby()
    const ada = await joinAs(room.code, room.roomId, 'Ada')
    await expectOk(ada.socket, C.playerSetReady, {
      roomId: room.roomId,
      playerId: ada.playerId,
      recoveryKey: ada.recoveryKey,
      ready: true,
    })
    await state.until((view) => view.canStart)

    await expectOk(host, C.hostUpdateConfig, {
      roomId: room.roomId,
      hostKey: room.hostKey,
      seq: seq + 1,
      config: { format: 'bingo90', difficulty: 'normal' },
    })

    const view = await state.until((v) => v.config.formatName.includes('90'))
    expect(view.canStart).toBe(false)
    expect(view.roster.find((slot) => slot.name === 'Ada')?.ready).toBe(false)
  })

  it('avviser regler som ikke kan spilles', async () => {
    const { host, room, seq } = await createLobby()
    const response = await ask(host, C.hostUpdateConfig, {
      roomId: room.roomId,
      hostKey: room.hostKey,
      seq: seq + 1,
      config: { format: 'bingo90', difficulty: 'normal', enabledStageIds: [] },
    })
    expect(response.ok).toBe(false)
    if (!response.ok) expect(response.code).toBe('config/invalid')
    expect(h.game.store.get(room.roomId)?.profile.format).toBe('kids')
  })
})

describe('fire spillere kobler seg til', () => {
  it('lar hver av de fire ta plassen sin', async () => {
    const { room, state } = await createLobby()

    for (const name of ['Ada', 'Bo', 'Cleo', 'Dina']) {
      await joinAs(room.code, room.roomId, name)
      await state.until((view) =>
        view.roster.some((slot) => slot.name === name && slot !== undefined),
      )
    }

    const view = await state.until(
      (v) => v.roster.length === 4,
    )
    expect(view.roster.every((slot) => slot.connected)).toBe(true)
  })

  it('gir ikke samme navn til to telefoner', async () => {
    const { room } = await createLobby()
    await joinAs(room.code, room.roomId, 'Ada')

    const andre = await newClient()
    await expectOk(andre, C.playerLookupRoom, { code: room.code })
    const response = await ask(andre, C.playerClaim, {
      roomId: room.roomId,
      name: 'Ada',
    })

    expect(response.ok).toBe(false)
    if (!response.ok) expect(response.code).toBe('claim/taken')
  })

  it('viser hvem som er med fra før, så navn ikke kolliderer', async () => {
    const { room } = await createLobby()
    await joinAs(room.code, room.roomId, 'Ada')

    const nykommer = await newClient()
    const lookup = await expectOk<LookupRoomResult>(nykommer, C.playerLookupRoom, {
      code: room.code,
    })
    expect(lookup.roster.map((slot) => slot.name)).toEqual(['Ada'])
  })

  it('avviser en ukjent romkode', async () => {
    await createLobby()
    const socket = await newClient()
    const response = await ask(socket, C.playerLookupRoom, { code: 'ZZZZ' })
    expect(response.ok).toBe(false)
    if (!response.ok) expect(response.code).toBe('room/notFound')
  })

  it('slipper ingen inn før verten har åpnet lobbyen', async () => {
    const host = await newClient()
    const room = await expectOk<CreateRoomResult>(host, C.hostCreateRoom, {})
    const socket = await newClient()
    const response = await ask(socket, C.playerLookupRoom, { code: room.code })
    expect(response.ok).toBe(false)
    if (!response.ok) expect(response.code).toBe('room/notOpen')
  })

  it('slipper inn et hvilket som helst rimelig navn', async () => {
    const { room } = await createLobby()
    const socket = await newClient()
    await expectOk(socket, C.playerLookupRoom, { code: room.code })
    await expectOk(socket, C.playerClaim, { roomId: room.roomId, name: 'Åse-Marie' })
    expect(h.game.store.get(room.roomId)?.players[0].name).toBe('Åse-Marie')
  })

  it('avviser navn som ikke lar seg vise', async () => {
    const { room } = await createLobby()
    const socket = await newClient()
    await expectOk(socket, C.playerLookupRoom, { code: room.code })

    const forLangt = await ask(socket, C.playerClaim, {
      roomId: room.roomId,
      name: 'Bartolomeus den store',
    })
    expect(forLangt.ok).toBe(false)

    const rart = await ask(socket, C.playerClaim, {
      roomId: room.roomId,
      name: '🎉🎉🎉',
    })
    expect(rart.ok).toBe(false)
    if (!rart.ok) expect(rart.code).toBe('name/badCharacters')
  })

  it('lar ikke to spillere hete det samme, uansett store bokstaver', async () => {
    const { room } = await createLobby()
    await joinAs(room.code, room.roomId, 'Ada')

    const andre = await newClient()
    await expectOk(andre, C.playerLookupRoom, { code: room.code })
    const svar = await ask(andre, C.playerClaim, { roomId: room.roomId, name: 'ada' })
    expect(svar.ok).toBe(false)
    if (!svar.ok) expect(svar.code).toBe('claim/taken')
  })
})

describe('klar-status', () => {
  it('lar verten starte først når alle er klare', async () => {
    const { room, state } = await createLobby()
    const ada = await joinAs(room.code, room.roomId, 'Ada')
    const edvin = await joinAs(room.code, room.roomId, 'Bo')

    await expectOk(ada.socket, C.playerSetReady, {
      roomId: room.roomId,
      playerId: ada.playerId,
      recoveryKey: ada.recoveryKey,
      ready: true,
    })

    // Én av to er klar: verten skal fortsatt ikke kunne starte.
    const halvveis = await state.until((view) =>
      Boolean(view.roster.find((slot) => slot.name === 'Ada')?.ready),
    )
    expect(halvveis.canStart).toBe(false)

    await expectOk(edvin.socket, C.playerSetReady, {
      roomId: room.roomId,
      playerId: edvin.playerId,
      recoveryKey: edvin.recoveryKey,
      ready: true,
    })
    const view = await state.until((v) => v.canStart)
    expect(view.status).toBe('ready')
  })

  it('lar ikke en spiller melde noen andre klar', async () => {
    const { room } = await createLobby()
    const ada = await joinAs(room.code, room.roomId, 'Ada')
    const edvin = await joinAs(room.code, room.roomId, 'Bo')

    const response = await ask(ada.socket, C.playerSetReady, {
      roomId: room.roomId,
      playerId: edvin.playerId,
      recoveryKey: ada.recoveryKey,
      ready: true,
    })
    expect(response.ok).toBe(false)
    if (!response.ok) expect(response.code).toBe('auth/player')
  })

  it('sender bare spillerens egne data til spilleren', async () => {
    const { room } = await createLobby()
    const ada = await joinAs(room.code, room.roomId, 'Ada')
    const egen = watch<PlayerView>(ada.socket, E.playerState)
    await joinAs(room.code, room.roomId, 'Bo')
    const view = await egen.until((v) => Boolean(v.me))

    expect(view.me?.name).toBe('Ada')
    expect(JSON.stringify(view)).not.toContain(ada.recoveryKey)
  })
})

describe('frakobling og reconnect', () => {
  it('markerer en spiller som frakoblet når telefonen forsvinner', async () => {
    const { room, state } = await createLobby()
    const ada = await joinAs(room.code, room.roomId, 'Ada')
    await state.until((view) =>
      view.roster.some((slot) => slot.name === 'Ada' && slot !== undefined),
    )

    ada.socket.disconnect()
    await state.until((view) =>
      view.roster.some(
        (slot) => slot.name === 'Ada' && !slot.connected,
      ),
    )
  })

  it('gir spilleren plassen tilbake med gjenopprettingsnøkkelen', async () => {
    const { room, state } = await createLobby()
    const ada = await joinAs(room.code, room.roomId, 'Ada')
    ada.socket.disconnect()
    await state.until((view) =>
      view.roster.some((slot) => slot.name === 'Ada' && !slot.connected),
    )

    const nyTelefon = await newClient()
    await expectOk(nyTelefon, C.playerResume, {
      roomId: room.roomId,
      playerId: ada.playerId,
      recoveryKey: ada.recoveryKey,
    })
    await state.until((view) =>
      view.roster.some((slot) => slot.name === 'Ada' && slot.connected),
    )
  })

  it('nekter en fremmed telefon å overta plassen', async () => {
    const { room } = await createLobby()
    const ada = await joinAs(room.code, room.roomId, 'Ada')

    const tyv = await newClient()
    const response = await ask(tyv, C.playerResume, {
      roomId: room.roomId,
      playerId: ada.playerId,
      recoveryKey: 'y'.repeat(43),
    })
    expect(response.ok).toBe(false)
    if (!response.ok) expect(response.code).toBe('auth/player')
  })
})

describe('avslutning og opprydding', () => {
  it('varsler alle og sletter rommet når verten avslutter', async () => {
    const { host, room, seq } = await createLobby()
    const ada = await joinAs(room.code, room.roomId, 'Ada')

    const varsel = new Promise<void>((resolve) =>
      ada.socket.once(E.roomClosed, () => resolve()),
    )
    await expectOk(host, C.hostCloseRoom, {
      roomId: room.roomId,
      hostKey: room.hostKey,
      seq: seq + 1,
    })
    await varsel
    expect(h.game.store.get(room.roomId)).toBeUndefined()
  })

  it('rydder bort rom som har stått stille for lenge', async () => {
    const { room } = await createLobby()
    const stored = h.game.store.get(room.roomId)!
    stored.lastActivityAt = Date.now() - 60 * 60 * 1000

    expect(h.game.sweep()).toBe(1)
    expect(h.game.store.get(room.roomId)).toBeUndefined()
  })
})
