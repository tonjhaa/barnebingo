/**
 * Genererer opplesningsklippene én gang.
 *
 *     OPENAI_API_KEY=sk-... node scripts/lag-lyd.mjs
 *
 * Klippene legges i public/lyd/ og skal committes. Da er stemmen den samme på
 * alle skjermer, uavhengig av hvilke stemmer maskinen har installert — og
 * appen trenger ingen API-nøkkel i drift.
 *
 * «B tolv» settes sammen av to klipp ved avspilling. Derfor 96 filer og ikke
 * 165: bokstavene og tallene lages hver for seg.
 */
import { mkdir, writeFile, access } from 'node:fs/promises'
import { join } from 'node:path'

const NØKKEL = process.env.OPENAI_API_KEY
const STEMME = process.env.TTS_VOICE ?? 'nova'
const MODELL = process.env.TTS_MODEL ?? 'gpt-4o-mini-tts'
const MAPPE = join(process.cwd(), 'public', 'lyd')

if (!NØKKEL) {
  console.error('Mangler OPENAI_API_KEY.\n')
  console.error('  OPENAI_API_KEY=sk-... node scripts/lag-lyd.mjs\n')
  process.exit(1)
}

const ENERE = [
  '', 'en', 'to', 'tre', 'fire', 'fem', 'seks', 'sju', 'åtte', 'ni', 'ti',
  'elleve', 'tolv', 'tretten', 'fjorten', 'femten', 'seksten', 'sytten',
  'atten', 'nitten',
]
const TIERE = ['', '', 'tjue', 'tretti', 'førti', 'femti', 'seksti', 'sytti', 'åtti', 'nitti']

/** Tallet skrevet ut, så stemmen ikke gjetter på siffer. */
function norsk(n) {
  if (n < 20) return ENERE[n]
  const tier = Math.floor(n / 10)
  const ener = n % 10
  return ener === 0 ? TIERE[tier] : `${TIERE[tier]}${ENERE[ener]}`
}

/** Alt som skal leses opp, som filnavn → tekst. */
function alleKlipp() {
  const klipp = new Map()

  // 1–90 dekker alle tre formatene.
  for (let n = 1; n <= 90; n++) klipp.set(String(n), norsk(n))

  klipp.set('nummer', 'Nummer')
  for (const bokstav of ['b', 'i', 'n', 'g', 'o']) {
    klipp.set(bokstav, bokstav.toUpperCase())
  }

  // Stadiene navngis med indeks, siden etikettene varierer med format.
  klipp.set('stadium-0', 'Nå spiller vi om én rad')
  klipp.set('stadium-1', 'Nå spiller vi om to rader')
  klipp.set('stadium-2', 'Nå spiller vi om tre rader')
  klipp.set('stadium-3', 'Nå spiller vi om fullt brett')

  klipp.set('bingo', 'Vi har bingo!')

  return klipp
}

async function finnes(sti) {
  try {
    await access(sti)
    return true
  } catch {
    return false
  }
}

async function lagKlipp(navn, tekst) {
  const svar = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${NØKKEL}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODELL,
      voice: STEMME,
      input: tekst,
      // Bingovert, ikke nyhetsoppleser: tydelig, blid, uten hastverk.
      instructions:
        'Snakk norsk bokmål som en vennlig bingovert i en familiestue. ' +
        'Tydelig og blid, litt langsomt, med varme. Ikke overdrevet entusiastisk.',
      response_format: 'mp3',
    }),
  })

  if (!svar.ok) {
    throw new Error(`${navn}: ${svar.status} ${await svar.text()}`)
  }
  await writeFile(join(MAPPE, `${navn}.mp3`), Buffer.from(await svar.arrayBuffer()))
}

const klipp = alleKlipp()
await mkdir(MAPPE, { recursive: true })

console.log(`Lager ${klipp.size} klipp med stemmen «${STEMME}»…\n`)

let laget = 0
let hoppet = 0

for (const [navn, tekst] of klipp) {
  if (await finnes(join(MAPPE, `${navn}.mp3`))) {
    hoppet++
    continue
  }
  await lagKlipp(navn, tekst)
  laget++
  process.stdout.write(`\r  ${laget} laget, ${hoppet} fantes fra før`)
}

console.log(`\n\nFerdig. ${laget} nye klipp i public/lyd/.`)
if (hoppet > 0) {
  console.log(`${hoppet} fantes fra før — slett dem for å lage dem på nytt.`)
}
console.log('\nCommit mappa, så følger stemmen med appen.')
