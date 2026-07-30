/**
 * Brettentiteten. Generering ligger i `generate.ts`; her bor formen og de rene
 * spørsmålene man kan stille et brett.
 *
 * Sentralt skille: `marks` er hva spilleren har *påstått*, mens gyldige
 * markeringer er snittet mellom `marks` og de faktisk trukne tallene. All
 * fremdrift, alle hint og all BINGO-validering bruker det gyldige snittet — det
 * er derfor en feilmarkering aldri kan forgifte motoren (ARKITEKTUR.md §4).
 */

export interface Cell {
  /** null = tom rute. 90-formatet har 12 av dem per brett. */
  value: number | null
  isFree: boolean
}

export interface Board {
  id: string
  playerId: string
  /** cells[rad][kolonne] */
  cells: Cell[][]
  /** Spillerens påstander. Serveren avviser utrukne tall før de havner her,
   *  så i v1 er dette alltid identisk med de gyldige markeringene. */
  marks: Set<number>
}

export interface BoardProgress {
  /** Radindekser som er komplett markert. */
  completedRows: number[]
  markedCount: number
  numberCount: number
  isFull: boolean
}

/** Alle tallene på brettet, i lesrekkefølge. Tomme ruter hoppes over. */
export function boardNumbers(board: Board): number[] {
  const out: number[] = []
  for (const row of board.cells) {
    for (const cell of row) {
      if (cell.value !== null) out.push(cell.value)
    }
  }
  return out
}

export function boardHasNumber(board: Board, value: number): boolean {
  return board.cells.some((row) => row.some((cell) => cell.value === value))
}

/**
 * En rute teller som dekket hvis den er fri, tom, eller markert med et trukket
 * tall. Tomme ruter i 90-formatet er ikke hindringer — en rad der alle fem
 * tallene er markert er en full rad.
 */
function isCovered(cell: Cell, validMarks: ReadonlySet<number>): boolean {
  if (cell.isFree || cell.value === null) return true
  return validMarks.has(cell.value)
}

/**
 * Regner ut brettets status mot de tallene som faktisk er trukket.
 * `drawn` sendes inn framfor å leses fra brettet, slik at funksjonen forblir ren
 * og kan testes uten en runde.
 */
export function computeProgress(board: Board, drawn: ReadonlySet<number>): BoardProgress {
  const validMarks = new Set<number>()
  for (const mark of board.marks) {
    if (drawn.has(mark)) validMarks.add(mark)
  }

  const completedRows: number[] = []
  board.cells.forEach((row, index) => {
    if (row.every((cell) => isCovered(cell, validMarks))) completedRows.push(index)
  })

  const numberCount = boardNumbers(board).length
  return {
    completedRows,
    markedCount: validMarks.size,
    numberCount,
    isFull: completedRows.length === board.cells.length,
  }
}

export function validMarks(board: Board, drawn: ReadonlySet<number>): Set<number> {
  const out = new Set<number>()
  for (const mark of board.marks) if (drawn.has(mark)) out.add(mark)
  return out
}
