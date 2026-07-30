'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { ConfigInput } from '@/domain/formats/types'
import type { ConfigSummary, HostView, RosterEntry } from '@/shared/protocol'
import { Avatar } from '@/ui/shared/Avatar'
import { Button } from '@/ui/shared/Button'
import { ConfigPanel } from './ConfigPanel'
import { GameScreen } from './GameScreen'
import { QrCode } from './QrCode'
import { ResultScreen } from './ResultScreen'
import { useHostRoom } from './useHostRoom'

export function HostScreen({ roomId }: { roomId: string }) {
  const {
    view,
    status,
    error,
    openLobby,
    updateConfig,
    startGame,
    drawNext,
    pause,
    resumeGame,
    advancePrize,
    newRound,
    approveTakeover,
    denyTakeover,
    closeRoom,
  } = useHostRoom(roomId)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<ConfigInput | null>(null)

  if (status === 'utenTilgang') return <Beskjed tittel="Dette er ikke ditt rom" lenke />
  if (status === 'avsluttet') return <Beskjed tittel="Spillrommet er avsluttet" lenke />
  if (!view) return <Beskjed tittel="Kobler til spillet…" />

  const settingUp = view.status === 'configuring'
  // Utkastet er sannheten mens verten skrur; serverens versjon tar over igjen
  // så snart panelet lukkes. Bare én vert finnes, så de kan ikke komme i konflikt.
  const config = draft ?? view.configInput

  const changeConfig = (next: ConfigInput) => {
    setDraft(next)
    void updateConfig(next)
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-[1600px] flex-col gap-8 px-8 py-8">
      <header className="flex items-baseline justify-between gap-6">
        <h1 className="text-4xl font-black tracking-tight">
          <span className="text-sol">Barne</span>
          <span className="text-bringebaer">bingo</span>
        </h1>
        <div className="flex items-center gap-6">
          <StatusPrikk tilkoblet={status === 'tilkoblet'} />
          <button
            onClick={closeRoom}
            className="text-lg font-bold text-tekst-svak underline decoration-2 underline-offset-4 hover:text-bringebaer"
          >
            Avslutt rommet
          </button>
        </div>
      </header>

      {view.takeoverRequests.length > 0 && (
        <section className="flex flex-col gap-3">
          {view.takeoverRequests.map((forespørsel) => (
            <div
              key={forespørsel.name}
              className="flate flex flex-wrap items-center justify-between gap-4 p-5"
              style={{ borderColor: forespørsel.color }}
            >
              <div className="flex items-center gap-4">
                <Avatar
                  name={forespørsel.name}
                  color={forespørsel.color}
                  avatarId={forespørsel.avatarId}
                  size={56}
                />
                <p className="text-xl font-bold">
                  En telefon vil overta plassen til{' '}
                  <span className="font-black" style={{ color: forespørsel.color }}>
                    {forespørsel.name}
                  </span>
                </p>
              </div>
              <div className="flex gap-3">
                <Button
                  size="liten"
                  tone="turkis"
                  onClick={() => void approveTakeover(forespørsel.name)}
                >
                  Slipp inn
                </Button>
                <Button
                  size="liten"
                  tone="stille"
                  onClick={() => void denyTakeover(forespørsel.name)}
                >
                  Nei
                </Button>
              </div>
            </div>
          ))}
        </section>
      )}

      {view.results ? (
        <ResultScreen
          results={view.results}
          onNewRound={() => void newRound()}
          onChangeRules={async () => {
            // Reglene kan bare endres i lobbyen, så runden avsluttes først.
            if (await newRound()) setEditing(true)
          }}
        />
      ) : view.round ? (
        <GameScreen
          view={view}
          round={view.round}
          onDraw={() => void drawNext()}
          onPause={() => void pause()}
          onResume={() => void resumeGame()}
          onAdvancePrize={() => void advancePrize()}
        />
      ) : settingUp || editing ? (
        <div className="flex flex-1 flex-col gap-6">
          <div>
            <h2 className="text-4xl font-black">
              {settingUp ? 'Sett opp spillet' : 'Endre reglene'}
            </h2>
            <p className="mt-1 text-xl text-tekst-svak">
              {settingUp
                ? 'Velg spill og nivå. Alt annet kan du finjustere under.'
                : 'Alle må melde seg klare på nytt når du endrer noe.'}
            </p>
          </div>

          <ConfigPanel
            configInput={config}
            onChange={changeConfig}
            onDone={() => {
              if (settingUp) void openLobby()
              else setEditing(false)
              setDraft(null)
            }}
            doneLabel={settingUp ? 'Åpne lobbyen' : 'Ferdig'}
          />
        </div>
      ) : (
        <Lobby
          view={view}
          onEdit={() => setEditing(true)}
          onStart={() => void startGame()}
        />
      )}

      {error && (
        <p role="alert" className="text-center text-xl font-bold text-bringebaer">
          {error}
        </p>
      )}
    </main>
  )
}

