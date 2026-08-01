'use client'

import { useMemo } from 'react'
import { countNumbers } from '@/domain/formats/definition'
import { DIFFICULTY_PRESETS } from '@/domain/formats/presets'
import { buildProfile, getFormat } from '@/domain/formats/registry'
import { validateProfile } from '@/domain/formats/validate'
import {
  DIFFICULTIES,
  FORMAT_IDS,
  type BoardCount,
  type ConfigInput,
  type Difficulty,
  type DrawMode,
  type FormatId,
  type MarkingMode,
  type WinMode,
} from '@/domain/formats/types'
import { Button } from '@/ui/shared/Button'
import {
  BigChoice,
  Field,
  Group,
  Segmented,
  StageToggle,
  Toggle,
  type Choice,
} from '@/ui/shared/Controls'

const MARKING: ReadonlyArray<Choice<MarkingMode>> = [
  { value: 'manual', label: 'Selv' },
  { value: 'assisted', label: 'Med hint' },
  { value: 'auto', label: 'Automatisk' },
]

const WIN: ReadonlyArray<Choice<WinMode>> = [
  { value: 'manual', label: 'Selv' },
  { value: 'assisted', label: 'Knappen lyser' },
  { value: 'autoWin', label: 'Automatisk' },
]

const DRAW: ReadonlyArray<Choice<DrawMode>> = [
  { value: 'manual', label: 'Verten trekker' },
  { value: 'auto', label: 'Automatisk' },
  { value: 'autoConfirm', label: 'Med bekreftelse' },
]

const INTERVALS: ReadonlyArray<Choice<number>> = [
  { value: 5000, label: '5 sek' },
  { value: 8000, label: '8 sek' },
  { value: 10000, label: '10 sek' },
  { value: 15000, label: '15 sek' },
]

const BOARDS: ReadonlyArray<Choice<BoardCount>> = [
  { value: 1, label: '1' },
  { value: 2, label: '2' },
  { value: 3, label: '3' },
  { value: 4, label: '4' },
  { value: 5, label: '5' },
  { value: 6, label: '6' },
]

/**
 * Vertens oppsett. Alt regelverket ligger allerede i domenelaget, så panelet
 * bygger profilen lokalt for øyeblikkelig forhåndsvisning og validering.
 * Serveren validerer den samme profilen på nytt når endringen sendes — det er
 * fortsatt serveren som bestemmer, klienten bare slipper å vente på svar for
 * å tegne riktig.
 */
