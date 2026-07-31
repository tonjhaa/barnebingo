import { AVSLUTNINGER, FRASEKLIPP, INTROER, SYSTEMFRASER } from './fraser'
import { INNSLAG, KATEGORIER, type Innslag } from './historier'
import { alleKlipp } from './index'
import { BOKSTAVER, MAKS_TALL, klippForBokstav, klippForNummer, klippForSiffer, klippForTall, tallOrd } from './tall'
import { VARIANTKLIPP } from './tallvarianter'
import type { Klipp } from './typer'

/**
 * Validering av replikkbiblioteket (§20).
 *
 * Innholdet er data, og data råtner: en id skrives feil, en historie mister
 * kategorien sin, et faktum blir stående uten kilde. Ingenting av det ville
 * gitt en typefeil, og alt av det ville blitt oppdaget først på bingokvelden.
 *
 * Derfor kjøres dette som en test.
 */

export interface Innholdsfeil {
  kode: string
  melding: string
  /** Klippet eller innslaget feilen gjelder. */
  id?: string
}

/** Et innslag skal fylle en pause på 3–12 sekunder (§8), ikke lage en. */
export const MAKS_TEGN_INNSLAG = 220
/** En innledning eller avslutning skal ramme inn tallet, ikke overdøve det. */
export const MAKS_TEGN_FRASE = 90

export function validerInnhold(): Innholdsfeil[] {
  return [
    ...validerTall(),
    ...validerIder(),
    ...validerLengder(),
    ...validerInnslag(),
  ]
}

/** Alle tall fra 1 til 90 skal kunne leses opp, helt og siffer for siffer. */
function validerTall(): Innholdsfeil[] {
  const feil: Innholdsfeil[] = []
  const ider = new Set(alleKlipp().map((klipp) => klipp.id))
  const tekster = new Map(alleKlipp().map((klipp) => [klipp.id, klipp.tekst]))

  for (let n = 1; n <= MAKS_TALL; n++) {
    const id = klippForTall(n)
    if (!ider.has(id)) {
      feil.push({ kode: 'tall/mangler', id, melding: `Tallet ${n} har ingen opplesning.` })
      continue
    }
    const ord = tallOrd(n)
    if (!ord || tekster.get(id)?.toLowerCase() !== ord) {
      feil.push({
        kode: 'tall/feilOrd',
        id,
        melding: `Tallet ${n} leses som «${tekster.get(id)}», men skal være «${ord}».`,
      })
    }
  }

  // Sifrene, inkludert null, som bare finnes som siffer.
  for (let d = 0; d <= 9; d++) {
    if (!ider.has(klippForSiffer(d))) {
      feil.push({
        kode: 'siffer/mangler',
        id: klippForSiffer(d),
        melding: `Sifferet ${d} kan ikke leses opp. «Tjueen … to en» krever alle ti.`,
      })
    }
  }

  // «Nummer sju» for de ensifrede, som er de eneste som gjentas slik.
  for (let n = 1; n <= 9; n++) {
    if (!ider.has(klippForNummer(n))) {
      feil.push({
        kode: 'nummer/mangler',
        id: klippForNummer(n),
        melding: `Mangler «nummer ${n}», som ensifrede tall gjentas med.`,
      })
    }
  }

  for (const bokstav of BOKSTAVER) {
    if (!ider.has(klippForBokstav(bokstav))) {
      feil.push({
        kode: 'bokstav/mangler',
        id: klippForBokstav(bokstav),
        melding: `Bokstaven ${bokstav} mangler. 75-formatet trenger alle fem.`,
      })
    }
  }

  return feil
}

