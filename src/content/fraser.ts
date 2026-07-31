import type { Klipp } from './typer'

/**
 * Programlederens faste replikker.
 *
 * Alt ligger som data, ikke i komponenter. Skal en formulering endres, endres
 * den her og genereres på nytt — ingen kode røres. Det er også dette som gjør
 * det mulig å legge til et tema eller et språk senere uten å skrive om
 * lydsystemet.
 *
 * Introene og avslutningene er korte med vilje. De skal ramme inn tallet, ikke
 * konkurrere med det: barnet som leter på brettet har allerede nok å holde
 * styr på.
 */

/** Korte innledninger foran et trukket tall (§6). */
export const INTROER: Klipp[] = [
  { id: 'intro-1', tekst: 'Neste tall er' },
  { id: 'intro-2', tekst: 'Da fortsetter vi med' },
  { id: 'intro-3', tekst: 'Og nå kommer' },
  { id: 'intro-4', tekst: 'Vi har trukket' },
  { id: 'intro-5', tekst: 'Følg godt med' },
  { id: 'intro-6', tekst: 'Da ser vi hva som kommer' },
  { id: 'intro-7', tekst: 'Neste kule gir oss' },
  { id: 'intro-8', tekst: 'Her kommer det' },
  { id: 'intro-9', tekst: 'Da ble det' },
  { id: 'intro-10', tekst: 'Klar for neste?' },
  { id: 'intro-11', tekst: 'Øynene på brettet' },
  { id: 'intro-12', tekst: 'Nå må dere følge med' },
  { id: 'intro-13', tekst: 'Og nummeret er' },
  { id: 'intro-14', tekst: 'Da går vi videre til' },
  { id: 'intro-15', tekst: 'Neste mulighet er' },
]

/** Korte avslutninger etter et trukket tall (§6). Brukes ikke hver gang. */
export const AVSLUTNINGER: Klipp[] = [
  { id: 'slutt-1', tekst: 'Har noen det?' },
  { id: 'slutt-2', tekst: 'Se nøye på brettet.' },
  { id: 'slutt-3', tekst: 'Kanskje det var ditt tall.' },
  { id: 'slutt-4', tekst: 'Da markerer vi.' },
  { id: 'slutt-5', tekst: 'Følg med videre.' },
  { id: 'slutt-6', tekst: 'Nærmer noen seg bingo?' },
  { id: 'slutt-7', tekst: 'Det kan bli viktig.' },
  { id: 'slutt-8', tekst: 'Vi fortsetter.' },
  { id: 'slutt-9', tekst: 'Da er det registrert.' },
  { id: 'slutt-10', tekst: 'Kanskje noen fikk en ny markering.' },
  { id: 'slutt-11', tekst: 'Hold på spenningen.' },
  { id: 'slutt-12', tekst: 'Neste tall kommer snart.' },
]

/**
 * Systemreplikker. Ett id-navn per situasjon, med flere varianter der det er
 * naturlig å variere. Alle er navnefrie — navn settes sammen ved avspilling,
 * fordi spillerne skriver navnene sine selv (§21, K3).
 */
