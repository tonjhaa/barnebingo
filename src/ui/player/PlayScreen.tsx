'use client'

import { useState } from 'react'
import type { BoardView, PlayerView, RoundView } from '@/shared/protocol'
import { Avatar } from '@/ui/shared/Avatar'
import { BoardGrid } from '@/ui/shared/BoardGrid'

/**
 * Telefonen under spill. Prioriteringen nedenfra og opp: brettet er det
 * viktigste og får mest plass, tallet som nettopp ble trukket står rett over,
 * og BINGO-knappen ligger nederst der tommelen er.
 */
export function PlayScreen({
  view,
  round,
  markingMode,
  onSelectBoard,
  onToggleCell,
  onClaimBingo,
}: {
  view: PlayerView
  round: RoundView
  markingMode: string
  onSelectBoard: (boardId: string) => void
  onToggleCell: (boardId: string, value: number, marked: boolean) => Promise<string | null>
  onClaimBingo: () => Promise<string | null>
}) {
  const [rejected, setRejected] = useState<number | null>(null)
  const [beskjed, setBeskjed] = useState<string | null>(null)
  const me = view.me

  if (!me) return null
  if (view.results) return <Resultat view={view} />
  if (round.prize) return <PremieVisning view={view} round={round} />

  const active =
    view.boards.find((board) => board.id === view.activeBoardId) ?? view.boards[0]
  const flere = view.boards.length > 1
  const kanMarkere = markingMode !== 'auto' && round.status === 'active'

  /**
   * Assistert markering (§7): ruta med det trukne tallet lyser til den er
   * krysset av. Hintet er et eget hjelpemiddel — det markerer ikke for deg.
   */
  const hint =
    markingMode === 'assisted' &&
    round.status === 'active' &&
    round.currentNumber !== null &&
    active?.cells
      .flat()
      .some((cell) => cell.value === round.currentNumber && !cell.marked)
      ? round.currentNumber
      : null

  async function toggle(value: number, marked: boolean) {
    if (!active) return
    const feil = await onToggleCell(active.id, value, marked)
    if (!feil) return
    // Ingen feilmelding for et tall som ikke er trukket — bare en liten risting,
    // så er det glemt (ARKITEKTUR.md §9 Å3).
    setRejected(value)
    setTimeout(() => setRejected(null), 400)
  }

  async function bingo() {
    const feil = await onClaimBingo()
    setBeskjed(feil ?? 'BINGO! Vi sjekker brettet ditt…')
    setTimeout(() => setBeskjed(null), 4000)
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-3 px-4 py-4">
      <header className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-bold tracking-widest text-tekst-svak uppercase">
          Vi spiller om
        </p>
        <p className="text-lg font-black text-turkis">{round.stageLabel}</p>
      </header>

      {round.currentNumber !== null && (
        <div className="flate flex items-center justify-between gap-4 px-5 py-3">
          <span className="text-base font-bold text-tekst-svak">Nå trukket</span>
          <span className="flex items-baseline gap-2 leading-none">
            {round.currentLetter && (
              <span className="text-3xl font-black text-bringebaer">
                {round.currentLetter}
              </span>
            )}
            <span className="text-5xl font-black text-sol tabular-nums">
              {round.currentNumber}
            </span>
          </span>
        </div>
      )}

      {flere && (
        <div role="tablist" aria-label="Brettene dine" className="flex gap-2">
          {view.boards.map((board) => (
            <BoardTab
              key={board.id}
              board={board}
              color={me.color}
              active={board.id === active?.id}
              onSelect={() => onSelectBoard(board.id)}
            />
          ))}
        </div>
      )}

      {active && (
        <div className="flex flex-1 items-center">
          <div className="flate w-full p-3">
            <BoardGrid
              board={active}
              color={me.color}
              columnLabels={view.config.columnLabels}
              onToggle={kanMarkere ? toggle : undefined}
              rejected={rejected}
              hint={hint}
            />
          </div>
        </div>
      )}

      <p className="text-center text-sm text-tekst-svak tabular-nums">
        {active
          ? `${active.markedCount} av ${active.numberCount} · ${active.completedRows.length} hele rader`
          : ''}
      </p>

      {beskjed && (
        <p
          role="status"
          className="rounded-2xl bg-flate-2 px-4 py-3 text-center text-lg font-bold"
        >
          {beskjed}
        </p>
      )}

      <Bunn round={round} bingoHint={view.bingoHint} onBingo={bingo} />
    </main>
  )
}

