'use client'

import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

/**
 * QR-koden genereres på hovedskjermen, ikke på serveren — den inneholder bare
 * en offentlig lenke, og å slippe et rundturskall gjør at koden står der med
 * en gang lobbyen åpner.
 */
export function QrCode({ value, size = 320 }: { value: string; size?: number }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    QRCode.toDataURL(value, {
      width: size * 2,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#0e0a24', light: '#ffffff' },
    })
      .then((url) => {
        if (!cancelled) setDataUrl(url)
      })
      .catch(() => setDataUrl(null))
    return () => {
      cancelled = true
    }
  }, [value, size])

  return (
    <div
      className="grid place-items-center rounded-3xl bg-white p-4"
      style={{ width: size, height: size }}
    >
      {dataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- lokalt generert data-URL
        <img src={dataUrl} alt="QR-kode for å bli med" className="h-full w-full" />
      ) : (
        <span className="text-sm font-bold text-natt">Lager kode…</span>
      )}
    </div>
  )
}
