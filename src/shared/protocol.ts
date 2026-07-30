import { z } from 'zod'
import { DIFFICULTIES, FORMAT_IDS } from '@/domain/formats/types'
import { ROSTER_NAMES } from '@/domain/roster'

/**
 * Én sannhet for alt som går over ledningen. Skjemaene brukes til runtime-
 * validering på serveren og til typer på klienten, slik at de to aldri kan
 * gli fra hverandre.
 */

// --- Byggeklosser -----------------------------------------------------------

export const RoomCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-HJ-NP-Z2-9]{4}$/, 'Romkoden er fire tegn.')

export const PlayerNameSchema = z.enum(ROSTER_NAMES)

export const ConfigInputSchema = z.object({
  format: z.enum(FORMAT_IDS),
  difficulty: z.enum(DIFFICULTIES),
  boardsPerPlayer: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  freeCenter: z.boolean().optional(),
  enabledStageIds: z.array(z.string().max(32)).max(8).optional(),
  markingMode: z.enum(['manual', 'auto', 'assisted']).optional(),
  winMode: z.enum(['manual', 'assisted', 'autoWin']).optional(),
  drawMode: z.enum(['manual', 'auto', 'autoConfirm']).optional(),
  drawIntervalMs: z.number().int().min(1000).max(60000).optional(),
  bingoWindowMs: z.number().int().min(0).max(10000).optional(),
  allowRepeatWinners: z.boolean().optional(),
  allowMultipleWinnersPerStage: z.boolean().optional(),
  speech: z.boolean().optional(),
  showCurrentNumberOnPhone: z.boolean().optional(),
  showDrawHistoryOnPhone: z.boolean().optional(),
})

const SecretSchema = z.string().min(16).max(128)
const IdSchema = z.string().min(4).max(80)

/** Alle vertskommandoer bærer nøkkel og sekvensnummer. */
const HostAuth = {
  roomId: IdSchema,
  hostKey: SecretSchema,
  seq: z.number().int().nonnegative(),
}

/** Alle spillerkommandoer bærer spiller-id og gjenopprettingsnøkkel. */
const PlayerAuth = {
  roomId: IdSchema,
  playerId: IdSchema,
  recoveryKey: SecretSchema,
}

// --- Vertskommandoer --------------------------------------------------------

export const C = {
  hostCreateRoom: 'host:createRoom',
  hostUpdateConfig: 'host:updateConfig',
  hostOpenLobby: 'host:openLobby',
  hostResume: 'host:resume',
  hostCloseRoom: 'host:closeRoom',
  hostStartGame: 'host:startGame',
  hostDrawNext: 'host:drawNext',
  hostPause: 'host:pause',
  hostResumeGame: 'host:resumeGame',
  hostAdvancePrize: 'host:advancePrize',
  hostNewRound: 'host:newRound',
  hostApproveTakeover: 'host:approveTakeover',
  hostDenyTakeover: 'host:denyTakeover',
  playerLookupRoom: 'player:lookupRoom',
  playerClaim: 'player:claim',
  playerSetReady: 'player:setReady',
  playerResume: 'player:resume',
  playerSetActiveBoard: 'player:setActiveBoard',
  playerMark: 'player:mark',
  playerUnmark: 'player:unmark',
  playerClaimBingo: 'player:claimBingo',
  playerUploadSelfie: 'player:uploadSelfie',
  playerUseAvatar: 'player:useAvatar',
  playerRequestTakeover: 'player:requestTakeover',
} as const

export const HostCreateRoomSchema = z.object({
  config: ConfigInputSchema.optional(),
})

export const HostUpdateConfigSchema = z.object({
  ...HostAuth,
  config: ConfigInputSchema,
})

