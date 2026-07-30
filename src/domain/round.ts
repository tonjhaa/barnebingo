import { createDrawOrder } from './engine/draw'
import type { BingoClaim, WinnerSelection } from './engine/prize'
import type { PrizeStageDef, RuleProfile } from './formats/types'
import { generateId } from './ids'
import { err, ok, type Result } from './result'
import { seededRng } from './rng'

/**
 * Rundens tilstander. Trekkmotoren og BINGO-validatoren er de eneste som
 * flytter mellom dem, og alle overganger går gjennom funksjonene her — aldri
 * ved å sette `status` direkte.
 */
export const ROUND_STATUSES = [
  'active',
  'paused',
  'validatingBingo',
  'showingPrize',
  'finished',
] as const
export type RoundStatus = (typeof ROUND_STATUSES)[number]

export interface StageWinner {
  playerId: string
  boardId: string
  completedRows: number[]
  atDrawIndex: number
}

/** Åpent bingo-vindu: alle som rekker å rope innenfor det er med (§9 K5). */
export interface PendingBingo {
  openedAt: number
  atDrawIndex: number
  claims: BingoClaim[]
}

export interface PrizeResult {
  stageId: string
  stageLabel: string
  winners: StageWinner[]
  /** Spillere som også hadde gyldig bingo, men ikke fikk premien. */
  alsoHadBingo: string[]
  lockoutIgnored: boolean
  isFinalStage: boolean
}

export interface Round {
  id: string
  profile: RuleProfile
  status: RoundStatus
  /** Hele trekkrekkefølgen bestemmes ved start, av en seedet RNG. Det gjør
   *  runden reproduserbar i test og fjerner enhver mulighet for duplikater. */
  drawOrder: number[]
  drawnCount: number
  currentNumber: number | null
  currentStageIndex: number
  /** stadie-id → vinnere */
  stageWinners: Record<string, StageWinner[]>
  pending: PendingBingo | null
  /** Det siste avgjorte premiestadiet, vist mens spillet står stille. */
  lastPrize: PrizeResult | null
  seed: number
  startedAt: number
  /** Når det siste tallet ble trukket. Lar hovedskjermen telle ned til det
   *  neste uten en egen tikkemelding fra serveren. */
  lastDrawAt: number | null
  endedAt: number | null
}

export interface RoundSummary {
  roundId: string
  formatName: string
  stageWinners: Record<string, StageWinner[]>
  endedAt: number
}

export function startRound(params: {
  profile: RuleProfile
  seed: number
  now: number
}): Round {
  return {
    id: generateId('round'),
    profile: params.profile,
    status: 'active',
    drawOrder: createDrawOrder(params.profile, seededRng(params.seed)),
    drawnCount: 0,
    currentNumber: null,
    currentStageIndex: 0,
    stageWinners: {},
    pending: null,
    lastPrize: null,
    seed: params.seed,
    startedAt: params.now,
    lastDrawAt: null,
    endedAt: null,
  }
}

export function drawnNumbers(round: Round): number[] {
  return round.drawOrder.slice(0, round.drawnCount)
}

export function drawnSet(round: Round): Set<number> {
  return new Set(drawnNumbers(round))
}

export function currentStage(round: Round): PrizeStageDef | null {
  return round.profile.prizeStages[round.currentStageIndex] ?? null
}

export function remainingDraws(round: Round): number {
  return round.drawOrder.length - round.drawnCount
}

/**
 * Trekker neste tall. Avviser i alle andre tilstander enn `active` — særlig
 * mens en bingo kontrolleres, der et nytt tall ville endret svaret midt i
 * kontrollen (ARKITEKTUR.md §9 K10).
 */
export function drawNext(round: Round, now: number): Result<number> {
  if (round.status !== 'active') {
    return err('draw/notActive', beskrivTilstand(round.status))
  }
  if (remainingDraws(round) === 0) {
    finishRound(round, now)
    return err('draw/exhausted', 'Alle tallene er trukket.')
  }

  const value = round.drawOrder[round.drawnCount]
  round.drawnCount += 1
  round.currentNumber = value
  round.lastDrawAt = now

  // Runden avsluttes bevisst ikke her, selv om det var siste tall. Det tallet
  // kan være akkurat det som fullfører noens brett, og da må markering og
  // BINGO-kontroll få skje først. `afterDraw` i room.ts rydder opp etterpå.
  return ok(value)
}

