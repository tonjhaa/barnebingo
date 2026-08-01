# Lyd, stemme og programleder

Hvordan lyden i Barnebingo er bygget, og hvorfor den er bygget slik.

Spillmotoren er urørt. Den kjenner ingen lydfiler og ingen replikker — den sier
bare hva som skjedde, og lydsystemet bestemmer resten.

---

## 1. Grunnprinsippet: fakta inn, replikk ut

Serveren sender fulle øyeblikksbilder av tilstanden (ARKITEKTUR.md §6). Det er
riktig for tilstand, men lyd kan ikke utledes av tilstand alene: to like
øyeblikksbilder forteller ikke om noe skjedde imellom, og et gjentatt snapshot
skal ikke lese opp tallet på nytt.

Derfor ligger det en **hendelseslogg** ved siden av tilstanden.

```
Spillmotor  →  GameEvent (fakta, med seq)  →  SpeechDirector  →  Utspill  →  Lydkø
                                           ↘  StoryDirector   ↗
```

Hendelsene er fakta, ikke instruksjoner: `numberDrawn`, ikke `playDrawSound`.
Det er dette skillet som gjør at man kan skru av lyden, bytte språk eller
bytte stemmeleverandør uten å røre bingoreglene.

Hendelsene sendes bare til hovedskjermen. Telefonene er stille (§13).

---

## 2. Modulene

| Modul | Ansvar | Hvor |
| --- | --- | --- |
| `GameEvent` | Hva som skjedde, med prioritet | `src/domain/audio/events.ts` |
| `EventLog` | Monoton sekvens, begrenset lengde | `src/domain/audio/log.ts` |
| `Lydkø` | Ett spor, prioritet, avbrudd | `src/domain/audio/queue.ts` |
| `SpeechDirector` | Hendelse → replikk, norske tallregler, variasjon | `src/domain/audio/speech.ts` |
| `StoryDirector` | Når det passer med et innslag | `src/domain/audio/story.ts` |
| `Lydinnstillinger` | Vertens valg | `src/domain/audio/settings.ts` |
| `AudioDirector` | Binder alt sammen, styrer musikk og effekter | `src/ui/audio/AudioDirector.ts` |
| `Filstemme` / `Nettleserstemme` | Avspilling, med reserve | `src/ui/audio/stemmer.ts` |
| `MusicManager` / `SoundEffectManager` | Musikk, ducking, effekter | `src/ui/audio/musikk.ts` |
| `TextToSpeechProvider` | Leverandøruavhengig syntese | `src/server/tts/provider.ts` |
| `VoiceAssetService` | Generering og innholdsbasert cache | `src/server/tts/VoiceAssetService.ts` |
| `Navnelyd` | Spillernavn på forespørsel | `src/server/tts/navnelyd.ts` |

Alt som kan sies ligger som **data** i `src/content/`, aldri i komponenter.

---

## 3. Programlederen

En original, syntetisk mannsstemme i 35–45-årsalderen. Den etterligner ingen
virkelig person — det er et krav, ikke en tilfeldighet.

Beskrivelsen som ble brukt ved valg av stemme står i
`src/server/tts/stemme.ts` som `STEMMEBESKRIVELSE`. Stemme-id-en ligger i
konfigurasjon, ikke i koden:

```bash
TTS_PROVIDER=elevenlabs   # elevenlabs | openai | azure | google
TTS_VOICE=...             # leverandørens stemme-id
TTS_MODEL=...
TTS_LANGUAGE=nb-NO
```

Prøv flere stemmer før du velger: generer med én, hør på `public/lyd/tall-7.mp3`
og `public/lyd/sys-starter.mp3`, slett mappa og prøv neste.

---

## 4. Slik leses tallene

Reglene ligger i `SpeechDirector` og er testet tall for tall.

**Ensifret** — tallet, så gjentatt:

> Sju … nummer sju.

**Tosifret** — hele tallet, så sifrene:

