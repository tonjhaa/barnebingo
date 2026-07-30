import { getFormat } from './registry'
import type { RuleProfile } from './types'

export interface ConfigIssue {
  /** Stabil kode for tester og UI. Meldingen er for mennesker. */
  code: string
  message: string
  severity: 'error' | 'warning'
}

/**
 * Kontrollerer at en regelprofil er internt konsistent. Dette er stedet der
 * regelkonfliktene fra ARKITEKTUR.md §9 håndheves — ikke i UI-et, som kan
 * omgås, og ikke i motoren, som skal kunne stole på profilen sin.
 */
export function validateProfile(profile: RuleProfile): ConfigIssue[] {
  const issues: ConfigIssue[] = []
  const format = getFormat(profile.format)
  const { layout } = profile
  const rangeSize = profile.numberRange.max - profile.numberRange.min + 1

  // --- Layout-sanity. Disse kan bare feile hvis et format er feilskrevet. ---
  if (layout.columnRanges.length !== layout.cols) {
    issues.push({
      code: 'layout/columnRanges',
      severity: 'error',
      message: `Formatet har ${layout.cols} kolonner, men ${layout.columnRanges.length} tallområder.`,
    })
  }
  if (layout.cellsPerRow > layout.cols) {
    issues.push({
      code: 'layout/cellsPerRow',
      severity: 'error',
      message: 'En rad kan ikke ha flere tall enn brettet har kolonner.',
    })
  }
  if (layout.freeCenter && (layout.rows % 2 === 0 || layout.cols % 2 === 0)) {
    issues.push({
      code: 'layout/freeCenter',
      severity: 'error',
      message: 'Fri midtrute krever et ulikt antall rader og kolonner.',
    })
  }

  // --- K1: formatet, ikke verten, bestemmer hvilke stadier som finnes. ---
  const availableIds = new Set(format.availableStages().map((s) => s.id))
  for (const stage of profile.prizeStages) {
    if (!availableIds.has(stage.id)) {
      issues.push({
        code: 'stages/unavailable',
        severity: 'error',
        message: `«${stage.label}» finnes ikke i ${format.name}.`,
      })
    }
  }
  if (profile.prizeStages.length === 0) {
    issues.push({
      code: 'stages/empty',
      severity: 'error',
      message: 'Velg minst ett premiestadium.',
    })
  }
  for (const stage of profile.prizeStages) {
    if (stage.type === 'rows' && stage.requiredRows >= layout.rows) {
      issues.push({
        code: 'stages/rowsEqualsFullBoard',
        severity: 'error',
        message: `${stage.requiredRows} rader er hele brettet i ${format.name} — bruk «Fullt brett» i stedet.`,
      })
    }
  }
  const ordered = profile.prizeStages.every(
    (stage, i) => i === 0 || stage.requiredRows > profile.prizeStages[i - 1].requiredRows,
  )
  if (!ordered) {
    issues.push({
      code: 'stages/notEscalating',
      severity: 'error',
      message: 'Premiestadiene må bli vanskeligere, ikke lettere, utover i runden.',
    })
  }

  // --- Brett per spiller ---
  if (profile.boardsPerPlayer > format.maxBoardsPerPlayer) {
    issues.push({
      code: 'boards/tooMany',
      severity: 'error',
      message: `${format.name} støtter maks ${format.maxBoardsPerPlayer} brett per spiller.`,
    })
  }

  // --- K4: hjelpemidler og feilmarkering kan ikke sameksistere. ---
  if (
    profile.allowInvalidMarks &&
    (profile.markingMode !== 'manual' || profile.winMode !== 'manual')
  ) {
    issues.push({
      code: 'marking/invalidWithAssist',
      severity: 'error',
      message:
        'Feilmarkering kan ikke tillates samtidig med automatisk eller assistert modus.',
    })
  }

  // --- K9: brettet må ikke dekke halve tallområdet. ---
  // Med dagens tre formater kan dette ikke slå til (16/40, 25/75, 15/90). Sjekken
  // står som gjerde for framtidige formater med små tallområder, der alle spillere
  // ellers ville fått bingo på nesten samme trekk.
  if (profile.numbersPerBoard > rangeSize) {
    issues.push({
      code: 'range/tooSmall',
      severity: 'error',
      message: `Et brett trenger ${profile.numbersPerBoard} tall, men området har bare ${rangeSize}.`,
    })
  } else if (profile.numbersPerBoard > rangeSize * 0.5) {
    issues.push({
      code: 'range/tight',
      severity: 'warning',
      message:
        'Brettet dekker mer enn halve tallområdet. Alle får sannsynligvis bingo omtrent samtidig.',
    })
  }

  // --- Trekketempo ---
  if (profile.drawMode !== 'manual') {
    if (profile.drawIntervalMs < 3000) {
      issues.push({
        code: 'draw/tooFast',
        severity: 'error',
        message: 'Automatisk trekking må ha minst 3 sekunder mellom tallene.',
      })
    } else if (profile.drawIntervalMs < 5000 && profile.markingMode === 'manual') {
      issues.push({
        code: 'draw/fastForManual',
        severity: 'warning',
        message: 'Under 5 sekunder er stramt når spillerne skal markere selv.',
      })
    }
  }

  if (profile.bingoWindowMs < 0 || profile.bingoWindowMs > 10000) {
    issues.push({
      code: 'bingo/window',
      severity: 'error',
      message: 'Bingo-vinduet må være mellom 0 og 10 sekunder.',
    })
  }

  return issues
}

export function isPlayable(profile: RuleProfile): boolean {
  return validateProfile(profile).every((issue) => issue.severity !== 'error')
}
