import type { Server } from 'socket.io'
import { generateRoomCode } from '@/domain/ids'
import { buildProfile } from '@/domain/formats/registry'
import type { ConfigInput } from '@/domain/formats/types'
import {
  afterDraw,
  approveTakeover,
  claimBingo,
  claimPlayer,
  closeRoom,
  createRoom,
  findPlayer,
  findPlayerByName,
  closeExhaustedRound,
  markOnBoard,
  newRound,
  nextStage,
  noteEvent,
  openLobby,
  requireActiveRound,
  resolveBingo,
  setConnected,
  setReady,
  setSelfie,
  startGame,
  touch,
  unmarkOnBoard,
  updateConfig,
  selectAvatar,
  type Room,
} from '@/domain/room'
import type { GameEventData } from '@/domain/audio/events'
import { currentStage, drawNext, pauseRound, resumeRound } from '@/domain/round'
import { randomSeed } from '@/domain/rng'
import { err, ok, type Result } from '@/domain/result'
import { secretsMatch } from '@/domain/ids'
import { expiredRooms, type RoomStore } from '@/infra/store/roomStore'
import { SelfieStore, validateSelfie } from '@/infra/store/selfieStore'
import { log } from '@/infra/logger'
import { E, type ClaimResult, type CreateRoomResult } from '@/shared/protocol'
import { buildHostView, buildPlayerView } from './views'

export type SocketRole = 'host' | 'player'

export interface SocketBinding {
  roomId: string
  role: SocketRole
  playerId?: string
}

/**
 * Socket.IO leverer binærdata som Buffer eller ArrayBuffer avhengig av klienten.
 * Alt annet er en klient som prøver seg på noe.
 */
function toBuffer(data: unknown): Buffer | null {
  if (Buffer.isBuffer(data)) return data
  if (data instanceof ArrayBuffer) return Buffer.from(data)
  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength)
  }
  return null
}

function takeoverKey(roomId: string, name: string): string {
  return `${roomId}:${name}`
}

export function hostChannel(roomId: string): string {
  return `host:${roomId}`
}

/**
 * Applikasjonslaget. Oversetter kommandoer til domenekall, håndhever
 * autorisasjon, og sender ut nye øyeblikksbilder. Domenet vet ingenting om
 * sockets; sockets vet ingenting om bingoregler.
 */
export class GameService {
  private bindings = new Map<string, SocketBinding>()
  private drawTimers = new Map<string, NodeJS.Timeout>()
  private bingoTimers = new Map<string, NodeJS.Timeout>()
  /** Telefoner som venter på at verten skal slippe dem inn (§23). */
  private takeovers = new Map<string, { socketId: string; roomId: string; name: string }>()

  constructor(
    private readonly io: Server,
    private readonly rooms: RoomStore,
    private readonly selfies: SelfieStore,
    private readonly baseUrl: () => string,
    /** Adressen til sertifikathjelpen, eller null når appen kjører uten HTTPS. */
    private readonly certHelpUrl: () => string | null = () => null,
    private readonly clock: () => number = () => Date.now(),
  ) {}

  // --- Autorisasjon --------------------------------------------------------

  private requireRoom(roomId: string): Result<Room> {
    const room = this.rooms.get(roomId)
    if (!room || room.status === 'closed') {
      return err('room/notFound', 'Rommet finnes ikke lenger.')
    }
    return ok(room)
  }

  /**
   * Vertskommandoer krever nøkkel *og* et sekvensnummer som er høyere enn sist.
   * Det siste er det som gjør «vert trykker fem ganger raskt» til én handling
   * uansett hvor mange ganger meldingen kommer fram.
   */
  private requireHost(input: {
    roomId: string
    hostKey: string
    seq: number
  }): Result<Room> {
    const found = this.requireRoom(input.roomId)
    if (!found.ok) return found
    const room = found.value
    if (!secretsMatch(room.hostKey, input.hostKey)) {
      return err('auth/host', 'Du er ikke vert for dette rommet.')
    }
    if (input.seq <= room.hostSeq) {
      return err('auth/replay', 'Kommandoen er allerede utført.')
    }
    room.hostSeq = input.seq
    return ok(room)
  }

