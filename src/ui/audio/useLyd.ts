'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { GameEvent } from '@/domain/audio/events'
import type { Lydinnstillinger } from '@/domain/audio/settings'
import { AudioDirector } from './AudioDirector'
import type { Effekt } from './musikk'

/**
 * Lyden på hovedskjermen.
 *
 * Hooken eier én dirigent gjennom hele skjermens levetid og mater den med
 * hendelsene som kommer inn. Den lages i en effekt, ikke under tegning: den
 * rører `Audio` og `speechSynthesis`, som ikke hører hjemme i render.
 *
 * Innstillinger sendes videre til den samme dirigenten framfor å bygge en ny.
 * Bygde vi på nytt hver gang verten skrudde på en bryter, ville køen blitt tømt
 * midt i en setning.
 */
export function useLyd(
  innstillinger: Lydinnstillinger,
  events: GameEvent[] | undefined,
  eventSeq: number | undefined,
  options: { harNavn?: (navn: string) => boolean; spent?: boolean } = {},
) {
  const dirigent = useRef<AudioDirector | null>(null)
  const [undertekst, setUndertekst] = useState<string | null>(null)

  const harNavn = useRef(options.harNavn)
  useEffect(() => {
    harNavn.current = options.harNavn
  }, [options.harNavn])

  // Dirigenten trenger innstillingene ved oppstart, men skal ikke bygges på
  // nytt når de endrer seg — derfor en ref her og en effekt under.
  const første = useRef(innstillinger)

  useEffect(() => {
    const d = new AudioDirector(
      første.current,
      { påTale: (utspill) => setUndertekst(utspill?.text ?? null) },
      { harNavn: (navn) => harNavn.current?.(navn) ?? true },
    )
    dirigent.current = d
    return () => {
      d.frigi()
      dirigent.current = null
    }
  }, [])

  useEffect(() => {
    dirigent.current?.settInnstillinger(innstillinger)
  }, [innstillinger])

  useEffect(() => {
    dirigent.current?.settSpent(options.spent ?? false)
  }, [options.spent])

  useEffect(() => {
    if (!events || eventSeq === undefined) return
    dirigent.current?.behandle(events, eventSeq)
  }, [events, eventSeq])

  /** Kalles fra en klikkhåndterer. Nettleseren krever et brukertrykk. */
  const låsOpp = useCallback(() => {
    void dirigent.current?.låsOpp()
  }, [])

  const stopp = useCallback(() => dirigent.current?.stopp(), [])

  const spillEffekt = useCallback(
    (effekt: Effekt) => dirigent.current?.spillEffekt(effekt),
    [],
  )

  /** Sier en kort prøvereplikk, så verten kan høre stemmen før spillet går. */
  const testStemme = useCallback(() => {
    void dirigent.current?.låsOpp()
    dirigent.current?.si({
      deler: [
        { id: 'sys-velkommen-1', tekst: 'Velkommen til bingo!' },
        { id: 'tall-7', tekst: 'Sju' },
        { id: 'nummer-7', tekst: 'nummer sju' },
      ],
      text: 'Velkommen til bingo! Sju … nummer sju.',
      priority: 'normal',
    })
  }, [])

  return { undertekst, låsOpp, stopp, spillEffekt, testStemme }
}
