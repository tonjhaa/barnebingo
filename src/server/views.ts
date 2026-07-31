import { computeProgress, validMarks, type Board } from '@/domain/board/board'
import { announce, columnIndexFor, columnLabelFor } from '@/domain/engine/draw'
import { getFormat } from '@/domain/formats/registry'
import { DIFFICULTY_PRESETS } from '@/domain/formats/presets'
import { validateProfile } from '@/domain/formats/validate'
import type { RuleProfile } from '@/domain/formats/types'
import { canStart, playerHasBingo, standings, type Player, type Room } from '@/domain/room'
import { MAX_PLAYERS } from '@/domain/players'
import { currentStage, drawnNumbers, drawnSet, type Round } from '@/domain/round'
import type {
  BoardView,
  ConfigSummary,
  HostView,
  PlayerProgress,
  PlayerView,
  PrizeResultView,
  ResultPlayerView,
  ResultsView,
  RosterEntry,
  RoundView,
} from '@/shared/protocol'

const MARKING_LABELS = {
  manual: 'Du markerer selv',
  auto: 'Appen markerer automatisk',
  assisted: 'Du markerer selv, med hint',
} as const

const WIN_LABELS = {
  manual: 'Du trykker BINGO selv',
  assisted: 'BINGO-knappen lyser når du har bingo',
  autoWin: 'Appen roper bingo for deg',
} as const

/** Hvor mange tidligere tall hovedskjermen viser bakover. */
const HISTORY_LENGTH = 12

export function buildConfigSummary(profile: RuleProfile): ConfigSummary {
  const drawLabel =
    profile.drawMode === 'manual'
      ? 'Verten trekker'
      : profile.drawMode === 'autoConfirm'
        ? `Automatisk hvert ${Math.round(profile.drawIntervalMs / 1000).toString()}. sekund, med bekreftelse`
        : `Nytt tall hvert ${Math.round(profile.drawIntervalMs / 1000).toString()}. sekund`

  return {
    formatName: getFormat(profile.format).name,
    difficultyLabel: DIFFICULTY_PRESETS[profile.difficulty].label,
    boardsPerPlayer: profile.boardsPerPlayer,
    markingLabel: MARKING_LABELS[profile.markingMode],
    winLabel: WIN_LABELS[profile.winMode],
    drawLabel,
    markingMode: profile.markingMode,
    winMode: profile.winMode,
    stageLabels: profile.prizeStages.map((stage) => stage.label),
    speech: profile.speech,
    columnLabels: [...profile.layout.columnLabels],
    stripSize: getFormat(profile.format).stripSize ?? null,
  }
}

function selfieUrl(room: Room, player: Player): string | null {
  return player.selfieRef ? `/api/selfie/${room.id}/${player.selfieRef}` : null
}

function buildBoardView(board: Board, index: number, drawn: ReadonlySet<number>): BoardView {
  const progress = computeProgress(board, drawn)
  const marked = validMarks(board, drawn)

  return {
    id: board.id,
    index: index + 1,
    cells: board.cells.map((row) =>
      row.map((cell) => ({
        value: cell.value,
        isFree: cell.isFree,
        marked: cell.isFree || (cell.value !== null && marked.has(cell.value)),
      })),
    ),
    completedRows: progress.completedRows,
    markedCount: progress.markedCount,
    numberCount: progress.numberCount,
    isFull: progress.isFull,
  }
}

function buildProgress(player: Player, drawn: ReadonlySet<number>): PlayerProgress | null {
  if (player.boards.length === 0) return null
  const perBoard = player.boards.map((board) => computeProgress(board, drawn))
  return {
    boards: player.boards.length,
    // Rader teller per brett, aldri på tvers (§10) — derfor det beste brettet,
    // ikke summen.
    bestCompletedRows: Math.max(...perBoard.map((p) => p.completedRows.length)),
    markedCount: Math.max(...perBoard.map((p) => p.markedCount)),
    prizes: player.prizes.length,
  }
}

