import { z } from 'zod'
import { DIFFICULTIES, FORMAT_IDS } from '@/domain/formats/types'
import { MAX_NAME_LENGTH } from '@/domain/players'

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

/**
 * Konvolutten sjekker bare at det er en rimelig streng. Selve navneregelen
 * — tegnsett, tomt navn, doble navn — bor i domenet, som er det eneste stedet
 * som kjenner de andre spillerne i rommet.
 */
export const PlayerNameSchema = z.string().trim().min(1).max(MAX_NAME_LENGTH)

export const ConfigInputSchema = z.object({
  format: z.enum(FORMAT_IDS),
  difficulty: z.enum(DIFFICULTIES),
  // Opptil seks: en hel 90-talls strimmel.
  boardsPerPlayer: z
    .union([1, 2, 3, 4, 5, 6].map((n) => z.literal(n)) as [z.ZodLiteral<1>, z.ZodLiteral<2>, z.ZodLiteral<3>, z.ZodLiteral<4>, z.ZodLiteral<5>, z.ZodLiteral<6>])
    .optional(),
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
  hostGenerateNames: 'host:generateNames',
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
export const HostGenerateNamesSchema = z.object({ ...HostAuth })
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

import type { GameEvent } from '@/domain/audio/events'

export type { GameEvent, GameEventData, Priority } from '@/domain/audio/events'

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
  /**
   * Antall brett på ett ark, for formater som selges slik. Null når hvert
   * brett står for seg. Telefonen tegner arket som én sammenhengende blokk
   * når dette er satt.
   */
  stripSize: number | null
  /** Hvor mange ark hver spiller har. Ett ark dekker hele tallområdet. */
  sheetsPerPlayer: number
}

export interface RoundView {
  status: string
  currentNumber: number | null
  /** «B 12» eller «Nummer 68» — ferdig formulert for opplesning. */
  currentLabel: string | null
  /** Bokstaven alene, eller null i formater uten kolonneoverskrifter. Skjermene
   *  skal aldri måtte plukke den ut av `currentLabel` selv. */
  currentLetter: string | null
  /** Hvilken kolonne tallet hører til. Gir kula fargen sin — B-I-N-G-O i
   *  75-formatet, tierne i 90. */
  currentColumn: number | null
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
  /** 1-basert, på tvers av alle spillerens brett. */
  index: number
  /**
   * Hvilket ark brettet hører til, 1-basert, og plassen på arket.
   * Null i formater der brett ikke selges i ark.
   */
  sheet: number | null
  indexOnSheet: number | null
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
  /** Hjelpesiden for sertifikatet. null når appen kjører uten HTTPS. */
  certHelpUrl: string | null
  status: string
  config: ConfigSummary
  configInput: z.infer<typeof ConfigInputSchema>
  issues: Array<{ code: string; message: string; severity: 'error' | 'warning' }>
  roster: RosterEntry[]
  /** Hvor mange flere som får plass. Lobbyen sier fra når rommet er fullt. */
  freeSlots: number
  canStart: boolean
  hostSeq: number
  round: RoundView | null
  results: ResultsView | null
  /** Telefoner som venter på å få slippe inn på en opptatt plass. */
  takeoverRequests: Array<{ name: string; color: string; avatarId: string }>
  /**
   * Hva som har skjedd siden sist, for lydsystemet. Tilstanden over sier hvordan
   * det står til nå; denne sier hva som skjedde underveis — og det er forskjellen
   * mellom å vise tallet og å lese det opp.
   *
   * Sendes bare til hovedskjermen. Telefonene er stille (§13).
   */
  events: GameEvent[]
  /** Høyeste sekvensnummer rommet har delt ut. */
  eventSeq: number
  /**
   * Kan navnene i lobbyen få egen opplesning? Sant bare når en stemmenøkkel er
   * satt opp på serveren. Uten den formulerer programlederen seg navnefritt,
   * og verten skal ikke tilbys en knapp som ikke gjør noe.
   */
  canGenerateNames: boolean
  /** Navn som mangler lydklipp. Tom liste betyr at alle er klare. */
  namesWithoutVoice: string[]
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
