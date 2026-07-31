'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { GameEvent } from '@/domain/audio/events'
import type { TaleInnstillinger } from '@/domain/audio/speech'
import { AudioDirector } from './AudioDirector'

/**
 * Lyden på hovedskjermen.
 *
 * Hooken eier én dirigent gjennom hele skjermens levetid og mater den med
 * hendelsene som kommer inn. Den lages i en effekt, ikke under tegning: den
 * rører `Audio` og `speechSynthesis`, som ikke hører hjemme i render.
 */
export function useLyd(
  innstillinger: TaleInnstillinger,
  events: GameEvent[] | undefined,
  eventSeq: number | undefined,
  options: { på: boolean; harNavn?: (navn: string) => boolean } = { på: true },
) {
  const dirigent = useRef<AudioDirector | null>(null)
  const [undertekst, setUndertekst] = useState<string | null>(null)

  // Navneoppslaget leses gjennom en ref, så dirigenten ikke må bygges på nytt
  // hver gang lista over genererte navn endrer seg — da ville køen blitt tømt
  // midt i en setning.
  const harNavn = useRef(options.harNavn)
  useEffect(() => {
    harNavn.current = options.harNavn
  }, [options.harNavn])

  useEffect(() => {
    const d = new AudioDirector(
      innstillinger,
      { påTale: (utspill) => setUndertekst(utspill?.text ?? null) },
      { harNavn: (navn) => harNavn.current?.(navn) ?? true },
    )
    dirigent.current = d
    return () => {
      d.frigi()
      dirigent.current = null
    }
    // Med vilje tom: dirigenten skal leve like lenge som skjermen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    dirigent.current?.settInnstillinger(innstillinger)
  }, [innstillinger])

  useEffect(() => {
    dirigent.current?.settPå(options.på)
  }, [options.på])

  useEffect(() => {
    if (!events || eventSeq === undefined) return
    dirigent.current?.behandle(events, eventSeq)
  }, [events, eventSeq])

  /** Kalles fra en klikkhåndterer. Nettleseren krever et brukertrykk. */
  const låsOpp = useCallback(() => {
    void dirigent.current?.låsOpp()
  }, [])

  const stopp = useCallback(() => dirigent.current?.stopp(), [])

  return { undertekst, låsOpp, stopp }
}
