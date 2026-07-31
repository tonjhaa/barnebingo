/**
 * Lager lydeffektene og musikksporet.
 *
 *     npm run effekter
 *
 * Effektene syntetiseres her framfor å lastes ned. Grunnen er lisens: §17
 * forbyr å hente vilkårlige søketreff, og en fil vi selv har regnet ut kan ikke
 * ha uklare vilkår. Den er CC0 fordi vi sier at den er det.
 *
 * De er også bevisst milde. Ingen skarpe transienter, ingen bass som skremmer,
 * ingenting som høres ut som en feilmelding — et barn som trykker BINGO og tar
 * feil skal ikke få en lyd som gjør hen flau (§9, §15).
 *
 * Vil du heller bruke ferdige effekter fra Kenney eller Pixabay, legg dem i
 * public/lyd/effekt/ med samme filnavn og registrer dem i assets/register.json.
 * Ingenting i koden trenger å endres.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const MAPPE = join(process.cwd(), 'public', 'lyd', 'effekt')
const MUSIKKMAPPE = join(process.cwd(), 'public', 'lyd', 'musikk')
const SR = 44100

/** En dur-pentaton skala. Ingen halvtoner betyr ingen skurrende intervaller. */
const C = 261.63
const TONER = {
  c: C,
  d: C * (9 / 8),
  e: C * (5 / 4),
  g: C * (3 / 2),
  a: C * (5 / 3),
  c2: C * 2,
  e2: C * 2.5,
  g2: C * 3,
  c3: C * 4,
}

interface Tone {
  frekvens: number
  start: number
  lengde: number
  styrke?: number
  /** Overtoner gir klang. En ren sinus høres ut som en hørselstest. */
  klang?: number[]
}

/**
 * Myk inn- og utgang. En brå start knepper i høyttaleren, og et knepp er den
 * eneste lyden her som faktisk ville vært ubehagelig.
 */
function konvolutt(t: number, lengde: number): number {
  const angrep = Math.min(0.012, lengde * 0.2)
  if (t < angrep) return t / angrep
  const igjen = lengde - t
  const slipp = Math.min(0.25, lengde * 0.7)
  if (igjen < slipp) return Math.max(0, igjen / slipp)
  return 1
}

function miks(toner: Tone[], lengde: number): Float32Array {
  const ut = new Float32Array(Math.ceil(lengde * SR))

  for (const tone of toner) {
    const klang = tone.klang ?? [1, 0.35, 0.12]
    const styrke = tone.styrke ?? 1
    const fra = Math.floor(tone.start * SR)
    const antall = Math.floor(tone.lengde * SR)

    for (let i = 0; i < antall && fra + i < ut.length; i++) {
      const t = i / SR
      let verdi = 0
      klang.forEach((vekt, n) => {
        verdi += vekt * Math.sin(2 * Math.PI * tone.frekvens * (n + 1) * t)
      })
      ut[fra + i] += verdi * konvolutt(t, tone.lengde) * styrke * 0.16
    }
  }

  // Normaliser mykt, så ingen effekt er påfallende høyere enn de andre.
  let topp = 0
  for (const v of ut) topp = Math.max(topp, Math.abs(v))
  if (topp > 0.8) for (let i = 0; i < ut.length; i++) ut[i] *= 0.8 / topp
  return ut
}

/** Sus, brukt til applaus og konfetti. */
function sus(lengde: number, styrke: number, seed: number): Float32Array {
  const ut = new Float32Array(Math.ceil(lengde * SR))
  let a = seed >>> 0
  let forrige = 0
  for (let i = 0; i < ut.length; i++) {
    a = (a * 1664525 + 1013904223) >>> 0
    const rå = (a / 0xffffffff) * 2 - 1
    // Lavpassfiltrert støy: mykt sus i stedet for hvit skarphet.
    forrige = forrige * 0.82 + rå * 0.18
    const t = i / SR
    ut[i] = forrige * konvolutt(t, lengde) * styrke
  }
  return ut
}

function legg(a: Float32Array, b: Float32Array): Float32Array {
  const ut = new Float32Array(Math.max(a.length, b.length))
  for (let i = 0; i < ut.length; i++) ut[i] = (a[i] ?? 0) + (b[i] ?? 0)
  return ut
}

/** 16-bits mono WAV. Alle nettlesere spiller det, uten koding. */
function wav(prøver: Float32Array): Buffer {
  const data = Buffer.alloc(prøver.length * 2)
  for (let i = 0; i < prøver.length; i++) {
    const v = Math.max(-1, Math.min(1, prøver[i]))
    data.writeInt16LE(Math.round(v * 32767), i * 2)
  }

  const hode = Buffer.alloc(44)
  hode.write('RIFF', 0)
  hode.writeUInt32LE(36 + data.length, 4)
  hode.write('WAVE', 8)
  hode.write('fmt ', 12)
  hode.writeUInt32LE(16, 16)
  hode.writeUInt16LE(1, 20)
  hode.writeUInt16LE(1, 22)
  hode.writeUInt32LE(SR, 24)
  hode.writeUInt32LE(SR * 2, 28)
  hode.writeUInt16LE(2, 32)
  hode.writeUInt16LE(16, 34)
  hode.write('data', 36)
  hode.writeUInt32LE(data.length, 40)
  return Buffer.concat([hode, data])
}

