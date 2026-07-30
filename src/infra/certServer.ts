import { createServer } from 'node:http'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Server } from 'node:http'
import { log } from './logger'

/**
 * En liten hjelpeserver på ren HTTP, ved siden av spillet.
 *
 * Telefonen må stole på sertifikatet vårt før den kan bruke kameraet, men den
 * kan ikke hente sertifikatet over en tilkobling den ikke stoler på. Det er
 * hønen og egget. Løsningen er denne: én port uten TLS som ikke gjør annet enn
 * å dele ut CA-en og forklare hva man gjør med den.
 *
 * Den kjenner ingen romkoder og ingen spillere. Det eneste den serverer er en
 * offentlig sertifikatfil — aldri den private nøkkelen.
 */

function findCaFile(): string | null {
  try {
    const root = execFileSync('mkcert', ['-CAROOT'], { encoding: 'utf8' }).trim()
    const file = join(root, 'rootCA.pem')
    return existsSync(file) ? file : null
  } catch {
    return null
  }
}

function hjelpeside(spillUrl: string): string {
  return `<!doctype html>
<html lang="nb">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Barnebingo — sertifikat</title>
<style>
  :root { color-scheme: dark }
  body {
    margin: 0; padding: 2rem 1.5rem; background: #0e0a24; color: #f7f5ff;
    font-family: ui-rounded, "SF Pro Rounded", system-ui, sans-serif;
    line-height: 1.5; max-width: 30rem; margin-inline: auto;
  }
  h1 { font-size: 2rem; margin: 0 0 .5rem }
  p { color: #a79fd4 }
  a.knapp {
    display: block; margin: 2rem 0 1rem; padding: 1.25rem; border-radius: 1rem;
    background: #ffd23f; color: #0e0a24; font-size: 1.4rem; font-weight: 800;
    text-align: center; text-decoration: none;
  }
  ol { padding-left: 1.2rem }
  li { margin-bottom: .75rem }
  b { color: #f7f5ff }
  a.spill {
    display: block; margin-top: 2rem; padding: 1rem; border-radius: 1rem;
    border: 1px solid #3d3390; color: #2ec4b6; font-weight: 800;
    text-align: center; text-decoration: none;
  }
</style>
</head>
<body>
  <h1>Nesten klar 📸</h1>
  <p>For at kameraet skal virke må telefonen stole på bingoserveren. Det tar
     et halvt minutt, og gjøres bare én gang.</p>

  <a class="knapp" href="/rootCA.pem">Last ned sertifikatet</a>

  <ol>
    <li>Trykk <b>Tillat</b> når telefonen spør om å laste ned en profil.</li>
    <li>Åpne <b>Innstillinger</b>. Øverst står <b>Profil lastet ned</b> —
        trykk der, og så <b>Installer</b>.</li>
    <li>Gå til <b>Innstillinger → Generelt → Om → Sertifikattillit</b> og
        slå på bryteren ved <b>mkcert</b>.</li>
  </ol>

  <p>Det siste steget er det folk hopper over. Uten det er profilen installert,
     men ikke betrodd.</p>

  <a class="spill" href="${spillUrl}">Tilbake til bingoen →</a>
</body>
</html>`
}

/**
 * Starter hjelpeserveren. Returnerer null hvis det ikke finnes noen CA å dele
 * ut — da er det ingenting å hjelpe med.
 */
export function startCertServer(options: {
  port: number
  spillUrl: string
}): Server | null {
  const caFile = findCaFile()
  if (!caFile) return null

  const ca = readFileSync(caFile)

  const server = createServer((req, res) => {
    if (req.url === '/rootCA.pem') {
      // Denne typen får iOS til å tilby installasjon som konfigurasjonsprofil
      // i stedet for å vise filen som tekst.
      res.writeHead(200, {
        'Content-Type': 'application/x-x509-ca-cert',
        'Content-Disposition': 'attachment; filename="barnebingo-rootCA.pem"',
        'Content-Length': ca.length,
        'Cache-Control': 'no-store',
      })
      res.end(ca)
      return
    }

    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
    res.end(hjelpeside(options.spillUrl))
  })

  server.listen(options.port, '0.0.0.0', () => {
    log.info('sertifikathjelp klar', { port: options.port })
  })

  return server
}
