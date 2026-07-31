/**
 * Spillhendelser.
 *
 * Dette er skillet mellom spillet og lyden. Spillmotoren sier hva som skjedde —
 * «tallet 42 ble trukket», «Ada meldte seg klar» — og vet ingenting om hvilke
 * ord programlederen bruker eller hvilke filer som spilles. Lydsystemet leser
 * hendelsene og bestemmer resten.
 *
 * Uten dette skillet ville replikker og filnavn krøpet inn i room.ts, og det
 * ville ikke lenger vært mulig å skru av lyden, bytte språk eller teste
 * bingoreglene uten å dra med seg en lydmotor.
 *
 * Hendelsene er *fakta*, ikke instruksjoner. Derfor står det `numberDrawn` og
 * ikke `playDrawSound`.
 */

/**
 * Hvor viktig hendelsen er å få sagt.
 *
 * Prioriteten avgjør hva som skjer når to ting vil snakke samtidig. En godkjent
 * bingo må høres selv om programlederen står midt i en vits; en vits skal aldri
 * skyve et trukket tall til side.
 */
export const PRIORITIES = ['kritisk', 'høy', 'normal', 'lav'] as const
export type Priority = (typeof PRIORITIES)[number]

/** Rangering brukt av lydkøen. Lavere tall vinner. */
export const PRIORITY_ORDER: Record<Priority, number> = {
  kritisk: 0,
  høy: 1,
  normal: 2,
  lav: 3,
}

export function higherPriority(a: Priority, b: Priority): boolean {
  return PRIORITY_ORDER[a] < PRIORITY_ORDER[b]
}

// --- Hendelsene ------------------------------------------------------------

/**
 * Én hendelse per ting som faktisk skjer i spillet. Navnene følger §4 i
 * oppdraget; datafeltene er det minste lydsystemet trenger for å formulere seg.
 */
export type GameEventData =
  | { kind: 'roomOpened' }
  | { kind: 'playerJoined'; name: string }
  | { kind: 'playerReady'; name: string; readyCount: number; playerCount: number }
  | { kind: 'allReady'; playerCount: number }
  | { kind: 'roundStarted'; names: string[]; stageLabel: string; roundNumber: number }
  | { kind: 'stageAnnounced'; stageLabel: string; stageIndex: number; isFinalStage: boolean }
  | {
      kind: 'numberDrawn'
      value: number
      /** B–I–N–G–O, eller null i formater uten bokstaver. */
      letter: string | null
      drawnCount: number
      remaining: number
    }
  | { kind: 'paused' }
  | { kind: 'resumed' }
  | { kind: 'bingoClaimed'; name: string }
  | { kind: 'bingoRejected'; name: string }
  | {
      kind: 'bingoApproved'
      names: string[]
      stageLabel: string
      isFinalStage: boolean
    }
  | { kind: 'drawExhausted' }
  | { kind: 'roundFinished'; roundsPlayed: number }
  | { kind: 'newRoundStarted'; roundNumber: number }
  | { kind: 'gameEnded' }
  | { kind: 'playerDisconnected'; name: string }
  | { kind: 'playerReconnected'; name: string }

export type GameEventKind = GameEventData['kind']

export interface GameEvent {
  /** Monoton per rom. Klienten spiller bare det den ikke har hørt. */
  seq: number
  at: number
  data: GameEventData
}

/**
 * Prioritet per hendelse.
 *
 * `bingoApproved` og `roundFinished` er kritiske: de avslutter noe, og et barn
 * som nettopp vant skal høre det med én gang. Trukne tall og premiestadier er
 * høye — de styrer hva spillerne skal gjøre nå. Lobbyens småprat er normalt, og
 * kan trygt falle bort hvis noe viktigere kommer.
 */
export const EVENT_PRIORITY: Record<GameEventKind, Priority> = {
  roomOpened: 'lav',
  playerJoined: 'normal',
  playerReady: 'normal',
  allReady: 'normal',
  roundStarted: 'kritisk',
  stageAnnounced: 'høy',
  numberDrawn: 'høy',
  paused: 'normal',
  resumed: 'normal',
  bingoClaimed: 'høy',
  bingoRejected: 'normal',
  bingoApproved: 'kritisk',
  drawExhausted: 'høy',
  roundFinished: 'kritisk',
  newRoundStarted: 'normal',
  gameEnded: 'kritisk',
  playerDisconnected: 'lav',
  playerReconnected: 'lav',
}

/**
 * Hendelser der spillet står og venter på svar, og der en historie eller vits
 * ville kommet i veien for det som faktisk skjer.
 */
export const CRITICAL_KINDS: ReadonlySet<GameEventKind> = new Set<GameEventKind>([
  'bingoClaimed',
  'bingoApproved',
  'bingoRejected',
  'roundFinished',
  'gameEnded',
])

export function priorityOf(event: GameEventData): Priority {
  return EVENT_PRIORITY[event.kind]
}
