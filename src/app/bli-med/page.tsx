'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/ui/shared/Button'

/**
 * Reserveløsningen for telefoner som ikke fikk skannet QR-koden. Feltet tar
 * bare tegnene som finnes i alfabetet for romkoder, så en O blir aldri
 * forvekslet med en null.
 */
export default function SkrivKodePage() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const complete = code.length === 4

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center px-5 py-12 text-center">
      <h1 className="text-4xl font-black">Skriv romkoden</h1>
      <p className="mt-3 mb-10 text-lg text-tekst-svak">Den står med store bokstaver på TV-en.</p>

      <input
        value={code}
        onChange={(event) =>
          setCode(
            event.target.value
              .toUpperCase()
              .replace(/[^A-HJ-NP-Z2-9]/g, '')
              .slice(0, 4),
          )
        }
        inputMode="text"
        autoCapitalize="characters"
        autoCorrect="off"
        spellCheck={false}
        aria-label="Romkode"
        placeholder="––––"
        className="flate w-full py-6 text-center font-mono text-6xl font-black tracking-[0.25em] text-sol placeholder:text-kant focus:border-lilla focus:outline-none"
      />

      <Button
        size="stor"
        className="mt-8 w-full"
        disabled={!complete}
        onClick={() => router.push(`/bli-med/${code}`)}
      >
        Bli med
      </Button>
    </main>
  )
}