  private requirePlayer(input: {
    roomId: string
    playerId: string
    recoveryKey: string
  }): Result<{ room: Room; playerId: string }> {
    const found = this.requireRoom(input.roomId)
    if (!found.ok) return found
    const room = found.value
    const player = findPlayer(room, input.playerId)
    if (!player || !secretsMatch(player.recoveryKey, input.recoveryKey)) {
      return err('auth/player', 'Vi kjente deg ikke igjen. Bli med på nytt.')
    }
    return ok({ room, playerId: player.id })
  }

  /**
   * Noterer en hendelse for lydsystemet. Kalles bare etter at kommandoen
   * faktisk lyktes — en avvist kommando skal ikke få programlederen til å
   * kommentere noe som ikke skjedde.
   */
  private note(room: Room, data: GameEventData): void {
    noteEvent(room, data, this.clock())
  }

  // --- Utsending -----------------------------------------------------------

  /**
   * Ett fullt, filtrert øyeblikksbilde per mottaker ved hver endring. Med maks
   * fem klienter er dette billigere enn å vedlikeholde granulære diff-hendelser,
   * og en spiller kan strukturelt ikke motta en annen spillers data.
   */
  broadcast(room: Room): void {
    const borte = !this.hostPresent(room.id)
    this.io
      .to(hostChannel(room.id))
      .emit(E.hostState, buildHostView(room, this.baseUrl(), this.pendingTakeovers(room.id), this.certHelpUrl()))
    for (const [socketId, binding] of this.bindings) {
      if (binding.roomId !== room.id || binding.role !== 'player') continue
      this.io
        .to(socketId)
        .emit(E.playerState, buildPlayerView(room, binding.playerId ?? null, borte))
    }
  }

  sendPlayerState(socketId: string, room: Room, playerId: string | null): void {
    this.io
      .to(socketId)
      .emit(E.playerState, buildPlayerView(room, playerId, !this.hostPresent(room.id)))
  }

  sendHostState(socketId: string, room: Room): void {
    this.io
      .to(socketId)
      .emit(E.hostState, buildHostView(room, this.baseUrl(), this.pendingTakeovers(room.id), this.certHelpUrl()))
  }

  // --- Bindinger -----------------------------------------------------------

  bind(socketId: string, binding: SocketBinding): void {
    this.bindings.set(socketId, binding)
  }

  /**
   * Hovedskjermen har koblet seg til. Bindingen må være på plass før trekkingen
   * settes i gang igjen — ellers ville `scheduleAutoDraw` sett en tom stue.
   */
  hostAttached(socketId: string, roomId: string): void {
    this.bind(socketId, { roomId, role: 'host' })
    const room = this.rooms.get(roomId)
    if (!room) return
    this.scheduleAutoDraw(room)
    this.broadcast(room)
  }

  binding(socketId: string): SocketBinding | undefined {
    return this.bindings.get(socketId)
  }

  unbind(socketId: string): SocketBinding | undefined {
    const binding = this.bindings.get(socketId)
    this.bindings.delete(socketId)
    return binding
  }

  /** Er navnet fortsatt bundet til en annen levende socket? */
  private hasOtherSocketFor(playerId: string, exceptSocketId: string): boolean {
    for (const [socketId, binding] of this.bindings) {
      if (socketId !== exceptSocketId && binding.playerId === playerId) return true
    }
    return false
  }

  /** Sitter noen ved hovedskjermen akkurat nå? */
  hostPresent(roomId: string, exceptSocketId?: string): boolean {
    for (const [socketId, binding] of this.bindings) {
      if (socketId === exceptSocketId) continue
      if (binding.roomId === roomId && binding.role === 'host') return true
    }
    return false
  }

  // --- Vertskommandoer -----------------------------------------------------

  createRoom(configInput: ConfigInput): Result<CreateRoomResult> {
    const now = this.clock()
    const code = generateRoomCode((candidate) => this.rooms.codeTaken(candidate))
    const room = createRoom({ code, configInput, now })
    this.rooms.save(room)
    log.info('rom opprettet', { code, format: configInput.format })
    return ok({ roomId: room.id, code: room.code, hostKey: room.hostKey })
  }

