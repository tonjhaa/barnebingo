'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { ConfigSummary, RosterEntry } from '@/shared/protocol'
import { Avatar } from '@/ui/shared/Avatar'
import { Button } from '@/ui/shared/Button'
import { PlayScreen } from './PlayScreen'
import { SelfieStep } from './SelfieStep'
import { usePlayerRoom } from './usePlayerRoom'

export function PlayerScreen({ code }: { code: string }) {
  const {
    stage,
    view,
    roster,
    config,
    error,
    busy,
    claim,
    setReady,
    toggleCell,
    claimBingo,
    lagreSelfie,
    brukAvatar,
    bePlassen,
    venterPåVert,
    byttBilde,
  } = usePlayerRoom(code)

  if (stage === 'selfie' && view?.me) {
    return (
      <SelfieStep
        navn={view.me.name}
        farge={view.me.color}
        avatarId={view.me.avatarId}
        onLagre={lagreSelfie}
        onBrukAvatar={brukAvatar}
      />
    )
  }

  // Runden trumfer alt annet: har den startet, skal telefonen vise brettet.
  if (stage === 'med' && view?.round && view.me) {
    return (
      <PlayScreen
        view={view}
        round={view.round}
        markingMode={view.config.markingMode}
        onToggleCell={toggleCell}
        onClaimBingo={claimBingo}
      />
    )
  }

  if (stage === 'kobler') return <Enkel tittel="Kobler til spillet…" />
  if (stage === 'finnesIkke') {
    return (
      <Enkel
        tittel="Fant ikke rommet"
        under={error ?? 'Sjekk at koden er riktig, eller skann QR-koden på TV-en.'}
        lenke="/bli-med"
        lenketekst="Prøv en annen kode"
      />
    )
  }
  if (stage === 'avsluttet') {
    return <Enkel tittel="Spillet er ferdig" under="Takk for i dag!" />
  }

  if (stage === 'velgNavn') {
    return (
      <SkrivNavn
        code={code}
        roster={roster}
        busy={busy}
        error={error}
        venterPåVert={venterPåVert}
        onJoin={claim}
        onAskHost={bePlassen}
      />
    )
  }

  const me = view?.me
  if (!me || !config) return <Enkel tittel="Kobler til spillet…" />

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center px-5 py-8 text-center">
      <Avatar
        name={me.name}
        color={me.color}
        avatarId={me.avatarId}
        selfieUrl={me.selfieUrl}
        size={140}
      />
      <h1 className="mt-5 text-5xl font-black" style={{ color: me.color }}>
        {me.name}
      </h1>
      <button
        onClick={byttBilde}
        className="mt-2 text-base font-bold text-tekst-svak underline decoration-2 underline-offset-4"
      >
        {me.hasSelfie ? 'Ta nytt bilde' : 'Ta et bilde av deg selv'}
      </button>

      <div className="flate mt-8 w-full p-6 text-left">
        <p className="mb-4 text-sm font-bold tracking-widest text-tekst-svak uppercase">
          Vi skal spille
        </p>
        <p className="text-2xl font-black">{config.formatName}</p>
        <p className="mt-1 text-lg text-tekst-svak">
          {beskrivBrett(config)} · {config.markingLabel.toLowerCase()}
        </p>
        <p className="mt-4 text-lg text-tekst-svak">
          Vi spiller om: <span className="font-bold text-tekst">{config.stageLabels.join(' → ')}</span>
        </p>
      </div>

      <div className="mt-auto w-full pt-10">
        {me.ready ? (
          <>
            <p className="mb-4 text-2xl font-black text-turkis">Du er klar! 🎉</p>
            <p className="mb-5 text-lg text-tekst-svak">
              {allReady(roster)
                ? 'Alle er klare. Nå venter vi på verten.'
                : 'Venter på de andre…'}
            </p>
            <Button
              tone="stille"
              size="vanlig"
              className="w-full"
              disabled={busy}
              onClick={() => setReady(false)}
            >
              Vent litt, jeg er ikke klar
            </Button>
          </>
        ) : (
          <Button
            tone="turkis"
            size="stor"
            className="w-full"
            disabled={busy}
            onClick={() => setReady(true)}
          >
            Jeg er klar!
          </Button>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-5 text-lg font-bold text-bringebaer">
          {error}
        </p>
      )}
    </main>
  )
}

