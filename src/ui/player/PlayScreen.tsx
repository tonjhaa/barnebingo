'use client'

import { useState } from 'react'
import type { BoardView, PlayerView, RoundView } from '@/shared/protocol'
import { Avatar } from '@/ui/shared/Avatar'
import { BingoBall } from '@/ui/shared/BingoBall'
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
  onToggleCell,
  onClaimBingo,
}: {
  view: PlayerView
  round: RoundView
  markingMode: string
  onToggleCell: (boardId: string, value: number, marked: boolean) => Promise<string | null>
  onClaimBingo: () => Promise<string | null>
}) {
  const [rejected, setRejected] = useState<number | null>(null)
  const [beskjed, setBeskjed] = useState<string | null>(null)
  const me = view.me

  if (!me) return null
  if (view.results) return <Resultat view={view} />
  if (round.prize) return <PremieVisning view={view} round={round} />

  const flere = view.boards.length > 1
  const kanMarkere = markingMode !== 'auto' && round.status === 'active'
  // Brett fra samme ark hører sammen og tegnes som én blokk, med rissene
  // imellom slik man river dem fra hverandre på papir.
  const strimmel = Boolean(view.config.stripSize)

  /**
   * Brettene gruppert i ark. Uten grupperingen ville atten brett sett ut som
   * atten løse brett, og spilleren mistet det som gjør arket til et ark:
   * at de seks til sammen har alle tallene.
   */
  const ark: BoardView[][] = strimmel
    ? view.boards.reduce<BoardView[][]>((grupper, board) => {
        const nr = (board.sheet ?? 1) - 1
        ;(grupper[nr] ??= []).push(board)
        return grupper
      }, [])
    : [view.boards]

  /**
   * Assistert markering (§7): ruta med det trukne tallet lyser til den er
   * krysset av. Regnes per brett — samme tall kan stå på flere av dem.
   */
  const hintFor = (board: BoardView): number | null =>
    markingMode === 'assisted' &&
    round.status === 'active' &&
    round.currentNumber !== null &&
    board.cells.flat().some((cell) => cell.value === round.currentNumber && !cell.marked)
      ? round.currentNumber
      : null

  async function toggle(boardId: string, value: number, marked: boolean) {
    const feil = await onToggleCell(boardId, value, marked)
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
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-4 pb-4">
      {/* Premiemålet er bakgrunnsinformasjon og får scrolle vekk. Tallet er
          det man leter etter, og blir stående. */}
      <header className="flex items-baseline justify-between gap-3 pt-4 pb-3">
        <p className="text-sm font-bold tracking-widest text-tekst-svak uppercase">
          Vi spiller om
        </p>
        <p className="text-lg font-black text-turkis">{round.stageLabel}</p>
      </header>

      {round.currentNumber !== null && (
        <div className="sticky top-0 z-10 -mx-4 bg-natt px-4 pb-3">
          <div className="flate flex items-center justify-between gap-4 px-5 py-3">
            <span className="text-base font-semibold text-tekst-svak">Nå trukket</span>
            <BingoBall
              number={round.currentNumber}
              letter={round.currentLetter}
              column={round.currentColumn}
              size="liten"
              dropKey={round.drawnCount}
            />
          </div>
        </div>
      )}

      {/* Alle brettene under hverandre. Å bla mellom faner betyr å lete etter
          tallet flere ganger; her ser man dem i én bevegelse. */}
      <div className="flex flex-1 flex-col justify-center gap-4 py-2">
        {ark.map((brett, arkNr) => (
          <div key={arkNr} className={strimmel ? 'flate overflow-hidden p-0' : 'contents'}>
            {/* Arkets overskrift står bare når det er flere enn ett. Med ett
                ark er «Ark 1 av 1» bare støy over brettene. */}
            {strimmel && ark.length > 1 && (
              <p
                className="px-3 pt-3 pb-1 text-sm font-black tracking-widest uppercase"
                style={{ color: me.color }}
              >
                Ark {arkNr + 1} av {ark.length}
              </p>
            )}

            {brett.map((board, i) => (
              <section
                key={board.id}
                className={strimmel ? 'px-3 pt-2 pb-3' : 'flate p-3'}
                style={
                  strimmel && i > 0
                    ? { borderTop: '2px dashed rgb(255 255 255 / .14)' }
                    : undefined
                }
              >
                {flere && (
                  <header className="mb-2 flex items-baseline justify-between px-1">
                    <span className="text-sm font-black" style={{ color: me.color }}>
                      Brett {board.indexOnSheet ?? board.index}
                      {strimmel && view.config.stripSize
                        ? ` av ${view.config.stripSize}`
                        : ''}
                    </span>
                    <span className="text-xs text-tekst-svak tabular-nums">
                      {board.markedCount} av {board.numberCount} ·{' '}
                      {board.completedRows.length} rader
                    </span>
                  </header>
                )}
                <BoardGrid
                  board={board}
                  color={me.color}
                  columnLabels={view.config.columnLabels}
                  onToggle={
                    kanMarkere
                      ? (value, marked) => toggle(board.id, value, marked)
                      : undefined
                  }
                  rejected={rejected}
                  hint={hintFor(board)}
                />
              </section>
            ))}
          </div>
        ))}

        {!flere && view.boards[0] && (
          <p className="mt-2 text-center text-sm text-tekst-svak tabular-nums">
            {view.boards[0].markedCount} av {view.boards[0].numberCount} ·{' '}
            {view.boards[0].completedRows.length} hele rader
          </p>
        )}

        {/* Et helt ark har hvert tall ett sted. Det er verdt å si, for det er
            nettopp den beskjeden som får en til å lete videre nedover. */}
        {strimmel && (
          <p className="text-center text-xs text-tekst-svak">
            {ark.length === 1
              ? 'Hvert tall står ett sted på arket.'
              : `${ark.length} ark — hvert tall står ett sted på hvert av dem.`}
          </p>
        )}
      </div>

      {beskjed && (
        <p
          role="status"
          className="mb-2 rounded-2xl bg-flate-2 px-4 py-3 text-center text-lg font-bold"
        >
          {beskjed}
        </p>
      )}

      <div className="sticky bottom-0 -mx-4 bg-natt px-4 pt-2 pb-1">
        <Bunn round={round} bingoHint={view.bingoHint} onBingo={bingo} />
      </div>
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
  if (round.hostAway) {
    return (
      <p className="py-4 text-center text-lg font-bold text-tekst-svak">
        Venter på hovedskjermen…
      </p>
    )
  }

  /**
   * Knappen byttes aldri ut mens en bingo kontrolleres — den bare endrer tekst.
   *
   * Det er hele poenget med bingovinduet (§9 K5): to barn roper omtrent
   * samtidig, og den som er et halvsekund treg skal likevel bli med. Erstattet
   * vi knappen med en beskjed i det øyeblikket den første ropte, ville det
   * andre trykket landet på et element som akkurat forsvant — og barnet ville
   * stått igjen med at «jeg trykket jo».
   */
  const kontrollerer = round.status === 'validatingBingo'

  return (
    <button
      onClick={onBingo}
      className={`w-full rounded-3xl py-6 text-4xl font-black tracking-wide transition-colors ${
        kontrollerer
          ? 'bg-flate-2 text-sol'
          : `bg-sol text-natt transition-transform active:scale-[0.97] ${bingoHint ? 'lyser' : ''}`
      }`}
    >
      {kontrollerer ? 'Kontrollerer bingo…' : 'BINGO!'}
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

