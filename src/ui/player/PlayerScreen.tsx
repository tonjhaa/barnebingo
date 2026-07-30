'use client'

import Link from 'next/link'
import type { RosterEntry } from '@/shared/protocol'
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
    setActiveBoard,
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
        onSelectBoard={(boardId) => void setActiveBoard(boardId)}
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
      <main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 py-8">
        <h1 className="text-center text-4xl font-black">Hvem er du?</h1>
        <p className="mt-2 mb-8 text-center text-lg text-tekst-svak">
          Trykk på navnet ditt for å bli med i rom {code}
        </p>

        <div className="flex flex-col gap-3">
          {roster.map((slot) => (
            <NavneValg
              key={slot.name}
              slot={slot}
              disabled={busy}
              venter={venterPåVert === slot.name}
              onClick={() => (slot.claimed ? bePlassen(slot.name) : claim(slot.name))}
            />
          ))}
        </div>

        {venterPåVert && (
          <p role="status" className="mt-6 text-center text-lg font-bold text-sol">
            Spør verten om å slippe deg inn…
          </p>
        )}

        {error && (
          <p role="alert" className="mt-6 text-center text-lg font-bold text-bringebaer">
            {error}
          </p>
        )}
      </main>
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
          {config.boardsPerPlayer === 1
            ? 'Ett brett'
            : `${config.boardsPerPlayer} brett`}{' '}
          · {config.markingLabel.toLowerCase()}
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
 * En opptatt plass er ikke låst — den krever bare at verten sier ja (§23). Det
 * er veien tilbake for telefonen som døde for godt eller ble tømt.
 */
function NavneValg({
  slot,
  disabled,
  venter,
  onClick,
}: {
  slot: RosterEntry
  disabled: boolean
  venter: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || venter}
      className="flate flex items-center gap-4 p-4 text-left transition-[transform,border-color] active:scale-[0.98] disabled:active:scale-100"
      style={{ borderColor: venter ? '#ffd23f' : slot.claimed ? undefined : slot.color }}
    >
      <Avatar
        name={slot.name}
        color={slot.color}
        avatarId={slot.avatarId}
        selfieUrl={slot.selfieUrl}
        size={64}
        dimmed={slot.claimed && !venter}
      />
      <span className="flex-1">
        <span className="block text-3xl font-black">{slot.name}</span>
        <span className="block text-base text-tekst-svak">
          {venter
            ? 'Venter på verten…'
            : slot.claimed
              ? 'Opptatt — trykk om det er deg'
              : 'Ledig'}
        </span>
      </span>
    </button>
  )
}

function allReady(roster: RosterEntry[]): boolean {
  const joined = roster.filter((slot) => slot.claimed && slot.connected)
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
