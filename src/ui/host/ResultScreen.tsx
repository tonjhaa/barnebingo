'use client'

import type { ResultsView } from '@/shared/protocol'
import { Avatar } from '@/ui/shared/Avatar'
import { Button } from '@/ui/shared/Button'

/**
 * Sluttbildet på hovedskjermen (§15). Runden er over, premiene er delt ut, og
 * spørsmålet er bare ett: skal vi spille en til?
 */
export function ResultScreen({
  results,
  onNewRound,
  onChangeRules,
}: {
  results: ResultsView
  onNewRound: () => void
  onChangeRules: () => void
}) {
  const ingenVant = results.stages.length === 0

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-10 text-center">
      <div>
        <p className="text-xl font-bold tracking-[0.3em] text-tekst-svak uppercase">
          {results.roundsPlayed === 1
            ? 'Runden er ferdig'
            : `Runde ${results.roundsPlayed} er ferdig`}
        </p>
        <h2 className="mt-2 text-[clamp(3rem,7vw,6rem)] leading-none font-black text-sol">
          {ingenVant ? 'Ingen fikk bingo' : 'Takk for spillet!'}
        </h2>
      </div>

      {!ingenVant && (
        <div className="flex flex-wrap justify-center gap-6">
          {results.stages.map((stage) => (
            <div key={stage.stageLabel} className="flate min-w-[260px] p-6">
              <p className="mb-4 text-lg font-bold tracking-widest text-tekst-svak uppercase">
                {stage.stageLabel}
              </p>
              <div className="flex flex-wrap justify-center gap-4">
                {stage.winners.map((winner) => (
                  <div key={winner.name} className="flex flex-col items-center gap-2">
                    <Avatar
                      name={winner.name}
                      color={winner.color}
                      avatarId={winner.avatarId}
                      selfieUrl={winner.selfieUrl}
                      size={96}
                    />
                    <p className="text-2xl font-black" style={{ color: winner.color }}>
                      {winner.name}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Premiene telles gjennom hele kvelden, ikke bare denne runden. */}
      {results.standings.length > 0 && (
        <div className="flate w-full max-w-3xl p-6">
          <p className="mb-4 text-lg font-bold tracking-widest text-tekst-svak uppercase">
            Premier i kveld
          </p>
          <ul className="flex flex-wrap justify-center gap-x-10 gap-y-4">
            {results.standings.map((spiller) => (
              <li key={spiller.name} className="flex items-center gap-3">
                <Avatar
                  name={spiller.name}
                  color={spiller.color}
                  avatarId={spiller.avatarId}
                  selfieUrl={spiller.selfieUrl}
                  size={52}
                />
                <span className="text-2xl font-black">{spiller.name}</span>
                <span
                  className="text-2xl font-black tabular-nums"
                  style={{ color: spiller.color }}
                >
                  {spiller.prizes}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-center gap-4">
        <Button size="stor" tone="turkis" onClick={onNewRound}>
          Spill en runde til
        </Button>
        <Button size="vanlig" tone="stille" onClick={onChangeRules}>
          Endre reglene først
        </Button>
      </div>

      <p className="max-w-xl text-lg text-tekst-svak">
        Alle beholder plassen, bildet og premiene sine. Dere får nye brett.
      </p>
    </div>
  )
}
