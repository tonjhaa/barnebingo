import { networkInterfaces } from 'node:os'

/**
 * Adressen telefonene skal treffe. Hovedskjermen kjører gjerne på localhost,
 * men QR-koden må peke på maskinens adresse i hjemmenettverket — ellers skanner
 * barna en lenke til sin egen telefon.
 */
export function lanAddress(): string {
  const preferred: string[] = []
  const fallback: string[] = []

  for (const [name, addresses] of Object.entries(networkInterfaces())) {
    for (const address of addresses ?? []) {
      if (address.family !== 'IPv4' || address.internal) continue
      // en0/en1 er Wi-Fi og Ethernet på macOS; utelukker Docker- og VPN-broer.
      if (/^en\d/.test(name)) preferred.push(address.address)
      else fallback.push(address.address)
    }
  }

  return preferred[0] ?? fallback[0] ?? 'localhost'
}

export function buildBaseUrl(protocol: 'http' | 'https', host: string, port: number): string {
  const isDefaultPort =
    (protocol === 'http' && port === 80) || (protocol === 'https' && port === 443)
  return isDefaultPort ? `${protocol}://${host}` : `${protocol}://${host}:${port}`
}
