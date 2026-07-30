import type { Board } from './board/board'
import { generateBoards } from './board/generate'
import { findWinningBoard, hasBingo } from './engine/bingo'
import { applyMark, applyUnmark, autoMark } from './engine/marking'
import { selectWinners } from './engine/prize'
import type { ConfigInput, RuleProfile } from './formats/types'
import { buildProfile, getFormat } from './formats/registry'
import { isPlayable } from './formats/validate'
import { generateId, generateSecret } from './ids'
import { err, ok, type Result } from './result'
import { seededRng } from './rng'
import { rosterSlot, type PlayerName } from './roster'
import {
  abandonBingoWindow,
  addBingoClaim,
  advanceStage,
  bingoWindowClosesAt,
  currentStage,
  drawnSet,
  openBingoWindow,
  settleBingo,
  startRound,
  type PrizeResult,
  type Round,
  type RoundSummary,
} from './round'

export const ROOM_STATUSES = [
  'configuring',
  'lobby',
  'ready',
  'playing',
  'prizePause',
  'finished',
  'closed',
  'expired',
] as const
export type RoomStatus = (typeof ROOM_STATUSES)[number]

/** Hardt tak uansett aktivitet. Et bingorom skal ikke leve over natten. */
export const ROOM_MAX_LIFETIME_MS = 6 * 60 * 60 * 1000
/** Stille rom ryddes bort. Dekker "alle la fra seg telefonen og gikk". */
export const ROOM_IDLE_TIMEOUT_MS = 30 * 60 * 1000

export interface PrizeWin {
  stageId: string
  stageLabel: string
  roundId: string
  boardId: string
}

export interface Player {
  id: string
  name: PlayerName
  color: string
  avatarId: string
  /** Referanse til selfie i SelfieStore. null = bruker avatar. */
  selfieRef: string | null
  /** Har spilleren tatt stilling til bilde? Uten dette ville en reconnect sendt
   *  spilleren tilbake til kameraet midt i spillet. */
  profileReady: boolean
  connected: boolean
  ready: boolean
  /** Hemmelig. Ligger i telefonens localStorage og kreves ved reconnect (§23). */
  recoveryKey: string
  boards: Board[]
  activeBoardId: string | null
  prizes: PrizeWin[]
  lastSeenAt: number
}

export interface Room {
  id: string
  code: string
  hostKey: string
  status: RoomStatus
  configInput: ConfigInput
  profile: RuleProfile
  players: Player[]
  round: Round | null
  history: RoundSummary[]
  /** Monoton sekvens for vertskommandoer. Dreper dobbelttrykk på trekk-knappen
   *  uavhengig av nettverket (ARKITEKTUR.md §6). */
  hostSeq: number
  createdAt: number
  lastActivityAt: number
}

export function createRoom(params: {
  code: string
  configInput: ConfigInput
  now: number
}): Room {
  return {
    id: generateId('room'),
    code: params.code,
    hostKey: generateSecret(),
    status: 'configuring',
    configInput: params.configInput,
    profile: buildProfile(params.configInput),
    players: [],
    round: null,
    history: [],
    hostSeq: 0,
    createdAt: params.now,
    lastActivityAt: params.now,
  }
}

export function touch(room: Room, now: number): void {
  room.lastActivityAt = now
}

export function isExpired(room: Room, now: number): boolean {
  return (
    now - room.createdAt > ROOM_MAX_LIFETIME_MS ||
    now - room.lastActivityAt > ROOM_IDLE_TIMEOUT_MS
  )
}

export function findPlayer(room: Room, playerId: string): Player | undefined {
  return room.players.find((p) => p.id === playerId)
}

export function findPlayerByName(room: Room, name: PlayerName): Player | undefined {
  return room.players.find((p) => p.name === name)
}

// --- Konfigurasjon ---------------------------------------------------------

export function updateConfig(room: Room, configInput: ConfigInput): Result<Room> {
  if (room.status !== 'configuring' && room.status !== 'lobby' && room.status !== 'ready') {
    return err('config/locked', 'Innstillingene kan ikke endres mens spillet pågår.')
  }
  const profile = buildProfile(configInput)
  if (!isPlayable(profile)) {
    return err('config/invalid', 'Denne kombinasjonen av regler kan ikke spilles.')
  }
  room.configInput = configInput
  room.profile = profile
  // Antall brett kan ha endret seg; nye brett deles ut ved rundestart uansett,
  // men klar-status settes tilbake så ingen starter på feil premisser.
  for (const player of room.players) player.ready = false
  refreshLobbyStatus(room)
  return ok(room)
}

export function openLobby(room: Room): Result<Room> {
  if (room.status !== 'configuring') {
    return err('lobby/wrongState', 'Lobbyen er allerede åpen.')
  }
  if (!isPlayable(room.profile)) {
    return err('lobby/invalidConfig', 'Rett opp innstillingene før du åpner lobbyen.')
  }
  room.status = 'lobby'
  return ok(room)
}