const EFFEKTER: Record<string, () => Float32Array> = {
  // Et lite klikk med tone i. Skal kunne trykkes hundre ganger uten å slite.
  knapp: () => miks([{ frekvens: TONER.g2, start: 0, lengde: 0.07, styrke: 0.5 }], 0.1),

  // Kula ruller ut: to toner opp, som en liten opptakt til tallet.
  trekk: () =>
    miks(
      [
        { frekvens: TONER.c2, start: 0, lengde: 0.1, styrke: 0.7 },
        { frekvens: TONER.g2, start: 0.07, lengde: 0.16, styrke: 0.6 },
      ],
      0.3,
    ),

  // Markering: én kort, lys tone. Bekreftelse, ikke belønning.
  markering: () => miks([{ frekvens: TONER.e2, start: 0, lengde: 0.09, styrke: 0.45 }], 0.12),

  // Overgang mellom premiestadier: en myk oppgang.
  overgang: () =>
    miks(
      [
        { frekvens: TONER.c, start: 0, lengde: 0.3, styrke: 0.5 },
        { frekvens: TONER.e, start: 0.1, lengde: 0.3, styrke: 0.5 },
        { frekvens: TONER.g, start: 0.2, lengde: 0.4, styrke: 0.5 },
      ],
      0.7,
    ),

  // Spenning mens en bingo kontrolleres: to toner som ligger og venter.
  spenning: () =>
    miks(
      [
        { frekvens: TONER.c, start: 0, lengde: 1.2, styrke: 0.35, klang: [1, 0.5] },
        { frekvens: TONER.d, start: 0, lengde: 1.2, styrke: 0.25, klang: [1, 0.5] },
      ],
      1.3,
    ),

  // Bingo: hele akkorden, oppover.
  bingo: () =>
    legg(
      miks(
        [
          { frekvens: TONER.c, start: 0, lengde: 0.5 },
          { frekvens: TONER.e, start: 0.08, lengde: 0.5 },
          { frekvens: TONER.g, start: 0.16, lengde: 0.55 },
          { frekvens: TONER.c2, start: 0.24, lengde: 0.7 },
        ],
        1.1,
      ),
      sus(1.1, 0.05, 7),
    ),

  // Fanfare for fullt brett. Kveldens største lyd, og fortsatt ikke skarp.
  fanfare: () =>
    legg(
      miks(
        [
          { frekvens: TONER.g, start: 0, lengde: 0.18 },
          { frekvens: TONER.c2, start: 0.16, lengde: 0.18 },
          { frekvens: TONER.e2, start: 0.32, lengde: 0.22 },
          { frekvens: TONER.g2, start: 0.5, lengde: 0.9 },
          { frekvens: TONER.c3, start: 0.5, lengde: 0.9, styrke: 0.5 },
        ],
        1.6,
      ),
      sus(1.6, 0.06, 11),
    ),

  // Applaus og konfetti: sus med litt forskjellig karakter.
  applaus: () => sus(2.2, 0.5, 3),
  konfetti: () =>
    legg(
      sus(1.4, 0.28, 5),
      miks(
        [
          { frekvens: TONER.e2, start: 0.05, lengde: 0.12, styrke: 0.4 },
          { frekvens: TONER.g2, start: 0.25, lengde: 0.12, styrke: 0.35 },
          { frekvens: TONER.c3, start: 0.45, lengde: 0.14, styrke: 0.3 },
        ],
        1.4,
      ),
    ),

  /**
   * Feil bingo. To toner nedover, mildt og kort — det skal høres ut som «ikke
   * ennå», ikke som «feil». Ingen dissonans, ingen surrende bass.
   */
  bom: () =>
    miks(
      [
        { frekvens: TONER.e, start: 0, lengde: 0.16, styrke: 0.4 },
        { frekvens: TONER.c, start: 0.13, lengde: 0.22, styrke: 0.4 },
      ],
      0.4,
    ),

  // Nedtelling: ett rolig tikk.
  nedtelling: () => miks([{ frekvens: TONER.a, start: 0, lengde: 0.08, styrke: 0.4 }], 0.12),
}

/**
 * Bakgrunnsmusikk: en rolig sløyfe på åtte takter.
 *
 * Den skal kunne gå i tjue minutter uten at noen legger merke til den. Derfor
 * ingen melodi å nynne med på, bare en langsom vekselvirkning mellom to
 * akkorder — og den er lav nok til at tale alltid ligger over.
 */
function musikk(): Float32Array {
  const takt = 2.0
  const takter = 8
  const toner: Tone[] = []

  for (let i = 0; i < takter; i++) {
    const start = i * takt
    // Vekselvis C og A-moll: samme toner, ulik grunntone. Aldri urolig.
    const grunn = i % 2 === 0 ? [TONER.c, TONER.e, TONER.g] : [TONER.a, TONER.c2, TONER.e]
    grunn.forEach((frekvens, n) => {
      toner.push({
        frekvens: frekvens / 2,
        start: start + n * 0.12,
        lengde: takt - 0.1,
        styrke: 0.34,
        klang: [1, 0.22, 0.06],
      })
    })
  }

  return miks(toner, takter * takt)
}

async function main(): Promise<void> {
  await mkdir(MAPPE, { recursive: true })
  await mkdir(MUSIKKMAPPE, { recursive: true })

  for (const [navn, lag] of Object.entries(EFFEKTER)) {
    await writeFile(join(MAPPE, `${navn}.wav`), wav(lag()))
  }
  await writeFile(join(MUSIKKMAPPE, 'bakgrunn.wav'), wav(musikk()))

  console.log(`${Object.keys(EFFEKTER).length} effekter i public/lyd/effekt/`)
  console.log('1 musikksløyfe i public/lyd/musikk/')
  console.log('\nAlt er syntetisert her, så lisensen er vår egen (CC0).')
  console.log('Bytt gjerne inn Kenney- eller Pixabay-filer med samme navn.')
}

void main()
