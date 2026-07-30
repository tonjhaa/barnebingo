import type { RuleProfile } from '../formats/types'

/**
 * Premiemotoren avgjør hvem av dem som ropte bingo som faktisk får premien.
 * Selve kontrollen av brettene har allerede skjedd — her handler alt om
 * vertens regler for gjentatte og samtidige vinnere (§9).
 */

export interface BingoClaim {
  playerId: string
  boardId: string
  completedRows: number[]
  atDrawIndex: number
  claimedAt: number
}

export interface WinnerSelection {
  winners: BingoClaim[]
  /** Andre som hadde gyldig bingo, men ikke fikk premien denne gangen. De skal
   *  få «du hadde også bingo», ikke «ugyldig» — teknisk tap, sosialt uavgjort. */
  alsoHadBingo: BingoClaim[]
  /** Sperren mot gjentatte vinnere ble opphevet fordi ingen andre kunne vinne. */
  lockoutIgnored: boolean
}

export function selectWinners(
  claims: readonly BingoClaim[],
  profile: RuleProfile,
  hasWonBefore: (playerId: string) => boolean,
): WinnerSelection {
  if (claims.length === 0) {
    return { winners: [], alsoHadBingo: [], lockoutIgnored: false }
  }

  const order = [...claims].sort((a, b) => a.claimedAt - b.claimedAt)

  let eligible = order
  let lockoutIgnored = false

  if (!profile.allowRepeatWinners) {
    const fresh = order.filter((claim) => !hasWonBefore(claim.playerId))
    if (fresh.length > 0) {
      eligible = fresh
    } else {
      // Alle som har bingo har vunnet før. Å håndheve sperren her ville låst
      // runden for godt (ARKITEKTUR.md §9 K6), så den oppheves for dette
      // stadiet og hovedskjermen sier fra.
      lockoutIgnored = true
    }
  }

  const winners = profile.allowMultipleWinnersPerStage ? eligible : eligible.slice(0, 1)
  const winnerIds = new Set(winners.map((claim) => claim.playerId))

  return {
    winners,
    alsoHadBingo: order.filter((claim) => !winnerIds.has(claim.playerId)),
    lockoutIgnored,
  }
}