> Tjueen … to en.
> Femtiåtte … fem åtte.
> Sytti … sju null.

**75-formatet** — bokstaven i tillegg, foran eller etter etter vertens valg:

> B tolv … en to.

**90-formatet** — ingen bokstav, siden formatet ikke har noen.

Tallene skrives alltid ut med bokstaver før de sendes til stemmetjenesten. En
syntese som får «21» gjetter — noen ganger «tjueen», noen ganger «to en», og på
engelsk hvis den er uheldig. `én` (tallet) og `en` (sifferet) er to forskjellige
klipp, fordi de har ulikt trykk på norsk.

---

## 5. Variasjon uten gjentakelse

Hvert utspill bygges som **pynt foran – tallet – tallet igjen – pynt bak**.
Bare den midterste delen er obligatorisk, og det er derfor pynten trygt kan
variere.

- 15 innledninger, 12 avslutninger, 24 tallspesifikke varianter
- Nylig brukte fraser sperres, så samme formulering ikke gjentas
- Aldri samme innledning to ganger på rad
- Færre kommentarer sent i runden, når spenningen har tatt over
- Tilfeldigheten er seedbar, så en hel runde kan reproduseres i test

Uansett hvilken pynt som velges, er det hele tallet alltid med. Det er testet
med 300 trekk på rad.

---

## 6. Historier og innslag

`StoryDirector` har tre svar, og de to første er de vanligste: nei, ikke nå,
eller ja.

Et innslag kommer **aldri**:

- ved en kritisk hendelse (bingo ropt, bingo avgjort, runden ferdig)
- når noen er nær bingo
- oftere enn vertens valgte frekvens tillater
- to ganger i samme runde

Kategoriene er historie, ordlek, vits, gåte, oppgave og fakta. Fantasihistorier
er tydelig oppdiktede. **Fakta krever kilde** — og motsatt: en oppdiktet
historie får ikke ha kilde, for da ser den ut som noe man kan slå opp.

Oppgavene skal kunne gjøres sittende, innendørs, uten å hente noe og uten at
noen konkurrerer om å være raskest. Det er validert.

---

## 7. Musikk og lydeffekter

Musikken dempes til 25 % mens programlederen snakker og glir tilbake etterpå.
Et brått volumfall høres like galt ut som musikk over tale.

Effektene er syntetisert av `scripts/lag-effekter.ts`, ikke lastet ned. Det gjør
lisensen vår egen og holder §17 om at ingenting hentes ukontrollert. De er
bevisst milde: ingen skarpe transienter, og lyden for feil bingo sier «ikke
ennå», ikke «feil».

Fanfaren er reservert fullt brett. Kom kveldens største lyd fire ganger, ville
den ikke betydd noe den siste.

Vil du heller bruke Kenney eller Pixabay: legg fila i `public/lyd/effekt/` med
samme navn og registrer den i `src/content/assets.ts`. Ingenting i koden
trenger å endres.

---

## 8. Vertens valg

Bak tannhjulet på hovedskjermen, der man hører resultatet med én gang.

| Valg | Alternativer |
| --- | --- |
| Programleder | av · bare tall · tall og meldinger · fullt gameshow |
| Opplesningsnivå | enkel · variert · gameshow · rolig |
| Tallopplesning | helt tall · tall og sifre · bokstav, tall og sifre |
| Bokstav | før tallet · etter tallet · ingen |
| Historier | av · sjelden · normal · ofte |
| Musikk | av · lav · normal |
| Lydeffekter | av · lav · normal |
| Tempo | rolig · normalt · raskt |
| Hjelp til barn | gjenta tallet |
| Spillernavn | si navnene · uten navn |

To snarveier: **Vanlig gameshow** og **Rolig læringsmodus**. Læringsmodus tar
vekk alt som konkurrerer med tallet — ingen historier, ingen musikk, rolig
tempo, tallet gjentatt.

