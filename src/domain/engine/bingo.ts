import { computeProgress, type Board, type BoardProgress } from '../board/board'
import type { PrizeStageDef } from '../formats/types'

/**
 * BINGO-validatoren. Den svarer på ett spørsmål: oppfyller noen av disse
 * brettene gjeldende premiekrav, gitt tallene som faktisk er trukket?
 *
 * Den ser aldri på hva spilleren påstår. Markeringer som ikke svarer til et
 * trukket tall er allerede filtrert bort av `computeProgress`, så en klient som
 * lyver om markeringene sine oppnår ingenting (§25).
 */

export interface WinningBoard {
  boardId: string
  completedRows: number[]
  isFull: boolean
}

export function satisfiesStage(progress: BoardProgress, stage: PrizeStageDef): boolean {
  return stage.type === 'fullHouse'
    ? progress.isFull
    : progress.completedRows.length >= stage.requiredRows
}

/**
 * Finner spillerens beste brett for gjeldende stadium. Radene må ligge på det
 * samme brettet — én rad på Brett 1 og én på Brett 2 er ikke to rader (§10).
 */
export function findWinningBoard(
  boards: readonly Board[],
  drawn: ReadonlySet<number>,
  stage: PrizeStageDef,
): WinningBoard | null {
  let best: WinningBoard | null = null

  for (const board of boards) {
    const progress = computeProgress(board, drawn)
    if (!satisfiesStage(progress, stage)) continue

    const candidate: WinningBoard = {
      boardId: board.id,
      completedRows: progress.completedRows,
      isFull: progress.isFull,
    }
    // Ved flere vinnende brett vinner det som har kommet lengst — da stemmer
    // premievisningen med det spilleren selv ser som sitt beste brett.
    if (!best || candidate.completedRows.length > best.completedRows.length) {
      best = candidate
    }
  }

  return best
}

/** Har spilleren bingo akkurat nå? Brukes til hint og til automatisk vinner. */
export function hasBingo(
  boards: readonly Board[],
  drawn: ReadonlySet<number>,
  stage: PrizeStageDef,
): boolean {
  return findWinningBoard(boards, drawn, stage) !== null
}