export function ConfigPanel({
  configInput,
  onChange,
  onDone,
  doneLabel,
  busy = false,
}: {
  configInput: ConfigInput
  onChange: (next: ConfigInput) => void
  onDone: () => void
  doneLabel: string
  busy?: boolean
}) {
  const format = getFormat(configInput.format)
  const profile = useMemo(() => buildProfile(configInput), [configInput])
  const issues = useMemo(() => validateProfile(profile), [profile])
  const blocking = issues.filter((issue) => issue.severity === 'error')
  const warnings = issues.filter((issue) => issue.severity === 'warning')

  const patch = (partial: Partial<ConfigInput>) => onChange({ ...configInput, ...partial })

  /** Et nytt nivå er en ny start, ikke et lag oppå gamle overstyringer. */
  const pickDifficulty = (difficulty: Difficulty) =>
    onChange({
      format: configInput.format,
      difficulty,
      enabledStageIds: configInput.enabledStageIds,
    })

  const availableStages = format.availableStages()
  const activeStageIds = new Set(profile.prizeStages.map((stage) => stage.id))
  const onlyOneStageLeft = activeStageIds.size <= 1

  const toggleStage = (id: string, on: boolean) => {
    const next = new Set(activeStageIds)
    if (on) next.add(id)
    else next.delete(id)
    patch({
      enabledStageIds: availableStages
        .filter((stage) => next.has(stage.id))
        .map((stage) => stage.id),
    })
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="grid gap-6 xl:grid-cols-2">
        <Group title="Spillet">
          <BigChoice
            ariaLabel="Bingoformat"
            value={configInput.format}
            onChange={(value: FormatId) => patch({ format: value })}
            options={FORMAT_IDS.map((id) => {
              const definition = getFormat(id)
              // Antall tall avhenger av fri midtrute, så kortet for det valgte
              // formatet må regne med vertens faktiske innstilling — ellers
              // står det 25 tall på et brett som har 24.
              const layout = definition.buildLayout({
                freeCenter:
                  id === configInput.format
                    ? profile.layout.freeCenter
                    : definition.supportsFreeCenter,
              })
              return {
                value: id,
                label: definition.name,
                hint: `${layout.rows} × ${layout.cols} · ${countNumbers(layout)} tall · ${definition.numberRange.min}–${definition.numberRange.max}`,
              }
            })}
          />

          <BigChoice
            ariaLabel="Vanskelighetsgrad"
            columns={2}
            value={configInput.difficulty}
            onChange={pickDifficulty}
            options={DIFFICULTIES.map((id) => ({
              value: id,
              label: DIFFICULTY_PRESETS[id].label,
              hint: DIFFICULTY_PRESETS[id].description,
            }))}
          />
        </Group>

        <div className="flex flex-col gap-6">
          <Group title="Brettene">
            {/* I formater som selges i ark telles ark, ikke enkeltbrett. Ett
                ark er alltid helt — seks brett med alle nitti tallene. */}
            <Field
              label={format.stripSize ? 'Ark per spiller' : 'Brett per spiller'}
              hint={
                format.stripSize
                  ? `Ett ark er ${format.stripSize} brett med alle tallene fra ${format.numberRange.min} til ${format.numberRange.max}.`
                  : 'Alle brett vurderes hver for seg.'
              }
            >
              <Segmented
                ariaLabel={format.stripSize ? 'Ark per spiller' : 'Brett per spiller'}
                value={profile.boardsPerPlayer}
                onChange={(value) => patch({ boardsPerPlayer: value })}
                options={BOARDS.filter((o) => o.value <= format.maxBoardsPerPlayer)}
              />
            </Field>

            {format.supportsFreeCenter && (
              <Field
                label="Fri midtrute"
                hint="Midtruta teller som markert fra start."
              >
                <Toggle
                  ariaLabel="Fri midtrute"
                  checked={profile.layout.freeCenter}
                  onChange={(value) => patch({ freeCenter: value })}
                />
              </Field>
            )}
          </Group>

          <Group title="Slik spiller vi">
            <Field label="Markering" hint="Hvem krysser av tallene?">
              <Segmented
                ariaLabel="Markering"
                value={profile.markingMode}
                onChange={(value) => patch({ markingMode: value })}
                options={MARKING}
              />
            </Field>

            <Field label="Bingo" hint="Hvem oppdager at noen har vunnet?">
              <Segmented
                ariaLabel="Bingo"
                value={profile.winMode}
                onChange={(value) => patch({ winMode: value })}
                options={WIN}
              />
            </Field>

            <Field label="Trekking">
              <Segmented
                ariaLabel="Trekking"
                value={profile.drawMode}
                onChange={(value) => patch({ drawMode: value })}
                options={DRAW}
              />
            </Field>

            {profile.drawMode !== 'manual' && (
              <Field label="Tid mellom tallene">
                <Segmented
                  ariaLabel="Tid mellom tallene"
                  value={profile.drawIntervalMs}
                  onChange={(value) => patch({ drawIntervalMs: value })}
                  options={INTERVALS}
                />
              </Field>
            )}
          </Group>
        </div>

        <Group title="Premier">
          <div className="grid gap-3 sm:grid-cols-2">
            {availableStages.map((stage) => (
              <StageToggle
                key={stage.id}
                label={stage.label}
                checked={activeStageIds.has(stage.id)}
                locked={onlyOneStageLeft}
                onChange={(on) => toggleStage(stage.id, on)}
              />
            ))}
          </div>

          <Field
            label="Flere vinnere samtidig"
            hint="Alle som har bingo på samme tall vinner sammen."
          >
            <Toggle
              ariaLabel="Flere vinnere samtidig"
              checked={profile.allowMultipleWinnersPerStage}
              onChange={(value) => patch({ allowMultipleWinnersPerStage: value })}
            />
          </Field>

          <Field
            label="Samme spiller kan vinne igjen"
            hint="Slå av for å gi flere barn en premie hver."
          >
            <Toggle
              ariaLabel="Samme spiller kan vinne igjen"
              checked={profile.allowRepeatWinners}
              onChange={(value) => patch({ allowRepeatWinners: value })}
            />
          </Field>
        </Group>

        <Group title="På telefonen">
          <Field label="Vis tallet som ble trukket">
            <Toggle
              ariaLabel="Vis tallet som ble trukket"
              checked={profile.showCurrentNumberOnPhone}
              onChange={(value) => patch({ showCurrentNumberOnPhone: value })}
            />
          </Field>

          <Field label="Vis tidligere tall">
            <Toggle
              ariaLabel="Vis tidligere tall"
              checked={profile.showDrawHistoryOnPhone}
              onChange={(value) => patch({ showDrawHistoryOnPhone: value })}
            />
          </Field>

          {/* Programlederen slås på her, men finstilles under spill: alt om
              stemme, historier, musikk og effekter ligger bak tannhjulet på
              hovedskjermen, der man hører resultatet med én gang. */}
          <Field label="Programleder" hint="Leser opp tallene og leder spillet.">
            <Toggle
              ariaLabel="Programleder"
              checked={profile.speech}
              onChange={(value) => patch({ speech: value })}
            />
          </Field>
        </Group>
      </div>

      {(blocking.length > 0 || warnings.length > 0) && (
        <ul className="flex flex-col gap-2">
          {[...blocking, ...warnings].map((issue) => (
            <li
              key={issue.code}
              className={`rounded-2xl px-5 py-3 text-lg font-bold ${
                issue.severity === 'error'
                  ? 'bg-bringebaer/15 text-bringebaer'
                  : 'bg-sol/12 text-sol'
              }`}
            >
              {issue.message}
            </li>
          ))}
        </ul>
      )}

      <div className="flex justify-center">
        <Button size="stor" onClick={onDone} disabled={busy || blocking.length > 0}>
          {doneLabel}
        </Button>
      </div>
    </div>
  )
}
