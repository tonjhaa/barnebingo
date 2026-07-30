import { bingo75 } from './bingo75'
import { bingo90 } from './bingo90'
import { kids } from './kids'
import { countNumbers, type FormatDefinition } from './definition'
import type {
  ConfigInput,
  Difficulty,
  FormatId,
  PrizeStageDef,
  RuleProfile,
} from './types'
import type { DifficultyPreset } from './presets'
import { DIFFICULTY_PRESETS } from './presets'

export const FORMATS: Record<FormatId, FormatDefinition> = {
  kids,
  bingo75,
  bingo90,
}

export function getFormat(id: FormatId): FormatDefinition {
  const format = FORMATS[id]
  if (!format) throw new Error(`Ukjent bingoformat: ${id}`)
  return format
}

/**
 * Bygger en komplett regelprofil av vertens valg. Vanskelighetsgraden gir
 * utgangspunktet; alt verten har satt eksplisitt overstyrer det (§6).
 *
 * Funksjonen bygger alltid *en* profil — den avviser ingenting. Gyldighet er
 * `validateConfig` sin jobb, slik at UI-et kan vise en ugyldig kombinasjon med
 * forklaring i stedet for å kaste.
 */
export function buildProfile(input: ConfigInput): RuleProfile {
  const format = getFormat(input.format)
  const preset: DifficultyPreset = DIFFICULTY_PRESETS[input.difficulty]

  const freeCenter = format.supportsFreeCenter ? (input.freeCenter ?? true) : false
  const layout = format.buildLayout({ freeCenter })

  const available = format.availableStages()
  const stages = selectStages(available, input.enabledStageIds)

  const markingMode = input.markingMode ?? preset.markingMode
  const winMode = input.winMode ?? preset.winMode

  return {
    format: input.format,
    difficulty: input.difficulty,
    layout,
    numberRange: format.numberRange,
    numbersPerBoard: countNumbers(layout),
    boardsPerPlayer: input.boardsPerPlayer ?? preset.boardsPerPlayer,

    markingMode,
    // Låst i v1. Se ARKITEKTUR.md §9 K4 — assistert og automatisk modus kan
    // ikke sameksistere med feilmarkeringer, og for barn vil vi uansett ikke ha dem.
    allowInvalidMarks: false,

    winMode,
    bingoWindowMs: input.bingoWindowMs ?? preset.bingoWindowMs,
    allowRepeatWinners: input.allowRepeatWinners ?? true,
    allowMultipleWinnersPerStage: input.allowMultipleWinnersPerStage ?? true,

    prizeStages: stages,

    drawMode: input.drawMode ?? preset.drawMode,
    drawIntervalMs: input.drawIntervalMs ?? preset.drawIntervalMs,

    linePattern: 'horizontal',
    crossBoardCombination: false,

    speech: input.speech ?? preset.speech,
    showCurrentNumberOnPhone:
      input.showCurrentNumberOnPhone ?? preset.showCurrentNumberOnPhone,
    showDrawHistoryOnPhone:
      input.showDrawHistoryOnPhone ?? preset.showDrawHistoryOnPhone,
  }
}

/**
 * Beholder formatets rekkefølge uansett hvilken rekkefølge verten huket av i.
 * Premiestadier må eskalere — det gir ingen mening å spille om fullt brett først.
 *
 * En tom liste gir en tom liste, ikke alle stadiene. Å «hjelpe» verten her ville
 * skjult en ugyldig konfigurasjon bak et spill som plutselig hadde flere premier
 * enn hen valgte; `validateProfile` skal få se sannheten og si fra.
 */
function selectStages(
  available: PrizeStageDef[],
  enabledIds: string[] | undefined,
): PrizeStageDef[] {
  if (!enabledIds) return available
  const wanted = new Set(enabledIds)
  return available.filter((stage) => wanted.has(stage.id))
}

/** Standardoppsettet en ny vert møter før hen har rørt noe. */
export function defaultConfigInput(): ConfigInput {
  return { format: 'kids', difficulty: 'enkel' }
}

export function defaultProfile(): RuleProfile {
  return buildProfile(defaultConfigInput())
}

export type { Difficulty }