// --- Spillere --------------------------------------------------------------

export function claimPlayer(
  room: Room,
  name: PlayerName,
  now: number,
): Result<Player> {
  if (room.status !== 'lobby' && room.status !== 'ready') {
    return err('claim/closed', 'Lobbyen er ikke åpen akkurat nå.')
  }
  const existing = findPlayerByName(room, name)
  if (existing) {
    // Én aktiv telefon per navn (§28). En frakoblet spiller kan komme tilbake
    // med gjenopprettingsnøkkelen sin, ikke ved å ta plassen på nytt.
    return err(
      'claim/taken',
      existing.connected
        ? `${name} spiller allerede fra en annen telefon.`
        : `${name} er allerede med, men er frakoblet. Bruk samme telefon for å komme tilbake.`,
    )
  }
  const slot = rosterSlot(name)
  const player: Player = {
    id: generateId('player'),
    name,
    color: slot.color,
    avatarId: slot.avatarId,
    selfieRef: null,
    profileReady: false,
    connected: true,
    ready: false,
    recoveryKey: generateSecret(),
    boards: [],
    activeBoardId: null,
    prizes: [],
    lastSeenAt: now,
  }
  room.players.push(player)
  refreshLobbyStatus(room)
  return ok(player)
}

/**
 * Knytter et opplastet bilde til spilleren. Returnerer referansen til det gamle
 * bildet, som kalleren må slette — ellers ville et barn som tar selfie fem
 * ganger etterlate fire bilder i minnet til rommet dør.
 */
export function setSelfie(
  room: Room,
  playerId: string,
  selfieRef: string,
): Result<{ player: Player; forrige: string | null }> {
  const player = findPlayer(room, playerId)
  if (!player) return err('player/unknown', 'Fant ikke spilleren i dette rommet.')
  const forrige = player.selfieRef
  player.selfieRef = selfieRef
  player.profileReady = true
  return ok({ player, forrige })
}

/** Spilleren velger dyret sitt i stedet for et bilde. Et fullverdig valg (§14). */
export function selectAvatar(room: Room, playerId: string): Result<{ forrige: string | null }> {
  const player = findPlayer(room, playerId)
  if (!player) return err('player/unknown', 'Fant ikke spilleren i dette rommet.')
  const forrige = player.selfieRef
  player.selfieRef = null
  player.profileReady = true
  return ok({ forrige })
}

/**
 * Verten slipper en ny telefon inn på en plass som allerede er tatt (§23).
 * Gjenopprettingsnøkkelen byttes ut, så den gamle telefonen mister tilgangen —
 * ellers ville to enheter sittet på samme plass.
 *
 * Dette er den andre veien inn: nøkkelen er den vanlige, og denne finnes for
 * telefonen som døde for godt eller ble tømt.
 */
export function approveTakeover(
  room: Room,
  name: PlayerName,
  now: number,
): Result<{ playerId: string; recoveryKey: string }> {
  const player = findPlayerByName(room, name)
  if (!player) {
    return err('takeover/unknown', `${name} er ikke med i dette rommet.`)
  }
  player.recoveryKey = generateSecret()
  player.connected = true
  player.lastSeenAt = now
  refreshLobbyStatus(room)
  return ok({ playerId: player.id, recoveryKey: player.recoveryKey })
}

export function setReady(room: Room, playerId: string, ready: boolean): Result<Player> {
  const player = findPlayer(room, playerId)
  if (!player) return err('player/unknown', 'Fant ikke spilleren i dette rommet.')
  if (room.status !== 'lobby' && room.status !== 'ready') {
    return err('ready/wrongState', 'Du kan bare melde deg klar i lobbyen.')
  }
  player.ready = ready
  refreshLobbyStatus(room)
  return ok(player)
}

export function setConnected(
  room: Room,
  playerId: string,
  connected: boolean,
  now: number,
): Player | undefined {
  const player = findPlayer(room, playerId)
  if (!player) return undefined
  player.connected = connected
  player.lastSeenAt = now
  refreshLobbyStatus(room)
  return player
}

/**
 * `ready` er en avledet tilstand, ikke en kommando. Serveren regner den ut selv
 * slik at vertens startknapp aldri lyver om hvem som faktisk er klare.
 */
export function refreshLobbyStatus(room: Room): void {
  if (room.status !== 'lobby' && room.status !== 'ready') return
  room.status = canStart(room) ? 'ready' : 'lobby'
}

export function canStart(room: Room): boolean {
  const active = room.players.filter((p) => p.connected)
  return active.length > 0 && active.every((p) => p.ready)
}

export function closeRoom(room: Room): void {
  room.status = 'closed'
}