Alt kan skrus av. Det er ikke en høflighet, men et krav: en bingokveld skal
kunne spilles i stillhet, og en femåring som blir overveldet skal kunne få
lyden vekk uten at spillet endres.

---

## 9. Personvern

Bare **teksten** som skal leses sendes til stemmeleverandøren. Ikke romkode,
ikke spiller-id, ikke IP-adresse, ikke bilder.

Spillernavn er det eneste personopplysningen som kan sendes, og det skjer bare
når verten trykker **«Les inn navnene»** i lobbyen. Uten det formulerer
programlederen seg navnefritt: «Én spiller til er klar.» Ingenting går tapt ut
over litt personlighet.

Navn genereres aldri under en runde. Ventetiden på et API ville blitt hørbar
akkurat der tallet skulle komme.

Nøklene leses bare på serveren og ligger i miljøvariabler. Ingen
leverandørkode importeres av noe som ender opp i nettleseren.

---

## 10. Uten AI-tjeneste

Appen fungerer i tre tilstander, i denne rekkefølgen:

1. **Klippene er generert** — den ekte stemmen, lik på alle skjermer, uten nett
   og uten nøkkel i drift.
2. **Klippene mangler** — nettleserens egen talesyntese leser den samme teksten.
   Tydelig dårligere, og det er meningen: appen skal aldri være stum under
   utvikling.
3. **Ingen lyd i det hele tatt** — underteksten står på skjermen uansett.

Reserven er **per klipp**, ikke per replikk. Mangler bare navneklippet, sies
resten med den ekte stemmen og navnet med maskinens.

Ingen lydfeil kan stoppe bingospillet. Det er testet.

---

## 11. Kommandoer

```bash
npm run lyd -- --sjekk        # hva mangler? Ingen nøkkel nødvendig
npm run lyd                   # generer alle klipp (krever nøkkel)
npm run lyd -- --navn Ada,Bo  # legg til spillernavn
npm run effekter              # syntetiser lydeffekter og musikk
npm run assets                # skriv ATTRIBUTION.md og THIRD_PARTY_ASSETS.md
npm test                      # alle enhets- og integrasjonstester
npm run test:e2e              # ende-til-ende, inkludert lyd
npm run dev                   # lokalt på HTTPS
```

Genereringen er trygg å kjøre om igjen: klipp som finnes med riktig
stemmeoppsett hoppes over. Bytter du stemme, lages alt på nytt — ellers ville
halve kvelden hatt gammel stemme og halve ny.

`public/lyd/` skal committes. Da følger stemmen med appen.

---

## 12. Klippene

248 klipp til sammen, generert med ElevenLabs og committet i `public/lyd/`:

| Gruppe | Antall | Eksempel |
| --- | --- | --- |
| Hele tall 1–90 | 90 | `tall-58` → «Femtiåtte» |
| Sifre 0–9 | 10 | `siffer-0` → «null» |
| «nummer N» 1–9 | 9 | `nummer-7` → «nummer sju» |
| B–I–N–G–O | 5 | `bokstav-b` → «B» |
| Innledninger | 15 | `intro-1` → «Neste tall er» |
| Avslutninger | 12 | `slutt-3` → «Kanskje det var ditt tall.» |
| Systemreplikker | 51 | `sys-starter` → «Da starter vi! Lykke til!» |
| Tallvarianter | 24 | `variant-50-1` → «Halvveis til hundre!» |
| Innslag | 27 | `hist-3`, `vits-4`, `oppg-1` |
| Demonavn | 4 | `navn-klara` → «Klara» |

Hvert klipp er **en id og en tekst**. Samme liste brukes av genereringsskriptet
og av avspillingen, så de kan ikke komme i utakt. Teksten brukes også til
teksting og til nettleserstemmen.

En full setning settes sammen av flere klipp ved avspilling. Det er derfor 248
filer holder til kombinatorisk variasjon i stedet for titusenvis.