/** Id-er må være unike og trygge som filnavn. */
function validerIder(): Innholdsfeil[] {
  const feil: Innholdsfeil[] = []
  const sett = new Set<string>()
  // Innslagene ligger allerede i `alleKlipp()`. Å legge dem til igjen her ville
  // gjort hvert eneste av dem til en dobbeltregistrering.
  const alle: Klipp[] = alleKlipp()

  for (const klipp of alle) {
    if (sett.has(klipp.id)) {
      feil.push({ kode: 'id/dobbel', id: klipp.id, melding: `Id-en «${klipp.id}» finnes to ganger.` })
    }
    sett.add(klipp.id)

    // Id-en blir et filnavn og en URL. Alt annet enn dette gir trøbbel et sted.
    if (!/^[a-z0-9-]+$/.test(klipp.id)) {
      feil.push({
        kode: 'id/ugyldig',
        id: klipp.id,
        melding: `Id-en «${klipp.id}» må være små bokstaver, tall og bindestrek.`,
      })
    }

    if (!klipp.tekst.trim()) {
      feil.push({ kode: 'tekst/tom', id: klipp.id, melding: `«${klipp.id}» har ingen tekst.` })
    }

    // Et siffer i teksten betyr at stemmen gjetter uttalen. Tall skrives ut.
    if (/\d/.test(klipp.tekst)) {
      feil.push({
        kode: 'tekst/siffer',
        id: klipp.id,
        melding: `«${klipp.id}» inneholder siffer. Skriv tallet med bokstaver.`,
      })
    }
  }

  return feil
}

function validerLengder(): Innholdsfeil[] {
  const feil: Innholdsfeil[] = []

  for (const klipp of [...INTROER, ...AVSLUTNINGER]) {
    if (klipp.tekst.length > MAKS_TEGN_FRASE) {
      feil.push({
        kode: 'frase/forLang',
        id: klipp.id,
        melding: `«${klipp.id}» er ${klipp.tekst.length} tegn. Maks ${MAKS_TEGN_FRASE} — den skal ramme inn tallet, ikke skjule det.`,
      })
    }
  }

  for (const klipp of INNSLAG) {
    if (klipp.tekst.length > MAKS_TEGN_INNSLAG) {
      feil.push({
        kode: 'innslag/forLangt',
        id: klipp.id,
        melding: `«${klipp.id}» er ${klipp.tekst.length} tegn. Maks ${MAKS_TEGN_INNSLAG}, ellers tar det for lang tid.`,
      })
    }
  }

  return feil
}

function validerInnslag(): Innholdsfeil[] {
  const feil: Innholdsfeil[] = []

  for (const innslag of INNSLAG) {
    if (!KATEGORIER.includes(innslag.kategori)) {
      feil.push({
        kode: 'innslag/ukjentKategori',
        id: innslag.id,
        melding: `«${innslag.id}» har kategorien «${innslag.kategori}», som ikke finnes.`,
      })
    }

    if (innslag.tall !== null && (innslag.tall < 1 || innslag.tall > MAKS_TALL)) {
      feil.push({
        kode: 'innslag/ugyldigTall',
        id: innslag.id,
        melding: `«${innslag.id}» er knyttet til tallet ${innslag.tall}, som ikke finnes i noe format.`,
      })
    }

    feil.push(...validerKilde(innslag))
  }

  return feil
}

/**
 * Fakta krever kilde; alt annet krever fravær av kilde.
 *
 * Den andre halvdelen er like viktig som den første: en oppdiktet historie med
 * en kildehenvisning ser ut som noe man kan slå opp, og det er nettopp den
 * forvekslingen §8 ber oss unngå.
 */
function validerKilde(innslag: Innslag): Innholdsfeil[] {
  if (innslag.kategori === 'fakta') {
    return innslag.kilde?.trim()
      ? []
      : [
          {
            kode: 'fakta/utenKilde',
            id: innslag.id,
            melding: `«${innslag.id}» er et faktum uten kilde. Legg til kilde, eller gjør det om til en historie.`,
          },
        ]
  }

  return innslag.kilde
    ? [
        {
          kode: 'innslag/unødvendigKilde',
          id: innslag.id,
          melding: `«${innslag.id}» er ikke et faktum, men har kilde. Da ser det ut som noe man kan slå opp.`,
        },
      ]
    : []
}

/** Alle frasegrupper skal ha nok å velge mellom til at variasjonen merkes. */
export function fraseAntall() {
  return {
    introer: INTROER.length,
    avslutninger: AVSLUTNINGER.length,
    system: SYSTEMFRASER.length,
    varianter: VARIANTKLIPP.length,
    innslag: INNSLAG.length,
    totalt: FRASEKLIPP.length,
  }
}