function Lobby({
  view,
  onEdit,
  onStart,
}: {
  view: HostView
  onEdit: () => void
  onStart: () => void
}) {
  const joined = view.roster.length

  return (
    <div className="grid flex-1 gap-10 lg:grid-cols-[minmax(0,1fr)_auto]">
      <section className="flex flex-col gap-8">
        <div>
          <h2 className="mb-6 text-3xl font-bold text-tekst-svak">
            {joined === 0
              ? 'Venter på spillere…'
              : view.canStart
                ? 'Alle er klare!'
                : `${joined} med — venter på at alle blir klare`}
          </h2>

          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {view.roster.map((slot) => (
              <SpillerKort key={slot.name} slot={slot} />
            ))}
            {/* Én tom plass som invitasjon, ikke seks som mangelliste. */}
            {view.freeSlots > 0 && (
              <div className="flate grid place-items-center p-6 text-center text-lg text-tekst-svak">
                <span>
                  {joined === 0 ? 'Skann koden for å bli med' : 'Plass til flere'}
                  <span className="mt-1 block text-base">
                    {view.freeSlots === 1 ? 'én plass igjen' : `${view.freeSlots} plasser igjen`}
                  </span>
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flate mt-auto p-8">
          <div className="mb-5 flex items-baseline justify-between gap-4">
            <h3 className="text-lg font-bold tracking-widest text-tekst-svak uppercase">
              Reglene denne runden
            </h3>
            <button
              onClick={onEdit}
              className="text-lg font-bold text-sol underline decoration-2 underline-offset-4 hover:text-tekst"
            >
              Endre
            </button>
          </div>
          <ReglerListe config={view.config} />
        </div>
      </section>

      <aside className="flex flex-col items-center gap-6">
        <p className="text-2xl font-bold text-tekst-svak">Skann for å bli med</p>
        <QrCode value={view.joinUrl} size={340} />
        <div className="text-center">
          <p className="text-lg text-tekst-svak">eller gå til {hostname(view.joinUrl)}</p>
          <p className="mt-3 text-lg text-tekst-svak">og skriv koden</p>
          <p className="mt-2 font-mono text-7xl font-black tracking-[0.2em] text-sol">
            {view.code}
          </p>
        </div>
        <Button
          size="stor"
          tone="turkis"
          disabled={!view.canStart}
          onClick={onStart}
          className="mt-2"
        >
          Start spillet
        </Button>
      </aside>
    </div>
  )
}

function SpillerKort({ slot }: { slot: RosterEntry }) {
  return (
    <div
      className="flate flex flex-col items-center gap-4 p-6 text-center transition-colors"
      style={
        slot.ready
          ? { borderColor: slot.color, background: `${slot.color}1f` }
          : undefined
      }
    >
      <Avatar
        name={slot.name}
        color={slot.color}
        avatarId={slot.avatarId}
        selfieUrl={slot.selfieUrl}
        size={104}
        dimmed={!slot.connected}
      />
      <p className="text-3xl font-black">{slot.name}</p>
      <p
        className="text-lg font-bold"
        style={{ color: slot.ready ? slot.color : undefined }}
      >
        {!slot.connected ? 'Frakoblet' : slot.ready ? 'Klar!' : 'Gjør seg klar…'}
      </p>
    </div>
  )
}

function ReglerListe({ config }: { config: ConfigSummary }) {
  const rader: Array<[string, string]> = [
    ['Spill', config.formatName],
    ['Nivå', config.difficultyLabel],
    ['Brett hver', String(config.boardsPerPlayer)],
    ['Markering', config.markingLabel],
    ['Bingo', config.winLabel],
    ['Trekking', config.drawLabel],
    ['Vi spiller om', config.stageLabels.join(' → ')],
    ['Opplesning', config.speech ? 'På' : 'Av'],
  ]
  return (
    <dl className="grid gap-x-10 gap-y-3 text-left sm:grid-cols-2">
      {rader.map(([navn, verdi]) => (
        <div key={navn} className="flex items-baseline justify-between gap-4">
          <dt className="shrink-0 text-base whitespace-nowrap text-tekst-svak">{navn}</dt>
          <dd className="text-right text-lg font-bold">{verdi}</dd>
        </div>
      ))}
    </dl>
  )
}

function StatusPrikk({ tilkoblet }: { tilkoblet: boolean }) {
  return (
    <span className="flex items-center gap-2 text-lg font-bold text-tekst-svak">
      <span
        className="h-3 w-3 rounded-full"
        style={{ background: tilkoblet ? '#2ec4b6' : '#ff4d87' }}
      />
      {tilkoblet ? 'Tilkoblet' : 'Kobler til…'}
    </span>
  )
}

function Beskjed({ tittel, lenke = false }: { tittel: string; lenke?: boolean }) {
  return (
    <main className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <h1 className="text-4xl font-black">{tittel}</h1>
        {lenke && (
          <Link
            href="/"
            className="mt-6 inline-block text-xl font-bold text-sol underline decoration-2 underline-offset-4"
          >
            Til forsiden
          </Link>
        )}
      </div>
    </main>
  )
}

function hostname(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}
