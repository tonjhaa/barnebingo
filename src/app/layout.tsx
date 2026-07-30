import type { Metadata, Viewport } from 'next'
import { Nunito } from 'next/font/google'
import './globals.css'

const nunito = Nunito({
  variable: '--font-nunito',
  subsets: ['latin', 'latin-ext'],
  weight: ['400', '600', '800', '900'],
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
  themeColor: '#0e0a24',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nb" className={`${nunito.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  )
}