function Bunn({
  round,
  bingoHint,
  onBingo,
}: {
  round: RoundView
  bingoHint: boolean
  onBingo: () => void
}) {
  if (round.status === 'paused') {
    return (
      <p className="py-4 text-center text-xl font-black text-bringebaer">
        Spillet står på pause
      </p>
    )
  }
  if (round.status === 'finished') {
    return (
      <p className="py-4 text-center text-xl font-black text-tekst-svak">
        Runden er ferdig
      </p>
    )
  }
  if (round.status === 'validatingBingo') {
    return (
      <p className="py-4 text-center text-xl font-black text-sol">Kontrollerer bingo…</p>
    )
  }
  if (round.hostAway) {
    return (
      <p className="py-4 text-center text-lg font-bold text-tekst-svak">
        Venter på hovedskjermen…
      </p>
    )
  }

  return (
    <button
      onClick={onBingo}
      className={`w-full rounded-3xl bg-sol py-6 text-4xl font-black tracking-wide text-natt transition-transform active:scale-[0.97] ${
        bingoHint ? 'lyser' : ''
      }`}
    >
      BINGO!
    </button>
  )
}

/** Sluttbildet på telefonen (§16). Kort og enkelt: hvem vant hva i kveld. */
function Resultat({ view }: { view: PlayerView }) {
  const results = view.results!
  const meg = view.me
  const mine = results.standings.find((s) => s.name === meg?.name)?.prizes ?? 0

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 px-6 text-center">
      <p className="text-lg font-bold tracking-widest text-tekst-svak uppercase">
        Runden er ferdig
      </p>

      {meg && (
        <>
          <Avatar
            name={meg.name}
            color={meg.color}
            avatarId={meg.avatarId}
            selfieUrl={meg.selfieUrl}
            size={120}
          />
          <p className="text-3xl font-black" style={{ color: meg.color }}>
            {mine === 0
              ? 'Ingen premie denne gangen'
              : mine === 1
                ? 'Du vant én premie!'
                : `Du vant ${mine} premier!`}
          </p>
        </>
      )}

      <div className="flate w-full p-5">
        <p className="mb-3 text-sm font-bold tracking-widest text-tekst-svak uppercase">
          Premier i kveld
        </p>
        <ul className="flex flex-col gap-2">
          {results.standings.map((spiller) => (
            <li key={spiller.name} className="flex items-center justify-between gap-3">
              <span className="text-xl font-bold">{spiller.name}</span>
              <span
                className="text-xl font-black tabular-nums"
                style={{ color: spiller.color }}
              >
                {spiller.prizes}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-lg text-tekst-svak">Vent på verten hvis dere skal spille en til.</p>
    </main>
  )
}

/** Premievisningen på telefonen. Alle ser hvem som vant, også de som ikke gjorde det. */
function PremieVisning({ view, round }: { view: PlayerView; round: RoundView }) {
  const prize = round.prize!
  const jeg = view.me
  const jegVant = prize.winners.some((winner) => winner.playerId === jeg?.playerId)

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 px-6 text-center">
      <p className="text-xl font-bold text-tekst-svak">{prize.stageLabel}</p>

      <div className="flex flex-wrap justify-center gap-5">
        {prize.winners.map((winner) => (
          <div key={winner.playerId} className="flex flex-col items-center gap-2">
            <Avatar
              name={winner.name}
              color={winner.color}
              avatarId={winner.avatarId}
              selfieUrl={winner.selfieUrl}
              size={110}
            />
            <p className="text-3xl font-black" style={{ color: winner.color }}>
              {winner.name}
            </p>
          </div>
        ))}
      </div>

      <p className="text-4xl leading-tight font-black">
        {jegVant ? 'Du vant! 🎉' : `${vinnernavn(prize.winners)} vant`}
      </p>

      {prize.alsoHadBingo.length > 0 && (
        <p className="text-lg text-tekst-svak">
          {prize.alsoHadBingo.join(' og ')} hadde også bingo
        </p>
      )}

      <p className="text-xl text-tekst-svak">
        {prize.isFinalStage
          ? 'Det var siste premie!'
          : `Nå spiller vi om ${prize.nextStageLabel?.toLowerCase()}`}
      </p>
    </main>
  )
}

function vinnernavn(winners: Array<{ name: string }>): string {
  if (winners.length === 1) return winners[0].name
  return `${winners.slice(0, -1).map((w) => w.name).join(', ')} og ${winners.at(-1)?.name}`
}

/**
 * Fanen for et brett viser status også når brettet ikke er åpent — hvor mange
 * kryss og hvor mange hele rader (§5). Da slipper spilleren å bla fram og
 * tilbake for å vite hvilket brett som er nærmest.
 */
function BoardTab({
  board,
  color,
  active,
  onSelect,
}: {
  board: BoardView
  color: string
  active: boolean
  onSelect: () => void
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onSelect}
      className={`flex-1 rounded-2xl border-2 px-2 py-2.5 text-center transition-colors ${
        active ? 'bg-flate-2' : 'border-kant bg-natt'
      }`}
      style={active ? { borderColor: color } : undefined}
    >
      <span className="block text-base font-black">Brett {board.index}</span>
      <span className="block text-xs text-tekst-svak tabular-nums">
        {board.markedCount} kryss · {board.completedRows.length} rader
      </span>
    </button>
  )
}
