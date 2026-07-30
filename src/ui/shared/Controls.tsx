'use client'

import type { ReactNode } from 'react'

/**
 * Kontrollene i vertens oppsett. Alle er segmenterte valg framfor nedtrekks-
 * menyer: verten sitter gjerne med en fjernkontroll eller et nettbrett i fanget,
 * og skal se alle alternativene samtidig uten å åpne noe.
 */

export function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flate p-6">
      <h3 className="mb-5 text-sm font-black tracking-[0.2em] text-tekst-svak uppercase">
        {title}
      </h3>
      <div className="flex flex-col gap-5">{children}</div>
    </section>
  )
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
      <div className="min-w-0">
        <p className="text-lg font-bold">{label}</p>
        {hint && <p className="text-sm text-tekst-svak">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

export interface Choice<T> {
  value: T
  label: string
  hint?: string
}

export function Segmented<T extends string | number | boolean>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T
  options: ReadonlyArray<Choice<T>>
  onChange: (value: T) => void
  ariaLabel: string
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="flex flex-wrap gap-1 rounded-2xl border border-kant bg-natt p-1"
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={String(option.value)}
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            title={option.hint}
            className={`rounded-xl px-4 py-2.5 text-base font-bold transition-colors ${
              active
                ? 'bg-sol text-natt'
                : 'text-tekst-svak hover:bg-flate-2 hover:text-tekst'
            }`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export function Toggle({
  checked,
  onChange,
  ariaLabel,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  ariaLabel: string
}) {
  return (
    <Segmented
      ariaLabel={ariaLabel}
      value={checked}
      onChange={onChange}
      options={[
        { value: false, label: 'Av' },
        { value: true, label: 'På' },
      ]}
    />
  )
}

/**
 * Et premiestadium. Det siste avhukede kan ikke slås av — en runde uten premier
 * er ikke en runde, og det er vennligere å låse knappen enn å la verten oppdage
 * feilen gjennom en feilmelding.
 */
export function StageToggle({
  label,
  checked,
  locked,
  onChange,
}: {
  label: string
  checked: boolean
  locked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <button
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={locked && checked}
      onClick={() => onChange(!checked)}
      className={`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors disabled:cursor-not-allowed ${
        checked
          ? 'border-turkis bg-turkis/15 text-tekst'
          : 'border-kant bg-natt text-tekst-svak hover:border-lilla'
      }`}
    >
      <span
        aria-hidden
        className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg border-2 text-sm font-black ${
          checked ? 'border-turkis bg-turkis text-natt' : 'border-kant'
        }`}
      >
        {checked ? '✓' : ''}
      </span>
      <span className="text-lg font-bold">{label}</span>
    </button>
  )
}

export function BigChoice<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  columns = 3,
}: {
  value: T
  options: ReadonlyArray<Choice<T>>
  onChange: (value: T) => void
  ariaLabel: string
  columns?: number
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="grid gap-3"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            role="radio"
            aria-checked={active}
            // Uten dette blir det tilgjengelige navnet hele kortet, inkludert
            // forklaringen under. En skjermleser skal høre «Barnebingo».
            aria-label={option.label}
            onClick={() => onChange(option.value)}
            className={`rounded-2xl border-2 p-4 text-left transition-colors ${
              active
                ? 'border-sol bg-sol/12'
                : 'border-kant bg-natt hover:border-lilla'
            }`}
          >
            <span className="block text-xl font-black">{option.label}</span>
            {option.hint && (
              <span className="mt-1 block text-sm leading-snug text-tekst-svak">
                {option.hint}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
