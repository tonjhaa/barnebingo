import { networkInterfaces } from 'node:os'
import { fileURLToPath } from 'node:url'
import type { NextConfig } from 'next'

/**
 * Adressene telefonene treffer oss på i utviklingsmodus.
 *
 * Next blokkerer klientkoden for alle andre opphav enn localhost. Da tegnes
 * siden, men React starter aldri — og telefonen blir stående på «Kobler til
 * spillet…» uten at noe ser galt ut i loggen.
 *
 * Adressen varierer med nettverket, så den leses av maskinen framfor å skrives
 * inn. Gjelder bare `next dev`; i produksjon er dette ikke i bruk.
 */
function lokaleAdresser(): string[] {
  const adresser = new Set(['localhost', '127.0.0.1'])
  for (const grensesnitt of Object.values(networkInterfaces())) {
    for (const adresse of grensesnitt ?? []) {
      if (adresse.family === 'IPv4' && !adresse.internal) adresser.add(adresse.address)
    }
  }
  return [...adresser]
}

const nextConfig: NextConfig = {
  // Det ligger package-lock.json lenger opp i mappetreet på denne maskinen;
  // uten dette gjetter Turbopack feil rotmappe.
  turbopack: {
    root: fileURLToPath(new URL('.', import.meta.url)),
  },
  allowedDevOrigins: lokaleAdresser(),
}

export default nextConfig
