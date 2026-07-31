import type { Klipp } from './typer'

/**
 * Innslagene mellom tallene (§8).
 *
 * De er korte, snille og uten spissformuleringer. Et innslag skal fylle en
 * pause, ikke lage en. Blir det for langt, mister barna tråden i selve spillet,
 * og da har det gjort motsatt av jobben sin.
 *
 * Fantasifortellingene er tydelig oppdiktede. Det er et bevisst valg framfor
 * «morsomme fakta»: et faktum må kunne dokumenteres, og en pingvin som glemte
 * tusjen sin trenger ingen kilde.
 */

export const KATEGORIER = [
  'historie',
  'ordlek',
  'vits',
  'gåte',
  'oppgave',
  'fakta',
] as const
export type Kategori = (typeof KATEGORIER)[number]

export interface Innslag extends Klipp {
  kategori: Kategori
  /** Tallet innslaget hører til, eller null når det passer når som helst. */
  tall: number | null
  /**
   * Kilde. Påkrevd for kategorien «fakta» og forbudt ellers — en oppdiktet
   * historie skal ikke se ut som noe man kan slå opp (§8, §20).
   */
  kilde?: string
}

/** Tallhistorier. Alle er oppdiktet, og skal høres slik ut. */
const HISTORIER: Innslag[] = [
  {
    id: 'hist-3',
    tall: 3,
    kategori: 'historie',
    tekst:
      'Tre små pingviner gikk på bingo. Den første hadde brett, den andre hadde tusj, ' +
      'og den tredje hadde glemt begge deler.',
  },
  {
    id: 'hist-7',
    tall: 7,
    kategori: 'historie',
    tekst:
      'Sju er programlederens hemmelige lykketall. Det er ikke bevist, men han nekter ' +
      'å gi det fra seg.',
  },
  {
    id: 'hist-12',
    tall: 12,
    kategori: 'historie',
    tekst:
      'Tolv ender stilte seg i kø. Ingen visste hvorfor, men de var svært fornøyde med ' +
      'rekkefølgen.',
  },
  {
    id: 'hist-21',
    tall: 21,
    kategori: 'historie',
    tekst:
      'Tjueen små roboter prøvde å rope bingo samtidig. Det hørtes mest ut som en ' +
      'ødelagt brødrister.',
  },
  {
    id: 'hist-40',
    tall: 40,
    kategori: 'historie',
    tekst:
      'Førti ballonger fløy av gårde. Programlederen hevder fortsatt at han hadde full ' +
      'kontroll.',
  },
  {
    id: 'hist-50',
    tall: 50,
    kategori: 'ordlek',
    tekst: 'Femti er halvveis til hundre, men heldigvis ikke halvveis til neste tall.',
  },
  {
    id: 'hist-75',
    tall: 75,
    kategori: 'ordlek',
    tekst: 'Syttifem er siste stopp i syttifem-bingo. Alle av på venstre side.',
  },
  {
    id: 'hist-90',
    tall: 90,
    kategori: 'ordlek',
    tekst:
      'Nitti er det høyeste tallet i nitti-bingo. Høyere kommer vi ikke uten å bygge ' +
      'en ny etasje.',
  },
  {
    id: 'hist-13',
    tall: 13,
    kategori: 'historie',
    tekst:
      'Tretten katter mente de var uheldige. Så fant de en solplett, og ombestemte seg.',
  },
  {
    id: 'hist-33',
    tall: 33,
    kategori: 'historie',
    tekst:
      'Trettitre snegler la ut på tur. De regner med å være framme en gang til høsten.',
  },
  {
    id: 'hist-60',
    tall: 60,
    kategori: 'ordlek',
    tekst: 'Seksti sekunder blir ett minutt. Seksti bingobrett blir et ganske stort bord.',
  },
  {
    id: 'hist-88',
    tall: 88,
    kategori: 'historie',
    tekst:
      'Åttiåtte bier holdt møte om hvem som lagde mest bråk. Møtet ble svært bråkete.',
  },
]

