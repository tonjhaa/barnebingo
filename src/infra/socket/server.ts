import type { Server, Socket } from 'socket.io'
import type { ZodType } from 'zod'
import { defaultConfigInput } from '@/domain/formats/registry'
import { RateLimiter, type BucketName } from '@/infra/rateLimit'
import { log } from '@/infra/logger'
import { GameService, hostChannel } from '@/server/gameService'
import {
  C,
  HostAdvancePrizeSchema,
  HostCloseRoomSchema,
  HostCreateRoomSchema,
  HostDrawNextSchema,
  HostNewRoundSchema,
  HostOpenLobbySchema,
  HostPauseSchema,
  HostResumeGameSchema,
  HostResumeSchema,
  HostStartGameSchema,
  HostTakeoverSchema,
  HostUpdateConfigSchema,
  PlayerClaimBingoSchema,
  PlayerClaimSchema,
  PlayerLookupRoomSchema,
  PlayerMarkSchema,
  PlayerRequestTakeoverSchema,
  PlayerResumeSchema,
  PlayerSetActiveBoardSchema,
  PlayerSetReadySchema,
  PlayerUploadSelfieSchema,
  PlayerUseAvatarSchema,
  type Ack,
} from '@/shared/protocol'
import { buildConfigSummary, buildRoster } from '@/server/views'

type AckFn<T> = (response: Ack<T>) => void

/**
 * Én generisk kanal for alle kommandoer: valider skjema, sjekk rate limit,
 * kjør, svar. Ingen handler får røre rå input, og ingen kan glemme å validere.
 */
function command<I, O>(
  socket: Socket,
  limiter: RateLimiter,
  event: string,
  schema: ZodType<I>,
  bucket: BucketName,
  run: (input: I, ack: AckFn<O>) => void,
): void {
  socket.on(event, (raw: unknown, ack?: AckFn<O>) => {
    const respond: AckFn<O> = (response) => ack?.(response)

    if (!limiter.take(socket.id, bucket, Date.now())) {
      respond({ ok: false, code: 'rate/limited', message: 'Litt for fort. Prøv igjen.' })
      return
    }

    const parsed = schema.safeParse(raw)
    if (!parsed.success) {
      log.warn('ugyldig melding', { event, issue: parsed.error.issues[0]?.message })
      respond({ ok: false, code: 'input/invalid', message: 'Meldingen var ikke gyldig.' })
      return
    }

    try {
      run(parsed.data, respond)
    } catch (error) {
      log.error('kommando feilet', { event, error: String(error) })
      respond({ ok: false, code: 'server/error', message: 'Noe gikk galt her.' })
    }
  })
}