  updateConfig(input: {
    roomId: string
    hostKey: string
    seq: number
    config: ConfigInput
  }): Result<Room> {
    const auth = this.requireHost(input)
    if (!auth.ok) return auth
    const room = auth.value
    const updated = updateConfig(room, input.config)
    if (!updated.ok) return updated
    touch(room, this.clock())
    this.broadcast(room)
    return ok(room)
  }

  openLobby(input: { roomId: string; hostKey: string; seq: number }): Result<Room> {
    const auth = this.requireHost(input)
    if (!auth.ok) return auth
    const room = auth.value
    const opened = openLobby(room)
    if (!opened.ok) return opened
    this.note(room, { kind: 'roomOpened' })
    touch(room, this.clock())
    this.broadcast(room)
    log.info('lobby åpnet', { code: room.code })
    return ok(room)
  }

  resumeHost(input: { roomId: string; hostKey: string }): Result<Room> {
    const found = this.requireRoom(input.roomId)
    if (!found.ok) return found
    if (!secretsMatch(found.value.hostKey, input.hostKey)) {
      return err('auth/host', 'Du er ikke vert for dette rommet.')
    }
    touch(found.value, this.clock())
    return ok(found.value)
  }

  closeRoom(input: { roomId: string; hostKey: string; seq: number }): Result<Room> {
    const auth = this.requireHost(input)
    if (!auth.ok) return auth
    const room = auth.value
    this.note(room, { kind: 'gameEnded' })
    closeRoom(room)
    this.io.to(hostChannel(room.id)).emit(E.roomClosed, { reason: 'host' })
    for (const [socketId, binding] of this.bindings) {
      if (binding.roomId === room.id) {
        this.io.to(socketId).emit(E.roomClosed, { reason: 'host' })
      }
    }
    this.purge(room)
    log.info('rom avsluttet av vert', { code: room.code })
    return ok(room)
  }

  // --- Runden --------------------------------------------------------------

  startGame(input: { roomId: string; hostKey: string; seq: number }): Result<Room> {
    const auth = this.requireHost(input)
    if (!auth.ok) return auth
    const room = auth.value

    const started = startGame(room, randomSeed(), this.clock())
    if (!started.ok) return started

    this.note(room, {
      kind: 'roundStarted',
      names: room.players.map((player) => player.name),
      stageLabel: currentStage(started.value)?.label ?? '',
      roundNumber: room.history.length + 1,
    })
    touch(room, this.clock())
    this.broadcast(room)
    this.scheduleAutoDraw(room)
    log.info('runde startet', {
      code: room.code,
      format: room.profile.format,
      spillere: room.players.length,
      brett: room.profile.boardsPerPlayer,
    })
    return ok(room)
  }

  drawNext(input: { roomId: string; hostKey: string; seq: number }): Result<number> {
    const auth = this.requireHost(input)
    if (!auth.ok) return auth
    return this.performDraw(auth.value)
  }

  pause(input: { roomId: string; hostKey: string; seq: number }): Result<Room> {
    const auth = this.requireHost(input)
    if (!auth.ok) return auth
    const room = auth.value
    const active = requireActiveRound(room)
    if (!active.ok) return active

    const paused = pauseRound(active.value)
    if (!paused.ok) return paused

    this.note(room, { kind: 'paused' })

    // Timeren stoppes her, ikke i grensesnittet. Ellers ville et tall blitt
    // trukket mens spillet «står stille» (ARKITEKTUR.md §9 K10).
    this.clearAutoDraw(room.id)
    touch(room, this.clock())
    this.broadcast(room)
    return ok(room)
  }

  resumeGame(input: { roomId: string; hostKey: string; seq: number }): Result<Room> {
    const auth = this.requireHost(input)
    if (!auth.ok) return auth
    const room = auth.value
    const active = requireActiveRound(room)
    if (!active.ok) return active

    const resumed = resumeRound(active.value)
    if (!resumed.ok) return resumed

    this.note(room, { kind: 'resumed' })
    touch(room, this.clock())
    this.broadcast(room)
    this.scheduleAutoDraw(room)
    return ok(room)
  }

