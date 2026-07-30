'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/ui/shared/Button'
import { hostSession, useHostSession } from '@/ui/shared/session'
import { CommandError, send } from '@/ui/shared/socket'
import { C, type CreateRoomResult } from '@/shared/protocol'

/**
 * Vertens startside. Med vilje nesten tom: den som står med fjernkontrollen
 * skal komme i gang med ett trykk, ikke gjennom et skjema.
 */
export default function StartPage() {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const previous = useHostSession()

  async function createRoom() {
    setBusy(true)
    setError(null)
    try {
      const result = await send<CreateRoomResult>(C.hostCreateRoom, {})
      hostSession.set(result)
      router.push(`/vert/${result.roomId}`)
    } catch (cause) {
      setError(
        cause instanceof CommandError ? cause.message : 'Fikk ikke kontakt med serveren.',
      )
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto grid min-h-dvh max-w-4xl place-items-center px-6 py-16 text-center">
      <div>
        <p className="mb-4 text-xl font-bold tracking-[0.35em] text-tekst-svak uppercase">
          Velkommen til
        </p>
        <h1 className="mb-6 text-[clamp(3.5rem,12vw,8rem)] leading-none font-black tracking-tight">
          <span className="text-sol">Barne</span>
          <span className="text-bringebaer">bingo</span>
        </h1>
        <p className="mx-auto mb-14 max-w-lg text-2xl text-tekst-svak">
          Denne skjermen trekker tallene. Alle andre spiller fra telefonen sin.
        </p>

        <Button size="stor" onClick={createRoom} disabled={busy}>
          {busy ? 'Lager rom…' : 'Lag nytt spillrom'}
        </Button>

        {previous && (
          <p className="mt-8 text-lg text-tekst-svak">
            <button
              onClick={() => router.push(`/vert/${previous.roomId}`)}
              className="underline decoration-lilla decoration-2 underline-offset-4 hover:text-tekst"
            >
              Tilbake til rom {previous.code}
            </button>
          </p>
        )}

        {error && (
          <p role="alert" className="mt-8 text-lg font-bold text-bringebaer">
            {error}
          </p>
        )}
      </div>
    </main>
  )
}
