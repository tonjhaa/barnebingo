'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Tallopplesning på hovedskjermen (§13). Lyd er et hjelpemiddel, aldri eneste
 * informasjonskilde — alt som leses opp står også på skjermen.
 *
 * Nettlesere nekter å snakke før brukeren har gjort noe på siden. Derfor låses
 * stemmen opp ved vertens første trykk, som uansett kommer før det første
 * tallet trekkes.
 */

/** Rekkefølgen vi leter etter en stemme i: norsk først, så nabospråk. */
const SPRÅK = ['nb', 'no', 'nn', 'da', 'sv']

function velgStemme(): SpeechSynthesisVoice | null {
  const stemmer = window.speechSynthesis.getVoices()
  for (const språk of SPRÅK) {
    const treff = stemmer.find((stemme) => stemme.lang.toLowerCase().startsWith(språk))
    if (treff) return treff
  }
  // Ingen skandinavisk stemme: la nettleseren velge selv. Tallene blir uttalt
  // på feil språk, men stumt er verre enn rart.
  return null
}

export function useSpeech(enabled: boolean) {
  const [stemme, setStemme] = useState<SpeechSynthesisVoice | null>(null)
  const låstOpp = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return

    const oppdater = () => setStemme(velgStemme())
    oppdater()
    // Stemmelista lastes asynkront i Chrome, og er tom ved første kall.
    window.speechSynthesis.addEventListener('voiceschanged', oppdater)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', oppdater)
  }, [])

  const støttes = typeof window !== 'undefined' && Boolean(window.speechSynthesis)

  /** Kalles fra en klikkhåndterer for å få lov til å snakke senere. */
  const låsOpp = useCallback(() => {
    if (låstOpp.current || !støttes) return
    låstOpp.current = true
    // En tom ytring er nok til å gi nettleseren det brukertrykket den vil ha.
    const stille = new SpeechSynthesisUtterance('')
    stille.volume = 0
    window.speechSynthesis.speak(stille)
  }, [støttes])

  const si = useCallback(
    (tekst: string) => {
      if (!enabled || !støttes || !tekst) return
      // Et nytt tall skal avbryte det forrige, ikke stille seg i kø bak det.
      window.speechSynthesis.cancel()
      const ytring = new SpeechSynthesisUtterance(tekst)
      ytring.lang = stemme?.lang ?? 'nb-NO'
      if (stemme) ytring.voice = stemme
      ytring.rate = 0.95
      window.speechSynthesis.speak(ytring)
    },
    [enabled, støttes, stemme],
  )

  // Ingen skal stå igjen og snakke til en tom stue.
  useEffect(() => {
    if (!støttes) return
    return () => window.speechSynthesis.cancel()
  }, [støttes])

  return { si, låsOpp, støttes }
}

/**
 * Leser opp det som endrer seg i runden: tallet, premiekravet og vinneren.
 * Hver ting sies én gang — hooken husker hva den sist sa.
 */
export function useRoundSpeech(
  enabled: boolean,
  round: {
    currentLabel: string | null
    drawnCount: number
    stageLabel: string | null
    prize: { stageLabel: string; winners: Array<{ name: string }> } | null
  } | null,
) {
  const { si, låsOpp, støttes } = useSpeech(enabled)
  const sistTall = useRef(-1)
  const sistStadium = useRef<string | null>(null)
  const sistPremie = useRef<string | null>(null)

  useEffect(() => {
    if (!round) return

    if (round.prize) {
      const nøkkel = `${round.prize.stageLabel}:${round.prize.winners.map((w) => w.name).join(',')}`
      if (sistPremie.current !== nøkkel) {
        sistPremie.current = nøkkel
        const navn = round.prize.winners.map((w) => w.name)
        si(
          navn.length === 0
            ? 'Vi har en vinner'
            : `${listeMedOg(navn)} har bingo!`,
        )
      }
      return
    }
    sistPremie.current = null

    if (round.stageLabel && sistStadium.current !== round.stageLabel) {
      const første = sistStadium.current === null
      sistStadium.current = round.stageLabel
      // Ved rundestart er stadiet allerede på skjermen; da holder det å si det
      // ved skifte, ikke ved hvert eneste tall.
      if (!første) {
        si(`Nå spiller vi om ${round.stageLabel.toLowerCase()}`)
        return
      }
    }

    if (round.currentLabel && sistTall.current !== round.drawnCount) {
      sistTall.current = round.drawnCount
      si(round.currentLabel)
    }
  }, [round, si])

  return { låsOpp, støttes }
}

function listeMedOg(navn: string[]): string {
  if (navn.length === 1) return navn[0]
  return `${navn.slice(0, -1).join(', ')} og ${navn.at(-1)}`
}