function buildPrizeView(room: Room, round: Round): PrizeResultView | null {
  const prize = round.lastPrize
  if (!prize) return null

  const neste = round.profile.prizeStages[round.currentStageIndex + 1] ?? null

  return {
    stageLabel: prize.stageLabel,
    winners: prize.winners.flatMap((winner) => {
      const player = room.players.find((p) => p.id === winner.playerId)
      if (!player) return []
      return [
        {
          playerId: player.id,
          name: player.name,
          color: player.color,
          avatarId: player.avatarId,
          selfieUrl: selfieUrl(room, player),
          boardIndex: player.boards.findIndex((b) => b.id === winner.boardId) + 1,
          completedRows: winner.completedRows,
        },
      ]
    }),
    alsoHadBingo: prize.alsoHadBingo.flatMap((playerId) => {
      const player = room.players.find((p) => p.id === playerId)
      return player ? [player.name] : []
    }),
    lockoutIgnored: prize.lockoutIgnored,
    isFinalStage: prize.isFinalStage,
    nextStageLabel: prize.isFinalStage ? null : (neste?.label ?? null),
  }
}

function resultPlayer(room: Room, player: Player): ResultPlayerView {
  return {
    name: player.name,
    color: player.color,
    avatarId: player.avatarId,
    selfieUrl: selfieUrl(room, player),
    prizes: player.prizes.length,
  }
}

/**
 * Sluttbildet. Bygges fra runden som nettopp ble ferdig, ikke fra historikken —
 * runden henger igjen på rommet til neste starter, og har alt vi trenger.
 */
function buildResults(room: Room): ResultsView | null {
  if (room.status !== 'finished' || !room.round) return null
  const round = room.round

  return {
    formatName: getFormat(room.profile.format).name,
    stages: round.profile.prizeStages.flatMap((stage) => {
      const vinnere = round.stageWinners[stage.id] ?? []
      if (vinnere.length === 0) return []
      return [
        {
          stageLabel: stage.label,
          winners: vinnere.flatMap((winner) => {
            const player = room.players.find((p) => p.id === winner.playerId)
            return player ? [resultPlayer(room, player)] : []
          }),
        },
      ]
    }),
    standings: standings(room).map(({ player }) => resultPlayer(room, player)),
    roundsPlayed: room.history.length,
  }
}

function buildRoundView(
  room: Room,
  round: Round,
  options: { showNumbers: boolean; showHistory: boolean; hostAway: boolean },
): RoundView {
  const stage = currentStage(round)
  const history = drawnNumbers(round).slice(0, -1).reverse().slice(0, HISTORY_LENGTH)

  return {
    status: round.status,
    currentNumber: options.showNumbers ? round.currentNumber : null,
    currentLabel:
      options.showNumbers && round.currentNumber !== null
        ? announce(round.profile, round.currentNumber)
        : null,
    currentLetter:
      options.showNumbers && round.currentNumber !== null
        ? columnLabelFor(round.profile, round.currentNumber) || null
        : null,
    currentColumn:
      options.showNumbers && round.currentNumber !== null
        ? columnIndexFor(round.profile, round.currentNumber)
        : null,
    previousNumbers: options.showHistory ? history : [],
    drawnCount: round.drawnCount,
    totalNumbers: round.drawOrder.length,
    stageLabel: stage?.label ?? null,
    stageIndex: round.currentStageIndex,
    stageCount: round.profile.prizeStages.length,
    drawMode: round.profile.drawMode,
    drawIntervalMs: round.profile.drawIntervalMs,
    lastDrawAt: round.lastDrawAt,
    // Premien vises til alle, uansett hjelpemidler — det er kveldens høydepunkt.
    prize: buildPrizeView(room, round),
    hostAway: options.hostAway,
  }
}