  private performDraw(room: Room): Result<number> {
    const active = requireActiveRound(room)
    if (!active.ok) {
      this.clearAutoDraw(room.id)
      return active
    }

    const now = this.clock()
    const result = drawNext(active.value, now)
    if (!result.ok) {
      // Kula gikk tom. Da er runden over, og resultatskjermen tar over.
      this.clearAutoDraw(room.id)
      closeExhaustedRound(room, now)
      this.broadcast(room)
      return result
    }

    if (afterDraw(room, result.value, now)) {
      // Automatisk vinner avgjøres med én gang — alle som oppfyller kravet
      // gjør det på det samme trekket, så det finnes ingenting å vente på.
      this.clearAutoDraw(room.id)
      this.finishBingo(room)
      return result
    }

    touch(room, now)
    this.broadcast(room)
    this.scheduleAutoDraw(room)
    return result
  }

  /**
   * Kjedet setTimeout framfor setInterval: intervallet måles fra det tallet som
   * faktisk ble trukket, så et manuelt trekk midt i en automatisk runde
   * forskyver neste tall i stedet for å komme rett oppå det.
   */
  private scheduleAutoDraw(room: Room): void {
    this.clearAutoDraw(room.id)
    const round = room.round
    if (!round || round.status !== 'active') return
    if (round.profile.drawMode !== 'auto') return
    // Ingen ved hovedskjermen betyr ingen som hører tallene. Å trekke videre
    // ville betydd at barna satt og ventet på tall som allerede var forbi.
    if (!this.hostPresent(room.id)) return

    const timer = setTimeout(() => {
      this.drawTimers.delete(room.id)
      const current = this.rooms.get(room.id)
      if (current) this.performDraw(current)
    }, round.profile.drawIntervalMs)

    timer.unref?.()
    this.drawTimers.set(room.id, timer)
  }

  private clearAutoDraw(roomId: string): void {
    const timer = this.drawTimers.get(roomId)
    if (timer) {
      clearTimeout(timer)
      this.drawTimers.delete(roomId)
    }
  }

  // --- Markering og bingo --------------------------------------------------

  mark(input: {
    roomId: string
    playerId: string
    recoveryKey: string
    boardId: string
    value: number
  }): Result<number> {
    const auth = this.requirePlayer(input)
    if (!auth.ok) return auth
    const { room } = auth.value

    const result = markOnBoard(room, input.playerId, input.boardId, input.value)
    if (!result.ok) return result

    touch(room, this.clock())
    this.broadcast(room)
    return result
  }

  unmark(input: {
    roomId: string
    playerId: string
    recoveryKey: string
    boardId: string
    value: number
  }): Result<number> {
    const auth = this.requirePlayer(input)
    if (!auth.ok) return auth
    const { room } = auth.value

    const result = unmarkOnBoard(room, input.playerId, input.boardId, input.value)
    if (!result.ok) return result

    touch(room, this.clock())
    this.broadcast(room)
    return result
  }

  /**
   * Spilleren roper BINGO. Første gyldige krav fryser trekkingen og åpner et
   * kort vindu der andre rekker å bli med (§9 K5) — en treg telefon eller en
   * treg femåring skal ikke koste premien.
   */
  claimBingo(input: {
    roomId: string
    playerId: string
    recoveryKey: string
  }): Result<{ closesAt: number }> {
    const auth = this.requirePlayer(input)
    if (!auth.ok) return auth
    const { room } = auth.value

    const result = claimBingo(room, input.playerId, this.clock())
    if (!result.ok) {
      // Et bomtrykk noterte en hendelse, og hovedskjermen skal svare på det.
      // Uten denne utsendingen ville programlederen tidd om et barn som
      // nettopp trykket BINGO og tok feil.
      this.broadcast(room)
      return result
    }

    this.clearAutoDraw(room.id)
    touch(room, this.clock())
    this.broadcast(room)
    this.scheduleBingoResolve(room, result.value.closesAt)
    return result
  }

  /** Ny runde med de samme spillerne (§28). */
  newRound(input: { roomId: string; hostKey: string; seq: number }): Result<Room> {
    const auth = this.requireHost(input)
    if (!auth.ok) return auth
    const room = auth.value

    const started = newRound(room, this.clock())
    if (!started.ok) return started

    this.note(room, { kind: 'newRoundStarted', roundNumber: room.history.length + 1 })

    this.clearAutoDraw(room.id)
    this.clearBingoTimer(room.id)
    this.broadcast(room)
    log.info('ny runde', { code: room.code, runder: room.history.length })
    return ok(room)
  }