export const HostOpenLobbySchema = z.object({ ...HostAuth })
export const HostCloseRoomSchema = z.object({ ...HostAuth })
export const HostResumeSchema = z.object({ roomId: IdSchema, hostKey: SecretSchema })
export const HostStartGameSchema = z.object({ ...HostAuth })
export const HostDrawNextSchema = z.object({ ...HostAuth })
export const HostPauseSchema = z.object({ ...HostAuth })
export const HostResumeGameSchema = z.object({ ...HostAuth })
export const HostAdvancePrizeSchema = z.object({ ...HostAuth })
export const HostNewRoundSchema = z.object({ ...HostAuth })
export const HostTakeoverSchema = z.object({ ...HostAuth, name: PlayerNameSchema })

// --- Spillerkommandoer ------------------------------------------------------

export const PlayerLookupRoomSchema = z.object({ code: RoomCodeSchema })

export const PlayerClaimSchema = z.object({
  roomId: IdSchema,
  name: PlayerNameSchema,
})

export const PlayerSetReadySchema = z.object({
  ...PlayerAuth,
  ready: z.boolean(),
})

export const PlayerResumeSchema = z.object({ ...PlayerAuth })

export const PlayerSetActiveBoardSchema = z.object({
  ...PlayerAuth,
  boardId: IdSchema,
})

export const PlayerMarkSchema = z.object({
  ...PlayerAuth,
  boardId: IdSchema,
  value: z.number().int().min(1).max(999),
})

export const PlayerClaimBingoSchema = z.object({ ...PlayerAuth })

/**
 * Selve bildebytene sendes som binærdata av Socket.IO. Zod sjekker konvolutten;
 * innholdet kontrolleres av `validateSelfie`, som ser på filsignaturen framfor
 * å tro på det klienten kaller den.
 */
export const PlayerUploadSelfieSchema = z.object({
  ...PlayerAuth,
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  data: z.unknown(),
})

export const PlayerUseAvatarSchema = z.object({ ...PlayerAuth })

/** Ber verten om å slippe en ny telefon inn på en plass som er tatt (§23). */
export const PlayerRequestTakeoverSchema = z.object({
  roomId: IdSchema,
  name: PlayerNameSchema,
})

// --- Serverhendelser --------------------------------------------------------

export const E = {
  hostState: 'state:host',
  playerState: 'state:player',
  roomClosed: 'room:closed',
  takeoverApproved: 'takeover:approved',
  takeoverDenied: 'takeover:denied',
} as const

// --- Visninger --------------------------------------------------------------
// Serveren sender ferdig filtrerte øyeblikksbilder. Med maks fem klienter er
// et fullt snapshot per endring billigere enn en hel klasse desync-feil, og
// en spiller kan strukturelt ikke få se andres brett.

export interface ConfigSummary {
  formatName: string
  difficultyLabel: string
  boardsPerPlayer: number
  markingLabel: string
  winLabel: string
  drawLabel: string
  /** Rå verdier, for skjermer som må oppføre seg ulikt — ikke bare skrive ulikt. */
  markingMode: string
  winMode: string
  stageLabels: string[]
  speech: boolean
  /** B I N G O, eller tom liste for formater uten overskrifter. */
  columnLabels: string[]
}

export interface RoundView {
  status: string
  currentNumber: number | null
  /** «B 12» eller «Nummer 68» — ferdig formulert for opplesning. */
  currentLabel: string | null
  /** Bokstaven alene, eller null i formater uten kolonneoverskrifter. Skjermene
   *  skal aldri måtte plukke den ut av `currentLabel` selv. */
  currentLetter: string | null
  previousNumbers: number[]
  drawnCount: number
  totalNumbers: number
  stageLabel: string | null
  stageIndex: number
  stageCount: number
  drawMode: string
  drawIntervalMs: number
  /** Lar hovedskjermen telle ned til neste tall uten en egen tikk fra serveren. */
  lastDrawAt: number | null
  /** Satt mens spillet står i premievisning. */
  prize: PrizeResultView | null
  /** Ingen sitter ved hovedskjermen. Automatisk trekking står stille til den
   *  kommer tilbake, og telefonene sier fra om hvorfor det er stille. */
  hostAway: boolean
}