/**
 * Bare spillerne som faktisk har blitt med. Rommet har ingen liste over navn
 * på forhånd, så det finnes ingen tomme plasser å vise — lobbyen sier i stedet
 * hvor mange flere det er plass til.
 */
export function buildRoster(room: Room): RosterEntry[] {
  const drawn = room.round ? drawnSet(room.round) : new Set<number>()

  return room.players.map((player) => ({
    name: player.name,
    color: player.color,
    avatarId: player.avatarId,
    connected: player.connected,
    ready: player.ready,
    hasSelfie: Boolean(player.selfieRef),
    selfieUrl: selfieUrl(room, player),
    progress: buildProgress(player, drawn),
  }))
}

export function buildHostView(
  room: Room,
  baseUrl: string,
  takeoverRequests: string[] = [],
  certHelpUrl: string | null = null,
  /** Hvem som kan leses opp ved navn. Se `Navnelyd`. */
  navnelyd: { kanGenerere: boolean; utenKlipp: (navn: string[]) => string[] } = {
    kanGenerere: false,
    utenKlipp: (navn) => navn,
  },
): HostView {
  // Hovedskjermen ser åpenbart seg selv.
  return {
    roomId: room.id,
    code: room.code,
    joinUrl: `${baseUrl}/bli-med/${room.code}`,
    certHelpUrl,
    status: room.status,
    config: buildConfigSummary(room.profile),
    configInput: room.configInput,
    issues: validateProfile(room.profile),
    roster: buildRoster(room),
    freeSlots: Math.max(0, MAX_PLAYERS - room.players.length),
    canStart: canStart(room),
    hostSeq: room.hostSeq,
    // Hovedskjermen er trekkeren og ser alltid alt.
    round: room.round
      ? buildRoundView(room, room.round, {
          showNumbers: true,
          showHistory: true,
          hostAway: false,
        })
      : null,
    results: buildResults(room),
    events: room.events.events,
    eventSeq: room.events.seq,
    canGenerateNames: navnelyd.kanGenerere,
    namesWithoutVoice: navnelyd.utenKlipp(room.players.map((player) => player.name)),
    takeoverRequests: takeoverRequests.flatMap((name) => {
      const player = room.players.find((p) => p.name === name)
      return player
        ? [{ name: player.name, color: player.color, avatarId: player.avatarId }]
        : []
    }),
  }
}

export function buildPlayerView(
  room: Room,
  playerId: string | null,
  hostAway = false,
): PlayerView {
  const player = playerId ? room.players.find((p) => p.id === playerId) : undefined
  const drawn = room.round ? drawnSet(room.round) : new Set<number>()

  // Hjelpemidlene filtreres på serveren, ikke i grensesnittet. Slår verten av
  // «vis tallet på telefonen», er tallet ikke sendt — ikke bare skjult.
  const round = room.round
    ? buildRoundView(room, room.round, {
        showNumbers: room.profile.showCurrentNumberOnPhone,
        showHistory: room.profile.showDrawHistoryOnPhone,
        hostAway,
      })
    : null

  return {
    roomId: room.id,
    code: room.code,
    status: room.status,
    config: buildConfigSummary(room.profile),
    roster: buildRoster(room),
    me: player
      ? {
          playerId: player.id,
          name: player.name,
          color: player.color,
          avatarId: player.avatarId,
          ready: player.ready,
          hasSelfie: Boolean(player.selfieRef),
          selfieUrl: selfieUrl(room, player),
          profileReady: player.profileReady,
        }
      : null,
    round,
    boards: player
      ? player.boards.map((board, index) => buildBoardView(board, index, drawn))
      : [],
    activeBoardId: player?.activeBoardId ?? null,
    results: buildResults(room),
    // Hintet finnes bare i assistert modus. I manuell modus sendes det ikke,
    // så en nysgjerrig klient kan ikke lese seg til svaret heller.
    bingoHint:
      room.profile.winMode === 'assisted' && player
        ? playerHasBingo(room, player.id)
        : false,
  }
}