  advancePrize(input: {
    roomId: string
    hostKey: string
    seq: number
  }): Result<Room> {
    const auth = this.requireHost(input)
    if (!auth.ok) return auth
    const room = auth.value

    const advanced = nextStage(room, this.clock())
    if (!advanced.ok) return advanced

    const stage = currentStage(advanced.value)
    if (stage) {
      this.note(room, {
        kind: 'stageAnnounced',
        stageLabel: stage.label,
        stageIndex: advanced.value.currentStageIndex,
        isFinalStage:
          advanced.value.currentStageIndex ===
          room.profile.prizeStages.length - 1,
      })
    }
    touch(room, this.clock())
    this.broadcast(room)
    this.scheduleAutoDraw(room)
    return ok(room)
  }

  private scheduleBingoResolve(room: Room, closesAt: number): void {
    if (this.bingoTimers.has(room.id)) return
    const delay = Math.max(0, closesAt - this.clock())

    const timer = setTimeout(() => {
      this.bingoTimers.delete(room.id)
      const current = this.rooms.get(room.id)
      if (current) this.finishBingo(current)
    }, delay)

    timer.unref?.()
    this.bingoTimers.set(room.id, timer)
  }

  private finishBingo(room: Room): void {
    const prize = resolveBingo(room, this.clock())
    if (prize) {
      log.info('premie avgjort', {
        code: room.code,
        stadium: prize.stageLabel,
        vinnere: prize.winners.length,
        sperreOpphevet: prize.lockoutIgnored,
      })
    }
    this.broadcast(room)
    // Ingen gyldige krav sto igjen: spillet går videre av seg selv.
    if (!prize) this.scheduleAutoDraw(room)
  }

  private clearBingoTimer(roomId: string): void {
    const timer = this.bingoTimers.get(roomId)
    if (timer) {
      clearTimeout(timer)
      this.bingoTimers.delete(roomId)
    }
  }

  // --- Spillerkommandoer ---------------------------------------------------

  lookupRoom(code: string): Result<Room> {
    const room = this.rooms.getByCode(code)
    if (!room || room.status === 'closed') {
      return err('room/notFound', 'Fant ikke noe rom med den koden.')
    }
    if (room.status === 'configuring') {
      return err('room/notOpen', 'Verten holder på å sette opp spillet. Vent litt!')
    }
    return ok(room)
  }

  claim(input: { roomId: string; name: string }): Result<ClaimResult & { room: Room }> {
    const found = this.requireRoom(input.roomId)
    if (!found.ok) return found
    const room = found.value
    const claimed = claimPlayer(room, input.name, this.clock())
    if (!claimed.ok) return claimed
    this.note(room, { kind: 'playerJoined', name: claimed.value.name })
    touch(room, this.clock())
    log.info('spiller ble med', { code: room.code, name: input.name })
    return ok({
      playerId: claimed.value.id,
      recoveryKey: claimed.value.recoveryKey,
      room,
    })
  }

  // --- Overtakelse av en plass (§23) ---------------------------------------

  /**
   * En telefon uten gyldig nøkkel ber om å få plassen sin tilbake. Serveren
   * gjør ingenting av seg selv her — den setter forespørselen på vertens skjerm.
   */
  requestTakeover(
    socketId: string,
    input: { roomId: string; name: string },
  ): Result<null> {
    const found = this.requireRoom(input.roomId)
    if (!found.ok) return found
    const room = found.value

    if (!findPlayerByName(room, input.name)) {
      return err('takeover/free', `${input.name} er ledig — velg navnet rett fra lista.`)
    }

    this.takeovers.set(takeoverKey(room.id, input.name), {
      socketId,
      roomId: room.id,
      name: input.name,
    })
    log.info('ber om å overta plass', { code: room.code, name: input.name })
    this.broadcast(room)
    return ok(null)
  }