export interface BoardCellView {
  value: number | null
  isFree: boolean
  marked: boolean
}

export interface BoardView {
  id: string
  /** 1-basert, slik fanene heter: Brett 1, Brett 2, Brett 3. */
  index: number
  cells: BoardCellView[][]
  completedRows: number[]
  markedCount: number
  numberCount: number
  isFull: boolean
}

/** Hvor langt en spiller er kommet, vist på hovedskjermen under spill. */
export interface PlayerProgress {
  boards: number
  bestCompletedRows: number
  markedCount: number
  /** Antall premier spilleren har vunnet i denne runden. */
  prizes: number
}

export interface PrizeWinnerView {
  playerId: string
  name: string
  color: string
  avatarId: string
  selfieUrl: string | null
  /** 1-basert brettnummer, slik spilleren selv ser fanene. */
  boardIndex: number
  completedRows: number[]
}

export interface ResultPlayerView {
  name: string
  color: string
  avatarId: string
  selfieUrl: string | null
  /** Premier gjennom hele kvelden, ikke bare denne runden. */
  prizes: number
}

/** Sluttbildet: hvem vant hva, og hvor mange premier hver har totalt (§15). */
export interface ResultsView {
  formatName: string
  stages: Array<{ stageLabel: string; winners: ResultPlayerView[] }>
  standings: ResultPlayerView[]
  roundsPlayed: number
}

export interface PrizeResultView {
  stageLabel: string
  winners: PrizeWinnerView[]
  /** Navnene på dem som også hadde bingo, men ikke fikk premien. */
  alsoHadBingo: string[]
  /** Sperren mot gjentatte vinnere måtte oppheves for at noen kunne vinne. */
  lockoutIgnored: boolean
  isFinalStage: boolean
  nextStageLabel: string | null
}

export interface RosterEntry {
  name: string
  color: string
  avatarId: string
  claimed: boolean
  connected: boolean
  ready: boolean
  hasSelfie: boolean
  selfieUrl: string | null
  progress: PlayerProgress | null
}

export interface HostView {
  roomId: string
  code: string
  joinUrl: string
  status: string
  config: ConfigSummary
  configInput: z.infer<typeof ConfigInputSchema>
  issues: Array<{ code: string; message: string; severity: 'error' | 'warning' }>
  roster: RosterEntry[]
  canStart: boolean
  hostSeq: number
  round: RoundView | null
  results: ResultsView | null
  /** Telefoner som venter på å få slippe inn på en opptatt plass. */
  takeoverRequests: Array<{ name: string; color: string; avatarId: string }>
}

export interface PlayerView {
  roomId: string
  code: string
  status: string
  config: ConfigSummary
  roster: RosterEntry[]
  me: {
    playerId: string
    name: string
    color: string
    avatarId: string
    ready: boolean
    hasSelfie: boolean
    selfieUrl: string | null
    profileReady: boolean
  } | null
  round: RoundView | null
  /** Kun spillerens egne brett. En annen spillers brett finnes strukturelt
   *  ikke i denne meldingen — det er ikke skjult, det er ikke sendt. */
  boards: BoardView[]
  activeBoardId: string | null
  results: ResultsView | null
  /** Sant når spilleren faktisk har bingo. Sendes kun i assistert vinnermodus —
   *  i manuell modus skal telefonen ikke vite det spilleren skal oppdage selv. */
  bingoHint: boolean
}

// --- Svarkonvolutt ----------------------------------------------------------

export type Ack<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string }

export interface CreateRoomResult {
  roomId: string
  code: string
  hostKey: string
}

export interface LookupRoomResult {
  roomId: string
  code: string
  status: string
  roster: RosterEntry[]
  config: ConfigSummary
}

export interface ClaimResult {
  playerId: string
  recoveryKey: string
}