/** Vitser. Kontrollert for at de faktisk fungerer på norsk. */
const VITSER: Innslag[] = [
  {
    id: 'vits-1',
    tall: null,
    kategori: 'vits',
    tekst: 'Hva kaller man en bjørn uten tenner? En bamse.',
  },
  {
    id: 'vits-2',
    tall: null,
    kategori: 'vits',
    tekst: 'Hvorfor tok blyanten pause? Den var helt utslitt.',
  },
  {
    id: 'vits-3',
    tall: 8,
    kategori: 'vits',
    tekst: 'Hva sa null til åtte? Fint belte!',
  },
  {
    id: 'vits-4',
    tall: 7,
    kategori: 'vits',
    // Fungerer på norsk fordi «sju åtte ni» høres ut som «sju spiste ni».
    tekst: 'Hvorfor var seks redd for sju? Fordi sju åtte ni.',
  },
  {
    id: 'vits-5',
    tall: null,
    kategori: 'vits',
    tekst: 'Hva sier en bingokule når den er sliten? Ingenting. Den ruller bare videre.',
  },
]

/** Gåter. Svaret kommer i samme klipp, så ingen blir sittende og lure. */
const GÅTER: Innslag[] = [
  {
    id: 'gate-1',
    tall: null,
    kategori: 'gåte',
    tekst:
      'Hva blir våtere jo mer det tørker? Et håndkle. Det er også det eneste som blir ' +
      'flinkere av å bli vått.',
  },
  {
    id: 'gate-2',
    tall: null,
    kategori: 'gåte',
    tekst:
      'Hva har mange tall, men kan ikke telle? Et bingobrett. Det er derfor det har ' +
      'dere med seg.',
  },
]

/**
 * Publikumsoppgaver. Alle skal kunne gjøres sittende, innendørs, uten å hente
 * noe og uten at noen konkurrerer om å være raskest eller sterkest (§8).
 */
const OPPGAVER: Innslag[] = [
  { id: 'oppg-1', tall: null, kategori: 'oppgave', tekst: 'Kan alle klappe tre ganger?' },
  {
    id: 'oppg-2',
    tall: null,
    kategori: 'oppgave',
    tekst: 'Vis med fingrene hvor mange rader vi spiller om.',
  },
  {
    id: 'oppg-3',
    tall: null,
    kategori: 'oppgave',
    tekst: 'Kan alle peke på det største tallet på brettet sitt?',
  },
  {
    id: 'oppg-4',
    tall: null,
    kategori: 'oppgave',
    tekst: 'Gi sidemannen en stille high five.',
  },
  {
    id: 'oppg-5',
    tall: null,
    kategori: 'oppgave',
    tekst: 'Hvem klarer å sitte helt stille til neste tall kommer?',
  },
  {
    id: 'oppg-6',
    tall: null,
    kategori: 'oppgave',
    tekst: 'Strekk armene over hodet, og la dem falle ned igjen.',
  },
]

/**
 * Fakta.
 *
 * Med vilje er det få av dem. Et faktum uten kilde er et rykte, og en
 * bingokveld trenger ikke rykter — en oppdiktet historie gjør samme nytten og
 * lyver ikke om å være sann (§8).
 */
const FAKTA: Innslag[] = [
  {
    id: 'fakta-1',
    tall: 90,
    kategori: 'fakta',
    tekst: 'I nitti-talls bingo har hvert ark seks brett, og de deler alle nitti tallene.',
    kilde: 'Formatets egne regler, se ARKITEKTUR.md §9 K11.',
  },
  {
    id: 'fakta-2',
    tall: 75,
    kategori: 'fakta',
    tekst: 'I syttifem-bingo har hver bokstav sitt eget tallområde. B har de laveste.',
    kilde: 'Formatets egne regler, se src/domain/formats/bingo75.ts.',
  },
]

export const INNSLAG: Innslag[] = [
  ...HISTORIER,
  ...VITSER,
  ...GÅTER,
  ...OPPGAVER,
  ...FAKTA,
]

/** Innslag knyttet til et bestemt tall. */
export function innslagFor(tall: number): Innslag[] {
  return INNSLAG.filter((innslag) => innslag.tall === tall)
}

/** Innslag som passer når som helst. */
export const FRITTSTÅENDE: Innslag[] = INNSLAG.filter((innslag) => innslag.tall === null)

export const HISTORIEKLIPP: Klipp[] = INNSLAG.map(({ id, tekst }) => ({ id, tekst }))