export const SYSTEMFRASER: Klipp[] = [
  // Lobby
  { id: 'sys-velkommen-1', tekst: 'Velkommen til bingo!' },
  { id: 'sys-velkommen-2', tekst: 'Finn telefonene og gjør dere klare.' },
  { id: 'sys-blemed-1', tekst: 'er med!' },
  { id: 'sys-blemed-2', tekst: 'har tatt plass.' },
  { id: 'sys-klar-1', tekst: 'er klar!' },
  { id: 'sys-klar-2', tekst: 'er på plass.' },
  { id: 'sys-enklartil', tekst: 'Én spiller til er klar.' },
  { id: 'sys-mangler-en', tekst: 'Nå mangler vi bare én spiller.' },
  { id: 'sys-alleklare', tekst: 'Alle er klare!' },
  { id: 'sys-spennende', tekst: 'Dette kan bli spennende.' },
  { id: 'sys-noen-blemed', tekst: 'En spiller til er med!' },

  // Før start
  { id: 'sys-velkommen-navn', tekst: 'Velkommen,' },
  { id: 'sys-finnfrem', tekst: 'Finn frem brettene og gjør dere klare.' },
  { id: 'sys-folgmed', tekst: 'Husk å følge godt med på tallene.' },
  { id: 'sys-trykkbingo', tekst: 'Når du mener du har riktig resultat, trykker du BINGO.' },
  { id: 'sys-starter', tekst: 'Da starter vi! Lykke til!' },

  // Premiestadier. Navngis etter indeks, siden etikettene varierer med format.
  { id: 'sys-stadium-0', tekst: 'Nå spiller vi om én full rad.' },
  { id: 'sys-stadium-1', tekst: 'Da går vi videre til to hele rader.' },
  { id: 'sys-stadium-2', tekst: 'Nå gjelder det tre hele rader.' },
  { id: 'sys-stadium-fullt', tekst: 'Nå spiller vi om fullt brett.' },
  { id: 'sys-beholdmarkeringer', tekst: 'Markeringene beholdes. Vi fortsetter på samme brett.' },

  // Noen trykket BINGO
  { id: 'sys-bingotrykk-1', tekst: 'Oi! Noen har trykket BINGO.' },
  { id: 'sys-bingotrykk-2', tekst: 'Stopp trekningen. Nå kontrollerer vi brettet.' },
  { id: 'sys-bingotrykk-3', tekst: 'har trykket BINGO. La oss se om det stemmer.' },
  { id: 'sys-kontrollerer', tekst: 'Hold på spenningen mens vi kontrollerer.' },

  // Gyldig bingo
  { id: 'sys-godkjent-1', tekst: 'Det stemmer!' },
  { id: 'sys-godkjent-2', tekst: 'Riktig!' },
  { id: 'sys-godkjent-3', tekst: 'Fantastisk!' },
  { id: 'sys-harbingo', tekst: 'har bingo!' },
  { id: 'sys-gratulerer', tekst: 'Gratulerer!' },
  { id: 'sys-avslutning-flott', tekst: 'For en avslutning!' },
  { id: 'sys-applaus', tekst: 'Gi vinneren en stor applaus!' },
  { id: 'sys-vivinner', tekst: 'Vi har en vinner!' },

  // Ugyldig bingo. Vennlig, uten straff (§9).
  { id: 'sys-bom-1', tekst: 'Ikke helt ennå, men du er kanskje veldig nær.' },
  { id: 'sys-bom-2', tekst: 'Godt forsøk! Vi fortsetter.' },
  { id: 'sys-bom-3', tekst: 'Det mangler fortsatt litt på brettet.' },
  { id: 'sys-bom-4', tekst: 'Ingen fare. Behold markeringene og følg med videre.' },
  { id: 'sys-bom-5', tekst: 'Nesten! Neste tall kan bli viktig.' },

  // Pause og tilkobling
  { id: 'sys-pause', tekst: 'Vi tar en liten pause.' },
  { id: 'sys-fortsetter', tekst: 'Spillet fortsetter straks.' },
  { id: 'sys-venter', tekst: 'Vi venter litt mens en spiller kobler seg til igjen.' },
  { id: 'sys-tilbake', tekst: 'Der er forbindelsen tilbake. Da fortsetter vi.' },

  // Slutt
  { id: 'sys-takk-1', tekst: 'Takk for en flott bingorunde!' },
  { id: 'sys-foretspill', tekst: 'For et spill!' },
  { id: 'sys-gratulerer-alle', tekst: 'Gratulerer til alle vinnerne.' },
  { id: 'sys-nyrunde', tekst: 'Er dere klare for en ny runde?' },
  { id: 'sys-takkfordag', tekst: 'Takk for i dag, og velkommen tilbake til bingo!' },
  { id: 'sys-tomkule', tekst: 'Der var alle tallene trukket.' },
]

/** Oppslag på id. Kastet av valideringen hvis en id ikke finnes. */
export const FRASER_ETTER_ID: ReadonlyMap<string, Klipp> = new Map(
  [...INTROER, ...AVSLUTNINGER, ...SYSTEMFRASER].map((klipp) => [klipp.id, klipp]),
)

export function frase(id: string): Klipp {
  const funnet = FRASER_ETTER_ID.get(id)
  if (!funnet) throw new Error(`Ukjent frase: ${id}`)
  return funnet
}

/** Alle faste fraser, for genereringsskriptet og valideringen. */
export const FRASEKLIPP: Klipp[] = [...INTROER, ...AVSLUTNINGER, ...SYSTEMFRASER]