  approveTakeover(input: {
    roomId: string
    hostKey: string
    seq: number
    name: string
  }): Result<Room> {
    const auth = this.requireHost(input)
    if (!auth.ok) return auth
    const room = auth.value

    const venter = this.takeovers.get(takeoverKey(room.id, input.name))
    if (!venter) return err('takeover/gone', 'Forespørselen er ikke der lenger.')

    const godkjent = approveTakeover(room, input.name, this.clock())
    if (!godkjent.ok) return godkjent

    this.takeovers.delete(takeoverKey(room.id, input.name))
    // Den gamle telefonens nøkkel gjelder ikke lenger; bindingen ryddes så den
    // ikke står igjen og markerer spilleren som tilkoblet.
    for (const [socketId, binding] of this.bindings) {
      if (binding.playerId === godkjent.value.playerId) this.bindings.delete(socketId)
    }
    this.bind(venter.socketId, {
      roomId: room.id,
      role: 'player',
      playerId: godkjent.value.playerId,
    })

    this.io.to(venter.socketId).emit(E.takeoverApproved, {
      roomId: room.id,
      code: room.code,
      name: input.name,
      ...godkjent.value,
    })

    touch(room, this.clock())
    this.broadcast(room)
    log.info('plass overtatt', { code: room.code, name: input.name })
    return ok(room)
  }

  denyTakeover(input: {
    roomId: string
    hostKey: string
    seq: number
    name: string
  }): Result<Room> {
    const auth = this.requireHost(input)
    if (!auth.ok) return auth
    const room = auth.value

    const venter = this.takeovers.get(takeoverKey(room.id, input.name))
    if (venter) {
      this.takeovers.delete(takeoverKey(room.id, input.name))
      this.io.to(venter.socketId).emit(E.takeoverDenied, { name: input.name })
    }
    this.broadcast(room)
    return ok(room)
  }

  pendingTakeovers(roomId: string): string[] {
    return [...this.takeovers.values()]
      .filter((venter) => venter.roomId === roomId)
      .map((venter) => venter.name)
  }

  setActiveBoard(input: {
    roomId: string
    playerId: string
    recoveryKey: string
    boardId: string
  }): Result<Room> {
    const auth = this.requirePlayer(input)
    if (!auth.ok) return auth
    const { room } = auth.value
    const player = findPlayer(room, input.playerId)
    if (!player?.boards.some((board) => board.id === input.boardId)) {
      return err('board/notYours', 'Det brettet er ikke ditt.')
    }
    player.activeBoardId = input.boardId
    touch(room, this.clock())
    this.broadcast(room)
    return ok(room)
  }

  /**
   * Tar imot selfien. Bildet er allerede beskåret og komprimert på telefonen —
   * serveren kontrollerer bare at det er lite nok og faktisk er et bilde, og
   * legger det i prosessminnet der det dør sammen med rommet (§25).
   */
  uploadSelfie(input: {
    roomId: string
    playerId: string
    recoveryKey: string
    contentType: string
    data: unknown
  }): Result<{ selfieUrl: string }> {
    const auth = this.requirePlayer(input)
    if (!auth.ok) return auth
    const { room } = auth.value

    const bytes = toBuffer(input.data)
    if (!bytes) return err('selfie/invalid', 'Klarte ikke å lese bildet.')

    const problem = validateSelfie(bytes, input.contentType)
    if (problem) return err(problem.code, problem.message)

    const ref = this.selfies.put({
      roomId: room.id,
      contentType: input.contentType,
      bytes,
      now: this.clock(),
    })

    const result = setSelfie(room, input.playerId, ref)
    if (!result.ok) {
      this.selfies.remove(ref)
      return result
    }
    if (result.value.forrige) this.selfies.remove(result.value.forrige)

    touch(room, this.clock())
    this.broadcast(room)
    log.info('selfie lagret', { code: room.code, bytes: bytes.length })
    return ok({ selfieUrl: `/api/selfie/${room.id}/${ref}` })
  }

  chooseAvatar(input: {
    roomId: string
    playerId: string
    recoveryKey: string
  }): Result<Room> {
    const auth = this.requirePlayer(input)
    if (!auth.ok) return auth
    const { room } = auth.value

    const result = selectAvatar(room, input.playerId)
    if (!result.ok) return result
    if (result.value.forrige) this.selfies.remove(result.value.forrige)

    touch(room, this.clock())
    this.broadcast(room)
    return ok(room)
  }

