'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Avatar } from '@/ui/shared/Avatar'
import { Button } from '@/ui/shared/Button'

/** Bildet beskjæres til kvadrat og krympes før det forlater telefonen (§14). */
const STØRRELSE = 512
const KVALITET = 0.82

type Steg = 'valg' | 'kamera' | 'forhåndsvis' | 'laster'

/**
 * Selfiesteget. Kameraet er et tilbud, ikke et krav: et barn som ikke vil bli
 * fotografert velger dyret sitt og er like mye med (§14). Bildet komprimeres og
 * beskjæres her på telefonen, så serveren bare får et lite kvadrat.
 */
export function SelfieStep({
  navn,
  farge,
  avatarId,
  onLagre,
  onBrukAvatar,
}: {
  navn: string
  farge: string
  avatarId: string
  onLagre: (blob: Blob) => Promise<string | null>
  onBrukAvatar: () => Promise<string | null>
}) {
  const [steg, setSteg] = useState<Steg>('valg')
  const [feil, setFeil] = useState<string | null>(null)
  const [forhåndsvisning, setForhåndsvisning] = useState<string | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const strømRef = useRef<MediaStream | null>(null)
  const bildeRef = useRef<Blob | null>(null)

  const stoppKamera = useCallback(() => {
    strømRef.current?.getTracks().forEach((spor) => spor.stop())
    strømRef.current = null
  }, [])

  // Kameraet skal aldri bli stående på fordi noen navigerte videre.
  useEffect(() => stoppKamera, [stoppKamera])

  async function startKamera() {
    setFeil(null)
    if (!navigator.mediaDevices?.getUserMedia) {
      setFeil(
        'Kameraet krever en sikker tilkobling. Bruk dyret ditt, eller be verten kjøre appen med HTTPS.',
      )
      return
    }
    try {
      const strøm = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } },
        audio: false,
      })
      strømRef.current = strøm
      setSteg('kamera')
      // Videoelementet finnes først etter at steget er tegnet.
      requestAnimationFrame(() => {
        if (videoRef.current) videoRef.current.srcObject = strøm
      })
    } catch {
      setFeil('Vi fikk ikke tilgang til kameraet. Du kan bruke dyret ditt i stedet.')
    }
  }

  async function taBilde() {
    const video = videoRef.current
    if (!video) return

    const side = Math.min(video.videoWidth, video.videoHeight)
    const lerret = document.createElement('canvas')
    lerret.width = STØRRELSE
    lerret.height = STØRRELSE
    const tegner = lerret.getContext('2d')
    if (!tegner) return

    // Speilvendt, slik barnet så seg selv i «speilet» mens det posérte.
    tegner.translate(STØRRELSE, 0)
    tegner.scale(-1, 1)
    tegner.drawImage(
      video,
      (video.videoWidth - side) / 2,
      (video.videoHeight - side) / 2,
      side,
      side,
      0,
      0,
      STØRRELSE,
      STØRRELSE,
    )

    const blob = await new Promise<Blob | null>((resolve) =>
      lerret.toBlob(resolve, 'image/jpeg', KVALITET),
    )
    if (!blob) {
      setFeil('Klarte ikke å lage bildet. Prøv igjen.')
      return
    }

    stoppKamera()
    bildeRef.current = blob
    setForhåndsvisning(URL.createObjectURL(blob))
    setSteg('forhåndsvis')
  }

  async function godkjenn() {
    if (!bildeRef.current) return
    setSteg('laster')
    const problem = await onLagre(bildeRef.current)
    if (problem) {
      setFeil(problem)
      setSteg('forhåndsvis')
    }
  }

  function taPåNytt() {
    if (forhåndsvisning) URL.revokeObjectURL(forhåndsvisning)
    setForhåndsvisning(null)
    bildeRef.current = null
    void startKamera()
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center gap-6 px-5 py-8 text-center">
      <div>
        <h1 className="text-4xl font-black" style={{ color: farge }}>
          Hei, {navn}!
        </h1>
        <p className="mt-2 text-lg text-tekst-svak">
          {steg === 'kamera'
            ? 'Se på kameraet og smil'
            : steg === 'forhåndsvis'
              ? 'Er dette bra?'
              : 'Vil du ta et bilde av deg selv?'}
        </p>
      </div>

      <div
        className="grid aspect-square w-full max-w-[320px] place-items-center overflow-hidden rounded-full"
        style={{ background: farge, boxShadow: `0 0 0 6px ${farge}33` }}
      >
        {steg === 'kamera' ? (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="h-full w-full object-cover"
            style={{ transform: 'scaleX(-1)' }}
          />
        ) : forhåndsvisning ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={forhåndsvisning}
            alt="Bildet du tok"
            className="h-full w-full object-cover"
          />
        ) : (
          <Avatar name={navn} color={farge} avatarId={avatarId} size={320} />
        )}
      </div>

      {feil && (
        <p role="alert" className="text-lg font-bold text-bringebaer">
          {feil}
        </p>
      )}

      <div className="mt-auto flex w-full flex-col gap-3 pt-4">
        {steg === 'valg' && (
          <>
            <Button size="stor" className="w-full" onClick={startKamera}>
              Ta bilde 📸
            </Button>
            <Button
              tone="stille"
              className="w-full"
              onClick={() => void onBrukAvatar()}
            >
              Bruk {dyrenavn(avatarId)} i stedet
            </Button>
          </>
        )}

        {steg === 'kamera' && (
          <>
            <Button size="stor" className="w-full" onClick={taBilde}>
              Knips!
            </Button>
            <Button
              tone="stille"
              className="w-full"
              onClick={() => {
                stoppKamera()
                setSteg('valg')
              }}
            >
              Avbryt
            </Button>
          </>
        )}

        {steg === 'forhåndsvis' && (
          <>
            <Button size="stor" tone="turkis" className="w-full" onClick={godkjenn}>
              Ja, bruk dette
            </Button>
            <Button tone="stille" className="w-full" onClick={taPåNytt}>
              Ta på nytt
            </Button>
          </>
        )}

        {steg === 'laster' && (
          <p className="py-6 text-xl font-bold text-tekst-svak">Lagrer bildet…</p>
        )}
      </div>

      <p className="text-sm text-tekst-svak">
        Bildet ligger bare på denne serveren mens dere spiller, og slettes når
        spillet er ferdig.
      </p>
    </main>
  )
}

const DYRENAVN: Record<string, string> = {
  rev: 'reven',
  ugle: 'ugla',
  pinnsvin: 'pinnsvinet',
  frosk: 'frosken',
}

function dyrenavn(avatarId: string): string {
  return DYRENAVN[avatarId] ?? 'avataren'
}