// --- Runden ----------------------------------------------------------------

/**
 * Deler ut brett og starter runden. Brettene trekkes fra en egen strøm enn
 * tallrekkefølgen, slik at ingen kan lure på om det første trukne tallet henger
 * sammen med det første tallet på brettet.
 */
export function startGame(room: Room, seed: number, now: number): Result<Round> {
  if (room.status !== 'ready') {
    return err(
      'start/notReady',
      room.status === 'lobby'
        ? 'Vent til alle spillerne har meldt seg klare.'
        : 'Spillet er allerede i gang.',
    )
  }

  const boardRng = seededRng(seed ^ 0x5bf03635)
  const taken = new Set<string>()
  for (const player of room.players) {
    player.boards = generateBoards(room.profile, player.id, boardRng, taken)
    player.activeBoardId = player.boards[0]?.id ?? null
  }

  const round = startRound({ profile: room.profile, seed, now })
  room.round = round
  room.status = 'playing'
  return ok(round)
}

export function requireActiveRound(room: Room): Result<Round> {
  if (!room.round || room.status !== 'playing') {
    return err('round/none', 'Ingen runde er i gang.')
  }
  return ok(room.round)
}

/** Alle brett i rommet, uansett spiller. Brukt av BINGO-validatoren i fase 4. */
export function allBoards(room: Room): Board[] {
  return room.players.flatMap((player) => player.boards)
}

export function findBoard(room: Room, boardId: string): Board | undefined {
  return allBoards(room).find((board) => board.id === boardId)
}

// --- Markering -------------------------------------------------------------

function playerBoard(
  room: Room,
  playerId: string,
  boardId: string,
): Result<{ player: Player; board: Board }> {
  const player = findPlayer(room, playerId)
  if (!player) return err('player/unknown', 'Fant ikke spilleren i dette rommet.')
  const board = player.boards.find((b) => b.id === boardId)
  if (!board) return err('board/notYours', 'Det brettet er ikke ditt.')
  return ok({ player, board })
}

export function markOnBoard(
  room: Room,
  playerId: string,
  boardId: string,
  value: number,
): Result<number> {
  const round = requireActiveRound(room)
  if (!round.ok) return round
  if (round.value.status !== 'active') {
    return err('mark/notActive', 'Vent litt — spillet står stille akkurat nå.')
  }

  const found = playerBoard(room, playerId, boardId)
  if (!found.ok) return found

  return applyMark(found.value.board, value, drawnSet(round.value), room.profile)
}

export function unmarkOnBoard(
  room: Room,
  playerId: string,
  boardId: string,
  value: number,
): Result<number> {
  const round = requireActiveRound(room)
  if (!round.ok) return round
  if (round.value.status !== 'active') {
    return err('mark/notActive', 'Vent litt — spillet står stille akkurat nå.')
  }

  const found = playerBoard(room, playerId, boardId)
  if (!found.ok) return found

  return applyUnmark(found.value.board, value, room.profile)
}

/** Kalles rett etter hvert trekk når verten har valgt automatisk markering. */
export function autoMarkDrawn(room: Room, value: number): void {
  if (room.profile.markingMode !== 'auto') return
  autoMark(allBoards(room), value)
}

/**
 * Alt som skjer i kjølvannet av et trekk, i den eneste rekkefølgen som er
 * riktig: først markeres tallet, så kontrolleres bingo, og først til slutt kan
 * runden avsluttes fordi kula er tom. Snur man om på de to siste, mister en
 * spiller som fullførte brettet på det aller siste tallet premien sin.
 *
 * Returnerer true når noen vant automatisk og vinduet må avgjøres.
 */
export function afterDraw(room: Room, value: number, now: number): boolean {
  autoMarkDrawn(room, value)
  return collectAutoWinners(room, now)
}

/** Kalles når et trekk ble avvist fordi kula var tom. */
export function closeExhaustedRound(room: Room, now: number): void {
  noteRoundFinished(room, now)
}

// --- Bingo -----------------------------------------------------------------

/** Har spilleren bingo akkurat nå? Grunnlaget for hintet i assistert modus. */
export function playerHasBingo(room: Room, playerId: string): boolean {
  const player = findPlayer(room, playerId)
  const round = room.round
  const stage = round ? currentStage(round) : null
  if (!player || !round || !stage) return false
  return hasBingo(player.boards, drawnSet(round), stage)
}

/**
 * Spilleren trykker BINGO. Første gyldige krav fryser trekkingen og åpner
 * vinduet; de neste rekker å bli med så lenge vinduet står åpent (§9 K5).
 *
 * Et ugyldig krav er ikke en feil. Spillet fortsetter, markeringene beholdes,
 * og spilleren får en vennlig beskjed.
 */