  setReady(input: {
    roomId: string
    playerId: string
    recoveryKey: string
    ready: boolean
  }): Result<Room> {
    const auth = this.requirePlayer(input)
    if (!auth.ok) return auth
    const { room } = auth.value
    const result = setReady(room, input.playerId, input.ready)
    if (!result.ok) return result
    if (input.ready) {
      const klare = room.players.filter((player) => player.ready).length
      this.note(room, {
        kind: 'playerReady',
        name: result.value.name,
        readyCount: klare,
        playerCount: room.players.length,
      })
      // «Alle er klare» sies bare når det faktisk er sant, altså når serveren
      // har regnet ut at runden kan starte — ikke ved å telle selv.
      if (room.status === 'ready') {
        this.note(room, { kind: 'allReady', playerCount: room.players.length })
      }
    }
    touch(room, this.clock())
    this.broadcast(room)
    return ok(room)
  }

  /**
   * Reconnect. Nøkkelen er beviset — en ny telefon kan ikke overta en aktiv
   * spiller uten den (§23). Telefonen får hele tilstanden sin tilbake.
   */
  resumePlayer(input: {
    roomId: string
    playerId: string
    recoveryKey: string
  }): Result<{ room: Room; playerId: string }> {
    const auth = this.requirePlayer(input)
    if (!auth.ok) return auth
    const { room, playerId } = auth.value
    const player = findPlayer(room, playerId)
    // Bare et faktisk gjensyn er verdt å si fra om. En telefon som bytter
    // socket ved reload var aldri borte.
    if (player && !player.connected) {
      this.note(room, { kind: 'playerReconnected', name: player.name })
    }
    setConnected(room, playerId, true, this.clock())
    touch(room, this.clock())
    return ok({ room, playerId })
  }

  handleDisconnect(socketId: string): void {
    const binding = this.unbind(socketId)
    if (!binding) return

    if (binding.role === 'host') {
      const room = this.rooms.get(binding.roomId)
      if (room && !this.hostPresent(room.id)) {
        this.clearAutoDraw(room.id)
        log.info('hovedskjermen forsvant', { code: room.code })
        this.broadcast(room)
      }
      return
    }

    if (!binding.playerId) return
    const room = this.rooms.get(binding.roomId)
    if (!room) return
    // En telefon som bare byttet socket (reload) skal ikke markeres frakoblet.
    if (this.hasOtherSocketFor(binding.playerId, socketId)) return
    const player = setConnected(room, binding.playerId, false, this.clock())
    if (player) {
      this.note(room, { kind: 'playerDisconnected', name: player.name })
      log.info('spiller frakoblet', { code: room.code, name: player.name })
    }
    this.broadcast(room)
  }

  // --- Opprydding ----------------------------------------------------------

  private purge(room: Room): void {
    this.clearAutoDraw(room.id)
    this.clearBingoTimer(room.id)
    for (const [nøkkel, venter] of this.takeovers) {
      if (venter.roomId === room.id) this.takeovers.delete(nøkkel)
    }
    const removed = this.selfies.removeRoom(room.id)
    this.rooms.remove(room.id)
    if (removed > 0) log.debug('selfier slettet', { code: room.code, removed })
  }

  /** Stopper alle timere. Brukes ved nedstenging og mellom tester. */
  dispose(): void {
    for (const timer of this.drawTimers.values()) clearTimeout(timer)
    for (const timer of this.bingoTimers.values()) clearTimeout(timer)
    this.drawTimers.clear()
    this.bingoTimers.clear()
  }

  sweep(): number {
    const now = this.clock()
    const stale = expiredRooms(this.rooms, now)
    for (const room of stale) {
      for (const [socketId, binding] of this.bindings) {
        if (binding.roomId === room.id) {
          this.io.to(socketId).emit(E.roomClosed, { reason: 'expired' })
        }
      }
      this.io.to(hostChannel(room.id)).emit(E.roomClosed, { reason: 'expired' })
      this.purge(room)
      log.info('rom ryddet bort', { code: room.code })
    }
    return stale.length
  }

  /** Kun for tester og for selfie-ruten, som trenger rom-oppslag. */
  get store(): RoomStore {
    return this.rooms
  }

  get selfieStore(): SelfieStore {
    return this.selfies
  }

  profileFor(configInput: ConfigInput) {
    return buildProfile(configInput)
  }
}