/**
 * Spilleren skriver navnet sitt selv. Er navnet allerede i bruk, er det som
 * regel fordi det er samme barn på en ny telefon — da tilbys veien om verten
 * (§23) i stedet for en blindvei.
 */
function SkrivNavn({
  code,
  roster,
  busy,
  error,
  venterPåVert,
  onJoin,
  onAskHost,
}: {
  code: string
  roster: RosterEntry[]
  busy: boolean
  error: string | null
  venterPåVert: string | null
  onJoin: (name: string) => void
  onAskHost: (name: string) => void
}) {
  const [navn, setNavn] = useState('')
  const skrevet = navn.trim()
  const opptatt = roster.some(
    (slot) => slot.name.toLowerCase() === skrevet.toLowerCase(),
  )

  if (venterPåVert) {
    return (
      <main className="grid min-h-dvh place-items-center px-6 text-center">
        <div>
          <h1 className="text-3xl font-black">Spør verten…</h1>
          <p className="mt-3 text-lg text-tekst-svak">
            {venterPåVert} er allerede med. Verten må slippe deg inn fra denne
            telefonen.
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 py-10 text-center">
      <h1 className="text-4xl font-black">Hva heter du?</h1>
      <p className="mt-2 mb-8 text-lg text-tekst-svak">
        Skriv navnet ditt for å bli med i rom {code}
      </p>

      <input
        value={navn}
        onChange={(event) => setNavn(event.target.value.slice(0, 12))}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && skrevet && !opptatt) onJoin(skrevet)
        }}
        autoFocus
        autoCapitalize="words"
        autoCorrect="off"
        spellCheck={false}
        aria-label="Navnet ditt"
        placeholder="Navnet ditt"
        className="flate w-full py-5 text-center text-4xl font-black text-sol placeholder:text-kant focus:border-lilla focus:outline-none"
      />

      {roster.length > 0 && (
        <p className="mt-4 text-base text-tekst-svak">
          Med fra før: {roster.map((slot) => slot.name).join(', ')}
        </p>
      )}

      {opptatt ? (
        <>
          <p className="mt-8 text-lg font-bold text-sol">
            {skrevet} er allerede med.
          </p>
          <Button
            size="stor"
            className="mt-3 w-full"
            disabled={busy}
            onClick={() => onAskHost(skrevet)}
          >
            Det er meg — spør verten
          </Button>
        </>
      ) : (
        <Button
          size="stor"
          tone="turkis"
          className="mt-8 w-full"
          disabled={busy || skrevet.length === 0}
          onClick={() => onJoin(skrevet)}
        >
          Bli med
        </Button>
      )}

      {error && (
        <p role="alert" className="mt-6 text-lg font-bold text-bringebaer">
          {error}
        </p>
      )}
    </main>
  )
}

function allReady(roster: RosterEntry[]): boolean {
  const joined = roster.filter((slot) => slot.connected)
  return joined.length > 0 && joined.every((slot) => slot.ready)
}

function Enkel({
  tittel,
  under,
  lenke,
  lenketekst,
}: {
  tittel: string
  under?: string
  lenke?: string
  lenketekst?: string
}) {
  return (
    <main className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <h1 className="text-3xl font-black">{tittel}</h1>
        {under && <p className="mt-3 text-lg text-tekst-svak">{under}</p>}
        {lenke && (
          <Link
            href={lenke}
            className="mt-6 inline-block text-lg font-bold text-sol underline decoration-2 underline-offset-4"
          >
            {lenketekst}
          </Link>
        )}
      </div>
    </main>
  )
}

/**
 * Hvor mye spilleren får. I formater som selges i ark er det arket som er
 * enheten — «Ett ark, seks brett» sier mer enn «seks brett», fordi det er
 * arket som lover at alle tallene er med.
 */
function beskrivBrett(config: ConfigSummary): string {
  if (!config.stripSize) {
    return config.boardsPerPlayer === 1 ? 'Ett brett' : `${config.boardsPerPlayer} brett`
  }
  const brett = config.boardsPerPlayer * config.stripSize
  return config.boardsPerPlayer === 1
    ? `Ett ark, ${brett} brett`
    : `${config.boardsPerPlayer} ark, ${brett} brett`
}
