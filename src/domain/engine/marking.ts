import { boardHasNumber, type Board } from '../board/board'
import type { RuleProfile } from '../formats/types'
import { err, ok, type Result } from '../result'

/**
 * Markeringsmotoren. Alle markeringer går gjennom serveren, som kontrollerer at
 * tallet faktisk er trukket før trykket godtas. For barn er dette valgt slik at
 * feil tall ikke *kan* markeres (ARKITEKTUR.md §9 Å3) — telefonen gir en liten
 * risting, ingen feilmelding, ingen straff.
 */

export function applyMark(
  board: Board,
  value: number,
  drawn: ReadonlySet<number>,
  profile: RuleProfile,
): Result<number> {
  if (!boardHasNumber(board, value)) {
    return err('mark/notOnBoard', 'Det tallet står ikke på brettet ditt.')
  }
  if (!profile.allowInvalidMarks && !drawn.has(value)) {
    return err('mark/notDrawn', 'Det tallet er ikke trukket ennå.')
  }
  board.marks.add(value)
  return ok(value)
}

export function applyUnmark(
  board: Board,
  value: number,
  profile: RuleProfile,
): Result<number> {
  if (profile.markingMode === 'auto') {
    return err('mark/automatic', 'Appen markerer for deg denne runden.')
  }
  if (!board.marks.has(value)) {
    return err('mark/notMarked', 'Det tallet er ikke markert.')
  }
  board.marks.delete(value)
  return ok(value)
}

/**
 * Automatisk markering: tallet krysses av på alle brett som har det. Kalles rett
 * etter hvert trekk, før BINGO-kontrollen, slik at automatisk vinner ser samme
 * virkelighet som spilleren.
 */
export function autoMark(boards: readonly Board[], value: number): number {
  let marked = 0
  for (const board of boards) {
    if (boardHasNumber(board, value)) {
      board.marks.add(value)
      marked += 1
    }
  }
  return marked
}
