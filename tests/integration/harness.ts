import { createServer, type Server as HttpServer } from 'node:http'
import { afterEach, beforeEach } from 'vitest'
import { Server as SocketServer } from 'socket.io'
import { io as connect, type Socket } from 'socket.io-client'
import { attachSocketHandlers } from '@/infra/socket/server'
import { InMemoryRoomStore } from '@/infra/store/roomStore'
import { SelfieStore } from '@/infra/store/selfieStore'
import { GameService } from '@/server/gameService'
import {
  C,
  E,
  type Ack,
  type ClaimResult,
  type CreateRoomResult,
  type HostView,
  type LookupRoomResult,
} from '@/shared/protocol'

/**
 * Felles rigg for integrasjonstestene: en ekte socketserver i prosessen, ekte
 * klienter over websocket, ingen mock av protokollen. Det er nettopp koblingen
 * mellom lagene disse testene skal fange feil i.
 */
export interface Harness {
  readonly game: GameService
  readonly port: number
  newClient(): Promise<Socket>
  ask<T>(socket: Socket, event: string, payload: unknown): Promise<Ack<T>>
  expectOk<T>(socket: Socket, event: string, payload: unknown): Promise<T>
  createLobby(config?: unknown): Promise<Lobby>
  joinAs(lobby: Lobby, name: string): Promise<JoinedPlayer>
}

export interface Lobby {
  host: Socket
  roomId: string
  code: string
  hostKey: string
  seq: number
  state: Watcher<HostView>
  /** Neste sekvensnummer for en vertskommando. */
  next(): { roomId: string; hostKey: string; seq: number }
}

export interface JoinedPlayer {
  socket: Socket
  playerId: string
  recoveryKey: string
  auth: { roomId: string; playerId: string; recoveryKey: string }
}

export interface Watcher<T> {
  readonly latest: T | undefined
  until(matches: (view: T) => boolean, timeoutMs?: number): Promise<T>
}

/**
 * Følger med på alle tilstandsoppdateringer en klient mottar. `until` ser også
 * bakover i det som allerede har kommet — ellers ville hver test hatt et
 * kappløp mot serveren om hvem som rekker først.
 */
export function watch<T>(socket: Socket, event: string): Watcher<T> {
  const seen: T[] = []
  const waiting: Array<{ matches: (view: T) => boolean; resolve: (view: T) => void }> = []

  socket.on(event, (view: T) => {
    seen.push(view)
    for (let i = waiting.length - 1; i >= 0; i--) {
      if (waiting[i].matches(view)) {
        waiting[i].resolve(view)
        waiting.splice(i, 1)
      }
    }
  })

  return {
    get latest() {
      return seen.at(-1)
    },
    until(matches, timeoutMs = 3000) {
      const already = [...seen].reverse().find(matches)
      if (already) return Promise.resolve(already)
      return new Promise((resolve, reject) => {
        const waiter = { matches, resolve }
        waiting.push(waiter)
        setTimeout(() => {
          const index = waiting.indexOf(waiter)
          if (index === -1) return
          waiting.splice(index, 1)
          reject(new Error(`Ingen ${event} som passet innen ${timeoutMs} ms`))
        }, timeoutMs)
      })
    },
  }
}

export function setupHarness(): Harness {
  let http: HttpServer
  let io: SocketServer
  let game: GameService
  let port = 0
  const clients: Socket[] = []

  beforeEach(async () => {
    http = createServer()
    io = new SocketServer(http)
    game = new GameService(
      io,
      new InMemoryRoomStore(),
      new SelfieStore(),
      () => `http://localhost:${port}`,
    )
    attachSocketHandlers(io, game)
    await new Promise<void>((resolve) => {
      http.listen(0, () => {
        port = (http.address() as { port: number }).port
        resolve()
      })
    })
  })

  afterEach(async () => {
    game.dispose()
    for (const client of clients.splice(0)) client.disconnect()
    await io.close()
    await new Promise<void>((resolve) => http.close(() => resolve()))
  })

  async function newClient(): Promise<Socket> {
    const socket = connect(`http://localhost:${port}`, { transports: ['websocket'] })
    clients.push(socket)
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve())
      socket.once('connect_error', reject)
    })
    return socket
  }

  function ask<T>(socket: Socket, event: string, payload: unknown): Promise<Ack<T>> {
    return new Promise((resolve) => {
      socket.emit(event, payload, (response: Ack<T>) => resolve(response))
    })
  }

  async function expectOk<T>(
    socket: Socket,
    event: string,
    payload: unknown,
  ): Promise<T> {
    const response = await ask<T>(socket, event, payload)
    if (!response.ok) {
      throw new Error(`${event} feilet: ${response.code} ${response.message}`)
    }
    return response.data
  }

  async function createLobby(config?: unknown): Promise<Lobby> {
    const host = await newClient()
    const state = watch<HostView>(host, E.hostState)
    const created = await expectOk<CreateRoomResult>(host, C.hostCreateRoom, { config })
    await state.until(() => true)

    const lobby: Lobby = {
      host,
      roomId: created.roomId,
      code: created.code,
      hostKey: created.hostKey,
      seq: 0,
      state,
      next() {
        lobby.seq += 1
        return { roomId: lobby.roomId, hostKey: lobby.hostKey, seq: lobby.seq }
      },
    }

    await expectOk(host, C.hostOpenLobby, lobby.next())
    await state.until((view) => view.status === 'lobby')
    return lobby
  }

  async function joinAs(lobby: Lobby, name: string): Promise<JoinedPlayer> {
    const socket = await newClient()
    await expectOk<LookupRoomResult>(socket, C.playerLookupRoom, { code: lobby.code })
    const claim = await expectOk<ClaimResult>(socket, C.playerClaim, {
      roomId: lobby.roomId,
      name,
    })
    return {
      socket,
      ...claim,
      auth: {
        roomId: lobby.roomId,
        playerId: claim.playerId,
        recoveryKey: claim.recoveryKey,
      },
    }
  }

  return {
    get game() {
      return game
    },
    get port() {
      return port
    },
    newClient,
    ask,
    expectOk,
    createLobby,
    joinAs,
  }
}

/** Melder alle spillerne klare og starter runden. */
export async function startRound(
  h: Harness,
  lobby: Lobby,
  players: JoinedPlayer[],
): Promise<void> {
  for (const player of players) {
    await h.expectOk(player.socket, C.playerSetReady, { ...player.auth, ready: true })
  }
  await lobby.state.until((view) => view.canStart)
  await h.expectOk(lobby.host, C.hostStartGame, lobby.next())
  await lobby.state.until((view) => view.round !== null)
}
