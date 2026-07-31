'use client'

import { useCallback, useEffect, useState } from 'react'
import type { HostView, PrizeResultView, RosterEntry, RoundView } from '@/shared/protocol'
import { Avatar } from '@/ui/shared/Avatar'
import { BingoBall } from '@/ui/shared/BingoBall'
import { Button } from '@/ui/shared/Button'
import type { Lydinnstillinger } from '@/domain/audio/settings'
import { useLyd } from '@/ui/audio/useLyd'
import { LydPanel } from './LydPanel'

/**
 * Hovedskjermen under spill. Alt er skalert for en TV sett fra sofaen: det
 * trukne tallet er det største på skjermen, og resten er støtte rundt det.
 */
export function GameScreen({
  view,
  round,
  onDraw,
  onPause,
  onResume,
  onAdvancePrize,
  lyd,
  onLyd,
}: {
  view: HostView
  round: RoundView
  onDraw: () => void
  onPause: () => void
  onResume: () => void
  onAdvancePrize: () => void
  lyd: Lydinnstillinger
  onLyd: (neste: Lydinnstillinger) => void
}) {
  const paused = round.status === 'paused'
  const finished = round.status === 'finished'
  const ready = useAutoDrawCountdown(round)
  const [panelÅpent, setPanelÅpent] = useState(false)

  // Serveren vet hvilke navn som har lydklipp. Programlederen sier bare navn
  // den faktisk kan uttale, og formulerer seg navnefritt ellers.
  const harNavn = useCallback(
    (navn: string) => !view.namesWithoutVoice.includes(navn),
    [view.namesWithoutVoice],
  )

  /**
   * Er noen nær bingo? Da skal programlederen holde seg til tallene. Én rad
   * unna er nok til at spenningen har tatt over i stua.
   */
  const spent = view.roster.some(
    (slot) => (slot.progress?.bestCompletedRows ?? 0) >= round.stageIndex + 1,
  )

  const { undertekst, låsOpp, testStemme } = useLyd(lyd, view.events, view.eventSeq, {
    harNavn,
    spent,
  })

  /** Alle vertsknapper låser opp stemmen — nettleseren krever et brukertrykk. */
  const medLyd = (handling: () => void) => () => {
    låsOpp()
    handling()
  }

  if (round.prize) {
    return (
      <>
        <PremieVisning prize={round.prize} onNext={medLyd(onAdvancePrize)} />
        <Undertekst tekst={undertekst} />
      </>
    )
  }

  return (
    <div className="grid flex-1 gap-10 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <section className="flex flex-col items-center justify-center gap-8 text-center">
        <StageBanner round={round} />

        {/* Kula er kveldens midtpunkt og får stå alene, uten kasse rundt. */}
        <div className="grid w-full place-items-center" style={{ minHeight: '46vh' }}>
          {round.currentNumber === null ? (
            <p className="font-[family-name:var(--font-stemme)] text-4xl font-semibold text-tekst-svak">
              {finished ? 'Alle tallene er trukket' : 'Klar for første tall'}
            </p>
          ) : (
            <BingoBall
              number={round.currentNumber}
              letter={round.currentLetter}
              column={round.currentColumn}
              dropKey={round.drawnCount}
            />
          )}
        </div>

        <div className="w-full">
          <p className="mb-3 text-lg font-bold tracking-widest text-tekst-svak uppercase">
            Tidligere tall
          </p>
          {round.previousNumbers.length === 0 ? (
            <p className="text-xl text-tekst-svak">Ingen ennå</p>
          ) : (
            <ol className="flex flex-wrap justify-center gap-2">
              {round.previousNumbers.map((n) => (
                <li
                  key={n}
                  className="grid h-11 w-11 place-items-center rounded-full bg-flate font-[family-name:var(--font-tall)] text-lg font-extrabold tabular-nums text-tekst-svak"
                  style={{ boxShadow: 'inset -2px -3px 6px rgb(0 0 0 / .3)' }}
                >
                  {n}
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>

      {/* Begge kolonnene sentreres vertikalt. Med bare én spiller ble høyre side
          ellers stående med et stort tomrom midt på TV-skjermen. */}
      <aside className="flex flex-col justify-center gap-6">
        <div className="grid gap-4 sm:grid-cols-2">
          {view.roster.map((slot) => (
            <SpillerStatus key={slot.name} slot={slot} />
          ))}
        </div>

        <div className="flate flex flex-col gap-4 p-6">
          <div className="flex items-center justify-between gap-4">
            <p className="text-xl font-bold text-tekst-svak tabular-nums">
              {round.drawnCount} av {round.totalNumbers} trukket
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  låsOpp()
                  onLyd({ ...lyd, på: !lyd.på })
                }}
                aria-label={lyd.på ? 'Slå av lyd' : 'Slå på lyd'}
                aria-pressed={lyd.på}
                className="rounded-xl px-3 py-2 text-2xl transition-opacity"
                style={{ opacity: lyd.på ? 1 : 0.4 }}
              >
                {lyd.på ? '🔊' : '🔇'}
              </button>
              <button
                onClick={() => {
                  låsOpp()
                  setPanelÅpent((åpent) => !åpent)
                }}
                aria-label="Lydinnstillinger"
                aria-expanded={panelÅpent}
                className="rounded-xl px-3 py-2 text-xl text-tekst-svak"
              >
                ⚙︎
              </button>
            </div>
          </div>

          {panelÅpent && (
            <div className="rounded-2xl bg-flate-2 p-5">
              <LydPanel
                verdi={lyd}
                onEndre={onLyd}
                onTest={testStemme}
                kanLeseNavn={view.namesWithoutVoice.length < view.roster.length}
              />
            </div>
          )}

          {!finished && (
            <>
              <Button
                size="stor"
                onClick={medLyd(onDraw)}
                disabled={paused}
                className={ready ? 'animate-pulse' : ''}
              >
                Trekk neste tall
              </Button>

              {round.drawMode !== 'manual' && (
                <Button
                  tone="stille"
                  onClick={medLyd(paused ? onResume : onPause)}
                  className="w-full"
                >
                  {paused ? 'Fortsett' : 'Pause'}
                </Button>
              )}
            </>
          )}

          {paused && (
            <p className="text-center text-xl font-black text-bringebaer">På pause</p>
          )}
        </div>
      </aside>

      <Undertekst tekst={undertekst} />
    </div>
  )
}

/**
 * Det programlederen sier, skrevet ut.
 *
 * Lyd er et hjelpemiddel, aldri eneste informasjonskilde (§13). Teksten gjør
 * også utviklingsarbeid mulig før lydfilene er generert, og den hjelper den
 * som hører dårlig eller sitter i et rom med annen lyd på.
 */
function Undertekst({ tekst }: { tekst: string | null }) {
  if (!tekst) return null
  return (
    <p
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-6 z-20 mx-auto max-w-4xl px-6 text-center text-2xl font-semibold text-tekst-svak"
    >
      {tekst}
    </p>
  )
}

/**
 * Premievisningen. Spillet står stille her til verten trykker videre — det er
 * øyeblikket der en faktisk premie deles ut i stua, og det skal ikke ha en
 * timer på seg.
 */
function PremieVisning({
  prize,
  onNext,
}: {
  prize: PrizeResultView
  onNext: () => void
}) {
  return (
    <div className="grid flex-1 place-items-center text-center">
      <div className="flex flex-col items-center gap-8">
        <p className="text-2xl font-bold tracking-widest text-tekst-svak uppercase">
          {prize.stageLabel}
        </p>

        <div className="flex flex-wrap justify-center gap-10">
          {prize.winners.map((winner) => (
            <div key={winner.playerId} className="flex flex-col items-center gap-3">
              <Avatar
                name={winner.name}
                color={winner.color}
                avatarId={winner.avatarId}
                selfieUrl={winner.selfieUrl}
                size={200}
              />
              <p
                className="text-[clamp(2.5rem,5vw,4.5rem)] leading-none font-black"
                style={{ color: winner.color }}
              >
                {winner.name}
              </p>
              <p className="text-xl text-tekst-svak">
                Brett {winner.boardIndex} · {tekstOmRader(winner.completedRows.length)}
              </p>
            </div>
          ))}
        </div>

        <p className="text-[clamp(2rem,4vw,3.5rem)] font-black text-sol">har bingo!</p>

        {prize.alsoHadBingo.length > 0 && (
          <p className="text-2xl text-tekst-svak">
            {prize.alsoHadBingo.join(' og ')} hadde også bingo
          </p>
        )}

        {prize.lockoutIgnored && (
          <p className="max-w-2xl text-xl text-tekst-svak">
            Alle som hadde bingo hadde vunnet før, så regelen om én premie per
            spiller ble satt til side for dette stadiet.
          </p>
        )}

        {prize.isFinalStage ? (
          <p className="text-3xl font-bold text-tekst-svak">Det var siste premie!</p>
        ) : (
          <>
            <p className="text-3xl font-bold text-tekst-svak">
              Nå spiller vi om{' '}
              <span className="text-turkis">{prize.nextStageLabel?.toLowerCase()}</span>
            </p>
            <Button size="stor" tone="turkis" onClick={onNext}>
              Fortsett spillet
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

function tall(antall: number, entall: string, flertall: string): string {
  return `${antall} ${antall === 1 ? entall : flertall}`
}

function tekstOmRader(antall: number): string {
  if (antall === 0) return 'ingen hele rader'
  return antall === 1 ? '1 hel rad' : `${antall} hele rader`
}

function StageBanner({ round }: { round: RoundView }) {
  return (
    <div>
      <p className="text-lg font-bold tracking-widest text-tekst-svak uppercase">
        Premie {round.stageIndex + 1} av {round.stageCount}
      </p>
      <p className="text-[clamp(2rem,4vw,3.5rem)] leading-tight font-black">
        Vi spiller om <span className="text-turkis">{round.stageLabel}</span>
      </p>
    </div>
  )
}

function SpillerStatus({ slot }: { slot: RosterEntry }) {
  return (
    <div
      className="flate flex items-center gap-3 p-4"
      style={{ borderColor: slot.connected ? slot.color : undefined }}
    >
      <Avatar
        name={slot.name}
        color={slot.color}
        avatarId={slot.avatarId}
        selfieUrl={slot.selfieUrl}
        size={56}
        dimmed={!slot.connected}
      />
      <div className="min-w-0">
        <p className="truncate text-xl font-black">{slot.name}</p>
        <p className="text-base text-tekst-svak tabular-nums">
          {!slot.connected
            ? 'Frakoblet'
            : slot.progress
              ? [
                  `${slot.progress.markedCount} kryss`,
                  tekstOmRader(slot.progress.bestCompletedRows),
                  ...(slot.progress.prizes > 0
                    ? [tall(slot.progress.prizes, 'premie', 'premier')]
                    : []),
                ].join(' · ')
              : '—'}
        </p>
      </div>
    </div>
  )
}

/**
 * Sier fra når det er tid for neste tall i modusen «automatisk med bekreftelse».
 * Nedtellingen skjer lokalt fra tidspunktet for forrige trekk, så serveren
 * slipper å sende et tikk i sekundet til en skjerm som bare venter.
 */
function useAutoDrawCountdown(round: RoundView): boolean {
  const venter = round.drawMode === 'autoConfirm' && round.status === 'active'
  const [now, setNow] = useState(0)

  useEffect(() => {
    if (!venter) return
    const timer = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(timer)
  }, [venter])

  if (!venter) return false
  if (round.lastDrawAt === null) return true
  return now >= round.lastDrawAt + round.drawIntervalMs
}