export function pauseRound(round: Round): Result<Round> {
  if (round.status !== 'active') {
    return err('pause/notActive', 'Spillet er ikke i gang akkurat nå.')
  }
  round.status = 'paused'
  return ok(round)
}

export function resumeRound(round: Round): Result<Round> {
  if (round.status !== 'paused') {
    return err('resume/notPaused', 'Spillet er ikke på pause.')
  }
  round.status = 'active'
  return ok(round)
}

export function finishRound(round: Round, now: number): void {
  round.status = 'finished'
  round.endedAt = now
  round.pending = null
}

// --- Bingo og premier ------------------------------------------------------

/**
 * Åpner bingo-vinduet. Trekkingen fryses med én gang, slik at alle som roper
 * innenfor vinduet nødvendigvis gjør det på det samme trukne tallet.
 */
export function openBingoWindow(round: Round, now: number): void {
  round.status = 'validatingBingo'
  round.pending = { openedAt: now, atDrawIndex: round.drawnCount, claims: [] }
}

/** Én claim per spiller. Å trykke to ganger gir ikke to premier. */
export function addBingoClaim(round: Round, claim: BingoClaim): void {
  if (!round.pending) return
  if (round.pending.claims.some((existing) => existing.playerId === claim.playerId)) return
  round.pending.claims.push(claim)
}

export function bingoWindowClosesAt(round: Round): number | null {
  return round.pending
    ? round.pending.openedAt + round.profile.bingoWindowMs
    : null
}

/** Skriver vinnerne inn i runden og setter spillet i premievisning. */
export function settleBingo(
  round: Round,
  selection: WinnerSelection,
  now: number,
): PrizeResult | null {
  const stage = currentStage(round)
  if (!stage || !round.pending) return null

  const winners: StageWinner[] = selection.winners.map((claim) => ({
    playerId: claim.playerId,
    boardId: claim.boardId,
    completedRows: claim.completedRows,
    atDrawIndex: claim.atDrawIndex,
  }))

  round.stageWinners[stage.id] = [...(round.stageWinners[stage.id] ?? []), ...winners]
  round.pending = null
  round.status = 'showingPrize'

  const result: PrizeResult = {
    stageId: stage.id,
    stageLabel: stage.label,
    winners,
    alsoHadBingo: selection.alsoHadBingo.map((claim) => claim.playerId),
    lockoutIgnored: selection.lockoutIgnored,
    isFinalStage: round.currentStageIndex >= round.profile.prizeStages.length - 1,
  }
  round.lastPrize = result

  if (result.isFinalStage) finishRound(round, now)
  return result
}

/** Ingen gyldige krav igjen — slipp spillet løs uten å ha kåret noen. */
export function abandonBingoWindow(round: Round): void {
  if (round.status !== 'validatingBingo') return
  round.pending = null
  round.status = 'active'
}

/**
 * Går videre til neste premiestadium. Markeringene beholdes — spillet fortsetter
 * på de samme brettene, bare med et høyere krav (§9).
 */
export function advanceStage(round: Round, now: number): Result<Round> {
  if (round.status !== 'showingPrize') {
    return err('prize/notShowing', 'Ingen premie å gå videre fra.')
  }
  if (round.currentStageIndex >= round.profile.prizeStages.length - 1) {
    finishRound(round, now)
    return ok(round)
  }
  round.currentStageIndex += 1
  round.lastPrize = null
  round.status = 'active'
  return ok(round)
}

function beskrivTilstand(status: RoundStatus): string {
  switch (status) {
    case 'paused':
      return 'Spillet står på pause.'
    case 'validatingBingo':
      return 'Vi kontrollerer en bingo først.'
    case 'showingPrize':
      return 'Vi feirer en vinner først.'
    case 'finished':
      return 'Runden er ferdig.'
    default:
      return 'Kan ikke trekke akkurat nå.'
  }
}