export function attachSocketHandlers(io: Server, game: GameService): void {
  const limiter = new RateLimiter()

  io.on('connection', (socket) => {
    log.debug('socket tilkoblet', { id: socket.id })

    // --- Vert ------------------------------------------------------------

    command(socket, limiter, C.hostCreateRoom, HostCreateRoomSchema, 'hostCommand',
      (input, respond) => {
        const created = game.createRoom(input.config ?? defaultConfigInput())
        if (!created.ok) return respond(created)
        const { roomId } = created.value
        socket.join(hostChannel(roomId))
        game.hostAttached(socket.id, roomId)
        respond({ ok: true, data: created.value })
        const room = game.store.get(roomId)
        if (room) game.sendHostState(socket.id, room)
      })

    command(socket, limiter, C.hostResume, HostResumeSchema, 'hostCommand',
      (input, respond) => {
        const result = game.resumeHost(input)
        if (!result.ok) return respond(result)
        socket.join(hostChannel(result.value.id))
        game.hostAttached(socket.id, result.value.id)
        respond({ ok: true, data: { roomId: result.value.id } })
        game.sendHostState(socket.id, result.value)
      })

    command(socket, limiter, C.hostUpdateConfig, HostUpdateConfigSchema, 'hostCommand',
      (input, respond) => {
        const result = game.updateConfig(input)
        respond(result.ok ? { ok: true, data: null } : result)
      })

    command(socket, limiter, C.hostOpenLobby, HostOpenLobbySchema, 'hostCommand',
      (input, respond) => {
        const result = game.openLobby(input)
        respond(result.ok ? { ok: true, data: null } : result)
      })

    command(socket, limiter, C.hostCloseRoom, HostCloseRoomSchema, 'hostCommand',
      (input, respond) => {
        const result = game.closeRoom(input)
        respond(result.ok ? { ok: true, data: null } : result)
      })

    command(socket, limiter, C.hostStartGame, HostStartGameSchema, 'hostCommand',
      (input, respond) => {
        const result = game.startGame(input)
        respond(result.ok ? { ok: true, data: null } : result)
      })

    command(socket, limiter, C.hostDrawNext, HostDrawNextSchema, 'draw',
      (input, respond) => {
        const result = game.drawNext(input)
        respond(result.ok ? { ok: true, data: { number: result.value } } : result)
      })

    command(socket, limiter, C.hostPause, HostPauseSchema, 'hostCommand',
      (input, respond) => {
        const result = game.pause(input)
        respond(result.ok ? { ok: true, data: null } : result)
      })

    command(socket, limiter, C.hostResumeGame, HostResumeGameSchema, 'hostCommand',
      (input, respond) => {
        const result = game.resumeGame(input)
        respond(result.ok ? { ok: true, data: null } : result)
      })

    command(socket, limiter, C.hostAdvancePrize, HostAdvancePrizeSchema, 'hostCommand',
      (input, respond) => {
        const result = game.advancePrize(input)
        respond(result.ok ? { ok: true, data: null } : result)
      })

    command(socket, limiter, C.hostNewRound, HostNewRoundSchema, 'hostCommand',
      (input, respond) => {
        const result = game.newRound(input)
        respond(result.ok ? { ok: true, data: null } : result)
      })

    command(socket, limiter, C.hostApproveTakeover, HostTakeoverSchema, 'hostCommand',
      (input, respond) => {
        const result = game.approveTakeover(input)
        respond(result.ok ? { ok: true, data: null } : result)
      })

    command(socket, limiter, C.hostDenyTakeover, HostTakeoverSchema, 'hostCommand',
      (input, respond) => {
        const result = game.denyTakeover(input)
        respond(result.ok ? { ok: true, data: null } : result)
      })

    // --- Spiller ---------------------------------------------------------

    command(socket, limiter, C.playerLookupRoom, PlayerLookupRoomSchema, 'lookup',
      (input, respond) => {
        const result = game.lookupRoom(input.code)
        if (!result.ok) return respond(result)
        const room = result.value
        // Telefonen bindes til rommet uten spiller-id. Da får den live
        // oppdateringer av hvem som er opptatt mens den står på navnevalget,
        // uten å eie en plass ennå.
        game.bind(socket.id, { roomId: room.id, role: 'player' })
        respond({
          ok: true,
          data: {
            roomId: room.id,
            code: room.code,
            status: room.status,
            roster: buildRoster(room),
            config: buildConfigSummary(room.profile),
          },
        })
      })

    command(socket, limiter, C.playerClaim, PlayerClaimSchema, 'claim',
      (input, respond) => {
        const result = game.claim(input)
        if (!result.ok) return respond(result)
        const { room, playerId, recoveryKey } = result.value
        game.bind(socket.id, { roomId: room.id, role: 'player', playerId })
        respond({ ok: true, data: { playerId, recoveryKey } })
        game.broadcast(room)
      })

    command(socket, limiter, C.playerResume, PlayerResumeSchema, 'lookup',
      (input, respond) => {
        const result = game.resumePlayer(input)
        if (!result.ok) return respond(result)
        const { room, playerId } = result.value
        game.bind(socket.id, { roomId: room.id, role: 'player', playerId })
        respond({ ok: true, data: { playerId } })
        game.broadcast(room)
      })

    command(socket, limiter, C.playerSetReady, PlayerSetReadySchema, 'hostCommand',
      (input, respond) => {
        const result = game.setReady(input)
        respond(result.ok ? { ok: true, data: null } : result)
      })

    command(socket, limiter, C.playerSetActiveBoard, PlayerSetActiveBoardSchema, 'mark',
      (input, respond) => {
        const result = game.setActiveBoard(input)
        respond(result.ok ? { ok: true, data: null } : result)
      })

    command(socket, limiter, C.playerMark, PlayerMarkSchema, 'mark',
      (input, respond) => {
        const result = game.mark(input)
        respond(result.ok ? { ok: true, data: { value: result.value } } : result)
      })

    command(socket, limiter, C.playerUnmark, PlayerMarkSchema, 'mark',
      (input, respond) => {
        const result = game.unmark(input)
        respond(result.ok ? { ok: true, data: { value: result.value } } : result)
      })

    command(socket, limiter, C.playerClaimBingo, PlayerClaimBingoSchema, 'bingo',
      (input, respond) => {
        const result = game.claimBingo(input)
        respond(result.ok ? { ok: true, data: result.value } : result)
      })

    command(socket, limiter, C.playerUploadSelfie, PlayerUploadSelfieSchema, 'selfie',
      (input, respond) => {
        const result = game.uploadSelfie(input)
        respond(result.ok ? { ok: true, data: result.value } : result)
      })

    command(socket, limiter, C.playerUseAvatar, PlayerUseAvatarSchema, 'mark',
      (input, respond) => {
        const result = game.chooseAvatar(input)
        respond(result.ok ? { ok: true, data: null } : result)
      })

    command(socket, limiter, C.playerRequestTakeover, PlayerRequestTakeoverSchema, 'claim',
      (input, respond) => {
        const result = game.requestTakeover(socket.id, input)
        respond(result.ok ? { ok: true, data: null } : result)
      })

    socket.on('disconnect', () => {
      limiter.forget(socket.id)
      game.handleDisconnect(socket.id)
    })
  })
}
