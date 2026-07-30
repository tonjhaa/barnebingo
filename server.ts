import { createServer as createHttpServer } from 'node:http'
import { createServer as createHttpsServer } from 'node:https'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import next from 'next'
import { Server as SocketServer } from 'socket.io'
import { attachSocketHandlers } from '@/infra/socket/server'
import { InMemoryRoomStore } from '@/infra/store/roomStore'
import { SelfieStore } from '@/infra/store/selfieStore'
import { GameService } from '@/server/gameService'
import { buildBaseUrl, lanAddress } from '@/infra/network'
import { log } from '@/infra/logger'

const dev = process.env.NODE_ENV !== 'production'
const port = Number(process.env.PORT ?? (dev ? 3000 : 8080))
const certDir = resolve(process.cwd(), 'certs')
const certPath = resolve(certDir, 'cert.pem')
const keyPath = resolve(certDir, 'key.pem')

/**
 * HTTPS er ikke pynt: iOS Safari nekter kameratilgang uten sikker kontekst, så
 * uten sertifikat finnes ingen selfie. Vi faller tilbake til HTTP så appen
 * fortsatt kan kjøres med avatarer.
 */
const useHttps = existsSync(certPath) && existsSync(keyPath) && process.env.FORCE_HTTP !== '1'
const protocol = useHttps ? 'https' : 'http'

const app = next({ dev })
const handle = app.getRequestHandler()

async function main() {
  await app.prepare()

  /**
   * Selfiene serveres av denne serveren, ikke av en Next-rute. Bildene bor i
   * GameService sitt prosessminne, og en rutehåndterer inne i Next kjører i et
   * annet modulregister — den ville ikke sett den samme lagringen.
   */
  const serveSelfie = (
    req: Parameters<typeof handle>[0],
    res: Parameters<typeof handle>[1],
  ): boolean => {
    const treff = /^\/api\/selfie\/([^/?]+)\/([^/?]+)$/.exec(req.url ?? '')
    if (!treff) return false

    const bilde = game.selfieStore.get(decodeURIComponent(treff[2]), decodeURIComponent(treff[1]))
    if (!bilde) {
      res.statusCode = 404
      res.end()
      return true
    }

    res.writeHead(200, {
      'Content-Type': bilde.contentType,
      'Content-Length': bilde.bytes.length,
      // Bildet er midlertidig og skal ikke ligge igjen i noen mellomlagre (§25).
      'Cache-Control': 'no-store, private',
      'X-Content-Type-Options': 'nosniff',
    })
    res.end(bilde.bytes)
    return true
  }

  /** Enkel helsesjekk (§17). Sier ingenting om hvem som spiller. */
  const serveHealth = (
    req: Parameters<typeof handle>[0],
    res: Parameters<typeof handle>[1],
  ): boolean => {
    if (req.url !== '/api/health') return false
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    res.end(
      JSON.stringify({
        ok: true,
        rooms: game.store.all().length,
        uptimeSeconds: Math.round(process.uptime()),
      }),
    )
    return true
  }

  const requestHandler = (req: Parameters<typeof handle>[0], res: Parameters<typeof handle>[1]) => {
    if (serveHealth(req, res)) return
    if (serveSelfie(req, res)) return
    handle(req, res).catch((error: unknown) => {
      log.error('forespørsel feilet', { error: String(error) })
      res.statusCode = 500
      res.end('Serverfeil')
    })
  }

  const server = useHttps
    ? createHttpsServer(
        { cert: readFileSync(certPath), key: readFileSync(keyPath) },
        requestHandler,
      )
    : createHttpServer(requestHandler)

  const io = new SocketServer(server, {
    // Samme opprinnelse i praksis, men telefonene treffer LAN-adressen mens
    // hovedskjermen gjerne står på localhost.
    cors: { origin: true, credentials: true },
    pingInterval: 10000,
    pingTimeout: 20000,
  })

  const host = lanAddress()
  const baseUrl = buildBaseUrl(protocol, host, port)

  const game = new GameService(io, new InMemoryRoomStore(), new SelfieStore(), () => baseUrl)
  attachSocketHandlers(io, game)

  // Rydder bort utløpte rom og selfiene deres (§24).
  const sweeper = setInterval(() => game.sweep(), 60_000)
  sweeper.unref()

  /**
   * Pen nedstenging. Uten dette blir timere og åpne socketer hengende, og en
   * `npm run dev` som startes på nytt kan møte en port som fortsatt er opptatt.
   */
  let stenger = false
  const stengNed = (signal: string) => {
    if (stenger) return
    stenger = true
    log.info('stenger ned', { signal })
    clearInterval(sweeper)
    game.dispose()
    io.close(() => {
      server.close(() => process.exit(0))
    })
    // Gi klientene et øyeblikk, men ikke la en treg socket holde oss igjen.
    setTimeout(() => process.exit(0), 3000).unref()
  }
  process.on('SIGINT', () => stengNed('SIGINT'))
  process.on('SIGTERM', () => stengNed('SIGTERM'))

  server.listen(port, '0.0.0.0', () => {
    log.info('Barnebingo kjører', { protocol, port })
    console.log(`\n  Hovedskjerm:  ${buildBaseUrl(protocol, 'localhost', port)}`)
    console.log(`  Telefoner:    ${baseUrl}`)
    if (!useHttps) {
      console.log('\n  Uten HTTPS: selfie er deaktivert i Safari. Kjør `npm run certs`.')
    }
    console.log('')
  })
}

main().catch((error) => {
  log.error('serveren startet ikke', { error: String(error) })
  process.exit(1)
})
