/**
 * Assetregisteret (§18).
 *
 * Hver fil som ikke er kode skal kunne spores tilbake til hvor den kom fra og
 * hva den får brukes til. Uten det er svaret på «kan vi legge dette ut?» et
 * gjett, og et gjett om lisens er et gjett man taper.
 *
 * Registeret er kilden. `npm run assets` skriver ATTRIBUTION.md,
 * THIRD_PARTY_ASSETS.md og assets/manifest.json ut fra det — dokumentene
 * redigeres aldri for hånd, så de kan ikke komme i utakt med virkeligheten.
 */

export const ASSETTYPER = ['lyd', 'musikk', 'effekt', 'stemme', 'grafikk', 'skrift'] as const
export type Assettype = (typeof ASSETTYPER)[number]

export interface Asset {
  /** Intern id. Brukes i manifestet og i koden som slår opp fila. */
  id: string
  /** Filnavn eller mappe, relativt til prosjektroten. */
  fil: string
  type: Assettype
  kategori: string
  kilde: string
  /** Der ressursen ble hentet, eller «egenprodusert» når den ikke ble hentet. */
  url: string | null
  skaper: string
  lisens: string
  /** Teksten som må stå i ATTRIBUTION.md, eller null når ingen kreves. */
  kreverKreditering: string | null
  /** ISO-dato. Egenproduserte filer har datoen de ble laget. */
  hentet: string
  kommersielt: boolean
  begrensninger: string | null
}

/**
 * Ingen av lydfilene er hentet utenfra.
 *
 * Det er et bevisst valg, ikke en mangel. §17 forbyr å laste ned vilkårlige
 * søketreff, og lisensen på en fil vi selv har regnet ut kan ikke være uklar.
 * Vil man heller ha Kenney eller Pixabay, legger man fila på samme sted og
 * legger til en post her — ingenting i koden trenger å endres.
 */
export const ASSETS: Asset[] = [
  {
    id: 'stemme-programleder',
    fil: 'public/lyd/*.mp3',
    type: 'stemme',
    kategori: 'Programlederens opplesning',
    kilde: 'Generert med en tekst-til-tale-tjeneste, se src/server/tts/',
    url: null,
    skaper: 'Barnebingo (tekstene) og valgt TTS-leverandør (syntesen)',
    lisens: 'Se leverandørens vilkår. Tekstene er prosjektets egne.',
    kreverKreditering: null,
    hentet: '2026-07-31',
    kommersielt: true,
    begrensninger:
      'Stemmen er syntetisk og etterligner ingen virkelig person. ' +
      'Sjekk leverandørens vilkår før kommersiell bruk — de varierer.',
  },
  {
    id: 'effekter',
    fil: 'public/lyd/effekt/*.wav',
    type: 'effekt',
    kategori: 'Knapp, trekk, markering, overgang, spenning, bingo, fanfare, applaus, konfetti, bom, nedtelling',
    kilde: 'Syntetisert av scripts/lag-effekter.ts',
    url: null,
    skaper: 'Barnebingo',
    lisens: 'CC0-1.0',
    kreverKreditering: null,
    hentet: '2026-07-31',
    kommersielt: true,
    begrensninger: null,
  },
  {
    id: 'musikk-bakgrunn',
    fil: 'public/lyd/musikk/bakgrunn.wav',
    type: 'musikk',
    kategori: 'Bakgrunnssløyfe under spill',
    kilde: 'Syntetisert av scripts/lag-effekter.ts',
    url: null,
    skaper: 'Barnebingo',
    lisens: 'CC0-1.0',
    kreverKreditering: null,
    hentet: '2026-07-31',
    kommersielt: true,
    begrensninger: null,
  },
  {
    id: 'skrift-archivo',
    fil: 'src/app/layout.tsx (next/font)',
    type: 'skrift',
    kategori: 'Tallene på hovedskjermen og brettene',
    kilde: 'Google Fonts, lastet ned ved bygg av next/font',
    url: 'https://fonts.google.com/specimen/Archivo',
    skaper: 'Omnibus-Type',
    lisens: 'SIL Open Font License 1.1',
    kreverKreditering: null,
    hentet: '2026-07-30',
    kommersielt: true,
    begrensninger: 'Skriften kan ikke selges alene.',
  },
  {
    id: 'skrift-familjen-grotesk',
    fil: 'src/app/layout.tsx (next/font)',
    type: 'skrift',
    kategori: 'Brødtekst og overskrifter',
    kilde: 'Google Fonts, lastet ned ved bygg av next/font',
    url: 'https://fonts.google.com/specimen/Familjen+Grotesk',
    skaper: 'Göran Söderström',
    lisens: 'SIL Open Font License 1.1',
    kreverKreditering: null,
    hentet: '2026-07-30',
    kommersielt: true,
    begrensninger: 'Skriften kan ikke selges alene.',
  },
]

/** Lisenser vi har bestemt oss for at er greie å bruke (§18). */
export const GODKJENTE_LISENSER = [
  'CC0-1.0',
  'CC-BY-4.0',
  'CC-BY-3.0',
  'SIL Open Font License 1.1',
  'MIT',
  'Public Domain',
]

export interface Assetfeil {
  id: string
  melding: string
}

/**
 * Kontrollerer registeret.
 *
 * Kjøres som en test. En asset uten skaper, uten dato eller med en lisens vi
 * ikke har tatt stilling til, skal stoppe byggingen — ikke bli oppdaget den
 * dagen noen spør.
 */
export function validerAssets(assets: Asset[] = ASSETS): Assetfeil[] {
  const feil: Assetfeil[] = []
  const sett = new Set<string>()

  for (const asset of assets) {
    if (sett.has(asset.id)) feil.push({ id: asset.id, melding: 'Id-en finnes to ganger.' })
    sett.add(asset.id)

    if (!asset.skaper.trim()) feil.push({ id: asset.id, melding: 'Mangler skaper.' })
    if (!asset.kilde.trim()) feil.push({ id: asset.id, melding: 'Mangler kilde.' })
    if (!asset.lisens.trim()) feil.push({ id: asset.id, melding: 'Mangler lisens.' })

    if (!/^\d{4}-\d{2}-\d{2}$/.test(asset.hentet)) {
      feil.push({ id: asset.id, melding: `Datoen «${asset.hentet}» er ikke på formen ÅÅÅÅ-MM-DD.` })
    }

    // En hentet fil må ha en URL. En egenprodusert skal ikke ha en.
    const egen = asset.url === null
    if (!egen && !/^https?:\/\//.test(asset.url!)) {
      feil.push({ id: asset.id, melding: `URL-en «${asset.url}» ser ikke ut som en adresse.` })
    }

    // Uklar lisens er den eneste feilen som faktisk kan koste noe (§18).
    const kjent =
      GODKJENTE_LISENSER.includes(asset.lisens) || asset.lisens.startsWith('Se leverandørens')
    if (!kjent) {
      feil.push({
        id: asset.id,
        melding: `Lisensen «${asset.lisens}» er ikke godkjent. Legg den til i GODKJENTE_LISENSER, eller bytt ut ressursen.`,
      })
    }
  }

  return feil
}

/** Assets som må krediteres. Grunnlaget for ATTRIBUTION.md. */
export function måKrediteres(assets: Asset[] = ASSETS): Asset[] {
  return assets.filter((asset) => asset.kreverKreditering !== null)
}

/** Assets hentet fra andre. Grunnlaget for THIRD_PARTY_ASSETS.md. */
export function fraTredjepart(assets: Asset[] = ASSETS): Asset[] {
  return assets.filter((asset) => asset.url !== null)
}