export function claimBingo(
  room: Room,
  playerId: string,
  now: number,
): Result<{ closesAt: number }> {
  const active = requireActiveRound(room)
  if (!active.ok) return active
  const round = active.value

  if (round.status !== 'active' && round.status !== 'validatingBingo') {
    return err('bingo/notActive', 'Spillet står stille akkurat nå.')
  }

  const player = findPlayer(room, playerId)
  if (!player) return err('player/unknown', 'Fant ikke spilleren i dette rommet.')

  const stage = currentStage(round)
  if (!stage) return err('bingo/noStage', 'Det er ingen premie å spille om.')

  const winning = findWinningBoard(player.boards, drawnSet(round), stage)
  if (!winning) {
    return err(
      'bingo/invalid',
      `Ikke helt ennå! Du mangler noe på ${stage.label.toLowerCase()}.`,
    )
  }

  if (round.status === 'active') openBingoWindow(round, now)
  addBingoClaim(round, {
    playerId,
    boardId: winning.boardId,
    completedRows: winning.completedRows,
    atDrawIndex: round.drawnCount,
    claimedAt: now,
  })

  return ok({ closesAt: bingoWindowClosesAt(round) ?? now })
}

/** Automatisk vinner: alle som oppfyller kravet på samme trekk vinner sammen. */
export function collectAutoWinners(room: Room, now: number): boolean {
  const round = room.round
  if (!round || round.status !== 'active') return false
  if (room.profile.winMode !== 'autoWin') return false

  const stage = currentStage(round)
  if (!stage) return false

  const drawn = drawnSet(round)
  const claims = room.players
    .map((player) => ({ player, winning: findWinningBoard(player.boards, drawn, stage) }))
    .filter((entry) => entry.winning !== null)

  if (claims.length === 0) return false

  openBingoWindow(round, now)
  for (const { player, winning } of claims) {
    addBingoClaim(round, {
      playerId: player.id,
      boardId: winning!.boardId,
      completedRows: winning!.completedRows,
      atDrawIndex: round.drawnCount,
      claimedAt: now,
    })
  }
  return true
}

/** Lukker vinduet og kårer vinnerne. */
export function resolveBingo(room: Room, now: number): PrizeResult | null {
  const round = room.round
  if (!round || round.status !== 'validatingBingo' || !round.pending) return null

  if (round.pending.claims.length === 0) {
    abandonBingoWindow(round)
    return null
  }

  const alleredeVunnet = new Set(
    Object.values(round.stageWinners).flatMap((winners) =>
      winners.map((winner) => winner.playerId),
    ),
  )
  const selection = selectWinners(round.pending.claims, room.profile, (playerId) =>
    alleredeVunnet.has(playerId),
  )

  const stage = currentStage(round)
  const result = settleBingo(round, selection, now)
  if (!result || !stage) return result

  for (const winner of result.winners) {
    findPlayer(room, winner.playerId)?.prizes.push({
      stageId: stage.id,
      stageLabel: stage.label,
      roundId: round.id,
      boardId: winner.boardId,
    })
  }

  noteRoundFinished(room, now)
  return result
}

/**
 * Runden kan ta slutt på to måter: siste premie er vunnet, eller kula er tom.
 * Begge veiene ender her, slik at rommet og runden aldri kan være uenige om at
 * det er over.
 */
export function noteRoundFinished(room: Room, now: number): void {
  const round = room.round
  if (!round || round.status !== 'finished') return
  if (room.status === 'finished') return

  room.status = 'finished'
  room.history.push({
    roundId: round.id,
    formatName: getFormat(room.profile.format).name,
    stageWinners: round.stageWinners,
    endedAt: now,
  })
}

/**
 * Ny runde med de samme spillerne (§28). Brett og markeringer nullstilles, men
 * spillerne beholder plassen, bildet og premiene sine — tellingen fortsetter
 * gjennom hele kvelden, ikke bare én runde.
 */
export function newRound(room: Room, now: number): Result<Room> {
  if (room.status !== 'finished') {
    return err('newRound/notFinished', 'Runden er ikke ferdig ennå.')
  }

  for (const player of room.players) {
    player.boards = []
    player.activeBoardId = null
    player.ready = false
  }
  room.round = null
  room.status = 'lobby'
  touch(room, now)
  refreshLobbyStatus(room)
  return ok(room)
}

/** Premier per spiller gjennom hele rommets levetid. */
export function standings(room: Room): Array<{ player: Player; prizes: number }> {
  return room.players
    .map((player) => ({ player, prizes: player.prizes.length }))
    .sort((a, b) => b.prizes - a.prizes)
}

export function nextStage(room: Room, now: number): Result<Round> {
  const round = room.round
  if (!round) return err('round/none', 'Ingen runde er i gang.')
  const advanced = advanceStage(round, now)
  if (advanced.ok && round.status === 'finished') room.status = 'finished'
  return advanced
}
