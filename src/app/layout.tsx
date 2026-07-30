import type { Metadata, Viewport } from 'next'
import { Archivo, Familjen_Grotesk } from 'next/font/google'
import './globals.css'

/**
 * To skrifter med hver sin jobb. Archivo er stødig og har en ekte svart vekt —
 * den bærer tallene, som er data og skal leses fra fire meters avstand.
 * Familjen Grotesk har nordisk særpreg og bærer stemmen: overskrifter,
 * knapper, alt appen sier.
 */
const archivo = Archivo({
  variable: '--font-archivo',
  subsets: ['latin', 'latin-ext'],
  weight: ['500', '700', '800', '900'],
})

const familjen = Familjen_Grotesk({
  variable: '--font-familjen',
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '500', '600', '700'],
})

export const metadata: Metadata = {
  title: 'Barnebingo',
  description: 'Bingo for hele familien, på TV-en og på telefonene.',
}

export const viewport: Viewport = {
  // Ingen zoom: et barn som dobbelttrykker på en rute skal markere den,
  // ikke forstørre skjermen.
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#170b29',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="nb"
      className={`${archivo.variable} ${familjen.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  )
}
