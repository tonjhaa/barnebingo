# Barnebingo

Bingo for hele familien. Hovedskjermen står på TV-en og trekker tallene; hver
spiller har sitt eget brett på telefonen. Hver spiller skriver navnet sitt
selv, og det er plass til seks.

Arkitektur, regelavklaringer og faseplan: **[ARKITEKTUR.md](./ARKITEKTUR.md)**

## Kom i gang

```bash
npm install
npm run certs    # én gang — gir HTTPS, som Safari krever for kamera
npm run dev
```

Serveren skriver ut to adresser. Åpne den første på TV-en eller PC-en, og la
telefonene skanne QR-koden som dukker opp når du åpner lobbyen.

Uten sertifikat kjører appen fint på HTTP (`npm run dev:http`), men da er selfie
utilgjengelig i Safari og spillerne bruker avatarer i stedet.

### Sertifikat på iPhone

`npm run certs` krever `mkcert`, som installeres med `brew install mkcert nss`.

Når appen kjører på HTTPS, starter den også en liten hjelpeserver på porten
over — adressen skrives ut ved oppstart og står på hovedskjermen i lobbyen.
Åpne den på telefonen, trykk **Last ned sertifikatet**, og følg de tre stegene
der. Én gang per telefon.

Hjelpeserveren går bevisst på ren HTTP: telefonen kan ikke hente sertifikatet
over en tilkobling den ikke stoler på ennå. Den deler bare ut den offentlige
CA-filen, aldri den private nøkkelen, og kjenner verken romkoder eller spillere.

### På en ny maskin

```bash
git clone git@github.com:tonjhaa/barnebingo.git
cd barnebingo
npm install
npm run certs    # bare hvis du vil ha kamera lokalt
npm run dev
```

Alt annet følger med i repoet — programlederens 259 lydklipp, lydeffektene og
musikken ligger i `public/lyd/` og er sjekket inn. Ingen API-nøkkel trengs for å
spille, bare for å lage nye klipp.

To ting ligger bevisst **ikke** i git, fordi de hører til maskinen og ikke til
prosjektet:

- `certs/` — det lokale HTTPS-sertifikatet. Lages med `npm run certs`.
- `.env.local` — API-nøkler. Trengs bare når du genererer ny lyd.

Har du lagt til et navn eller en replikk, sier `npm run lyd -- --sjekk` hva som
mangler lydfil. Kjør `npm run lyd` og commit `public/lyd/`, ellers får de andre
maskinene teksten uten stemmen.

## Slik spiller dere

1. **Verten** åpner forsiden og trykker *Lag nytt spillrom*.
2. **Oppsettet** velger spill og nivå. Alt annet kan finjusteres, men trenger
   ikke røres — nivåene er ferdig satt opp.
3. **Lobbyen** viser en QR-kode og en firetegns romkode. Telefonene skanner
   eller skriver koden.
4. **Hver spiller** skriver navnet sitt, tar en selfie eller beholder dyret
   appen ga hen, og trykker *Jeg er klar*.
5. **Verten** starter, og trekker tall — eller lar appen gjøre det.
6. **Premiene** deles ut ett stadium om gangen. Spillet står stille på
   premieskjermen til verten trykker videre, så det er tid til å hente premien.

Reglene kan endres fra lobbyen. Da må alle melde seg klare på nytt, så ingen
starter på premisser de ikke har sett.

## I produksjon

```bash
npm run build
npm start        # NODE_ENV=production, HTTPS hvis certs/ finnes
```

Appen er bygget for ett hjem og én kveld. All spilltilstand lever i
prosessminnet: rommet dør etter seks timer, eller etter tretti minutter uten
aktivitet. Starter du serveren på nytt, er rommet borte — det er med vilje.

Skal appen kjøre for flere familier samtidig, eller overleve en omstart, er
`RoomStore` i `src/infra/store/roomStore.ts` det eneste stedet som må byttes.
Grensesnittet er laget for en Redis-adapter, men v1 har den ikke: den ville vært
kode uten en bruker.

Socket.IO trenger en varm, langlevd prosess. Serverless-plattformer som skalerer
til null er derfor feil verktøy her — Fly.io, Render eller en maskin i stua er
riktig.

### På Fly.io

`Dockerfile` og `fly.toml` ligger klare:

```bash
flyctl auth login
flyctl launch --copy-config --no-deploy   # første gang
flyctl deploy
```

Oppsettet kjører **én maskin som aldri stopper**. Rommene bor i minnet, så en
maskin som sovner eller en ekstra instans ville betydd at halve familien havnet
i et rom den andre halvparten ikke ser.

Fly lager likevel en ekstra maskin for høy tilgjengelighet ved første deploy.
Den må vekk:

```bash
flyctl scale count 1
```

`PUBLIC_URL` i `fly.toml` er adressen QR-koden peker på. Uten den ville den
pekt på containerens interne IP. Bytt den hvis appen får et annet navn.

Med ekte HTTPS i kanten virker kameraet uten videre — ingen mkcert, ingen
profil på telefonene. Sertifikathjelperen starter ikke da, fordi den ikke trengs.

`GET /api/health` svarer med status, antall aktive rom og oppetid. Den sier
ingenting om hvem som spiller.

## Personvern

Appen er laget for barn, og lagrer så lite som mulig:

- Ingen kontoer, ingen sporing, ingen annonser, ingen søkbare rom.
- Selfier ligger i prosessminnet, aldri på disk, og slettes når rommet dør.
  Serveren sender dem med `Cache-Control: no-store`.
- Ingen ansiktsgjenkjenning eller bildeanalyse. Bildet er et bilde.
- Spillernavn skrives av spillerne selv og lever bare så lenge rommet gjør.
  Maks tolv tegn, bokstaver og tall — nok til et fornavn, ikke til en historie.
- Vertsnøkkel og gjenopprettingsnøkler havner aldri i en URL, bare i
  telefonens `localStorage`.
- Til stemmetjenesten sendes bare teksten som skal leses. Ikke romkode, ikke
  spiller-id, ikke IP-adresse, ikke bilder. Spillernavn sendes bare hvis verten
  uttrykkelig ber om det i lobbyen; ellers sier programlederen «én spiller til
  er klar» i stedet. Se [LYD.md](LYD.md) §9.

## Kommandoer

| Kommando | Hva den gjør |
|---|---|
| `npm run dev` | Utviklingsserver med HTTPS hvis sertifikat finnes |
| `npm run dev:http` | Samme, men tvunget til HTTP |
| `npm run build` | Produksjonsbygg |
| `npm start` | Produksjonsserver |
| `npm test` | Enhets- og integrasjonstester |
| `npm run test:e2e` | Playwright, ende-til-ende i Chromium |
| `npm run test:e2e -- --project=webkit` | Lydtestene i Safaris motor |
| `npm run typecheck` | TypeScript uten emit |
| `npm run lint` | ESLint |
| `npm run certs` | Lager lokalt HTTPS-sertifikat med mkcert |
| `npm run lyd` | Genererer programlederens klipp (krever API-nøkkel) |
| `npm run lyd -- --sjekk` | Sier hva som mangler, uten nøkkel |
| `npm run effekter` | Syntetiserer lydeffekter og musikk |
| `npm run assets` | Skriver ATTRIBUTION.md og THIRD_PARTY_ASSETS.md |

## Programlederen

En norsk gameshowvert leder spillet fra hovedskjermen. Han leser tallene slik en
bingovert gjør — «Tjueen … to en», «B tolv … en to» — kommenterer det som skjer,
og slipper inn en kort historie når det er rom for det.

```bash
ELEVENLABS_API_KEY=... npm run lyd
```

248 klipp, kjøres én gang og committes. En hel setning settes sammen av flere
klipp ved avspilling, så variasjonen blir kombinatorisk uten at filmengden blir
det.

Uten nøkkel leser nettleserens egen stemme den samme teksten. Den er tydelig
dårligere, og finnes bare så appen aldri er stum. Uansett står det som sies også
skrevet på skjermen.

Verten styrer alt bak tannhjulet på hovedskjermen: hvor mye programlederen
legger seg i, om historiene er med, musikk, lydeffekter, tempo og opplesning for
de yngste. Alt kan skrus av.

Detaljene, inkludert personvern og hvordan man bytter stemmeleverandør, står i
**[LYD.md](LYD.md)**.

## Hvordan koden er delt opp

```
src/domain/    Bingoregler og lydregi. Ingen I/O, ingen klokke, ingen
               tilfeldighet utenfra.
src/content/   Alt programlederen kan si, som data.
src/server/    Kommandoer, autorisasjon, tilstandsutsending, stemmesyntese.
src/infra/     Socket.IO, lagring, rate limiting, opprydding.
src/shared/    Zod-skjema for alt som går over ledningen.
src/ui/        Hovedskjerm og mobil.
src/app/       Next.js-ruter.
```

Serveren er autoritativ. Klienten sender intensjon («jeg vil markere 42»), aldri
resultat («jeg har bingo»). Spillmotoren kjenner ingen bingoformater — den leser
en regelprofil, og formatene er fabrikker som lager slike profiler.

Domenelaget kalles aldri `Date.now()` eller `Math.random()` direkte; klokke og
tilfeldighet kommer inn utenfra. Det er derfor en hel runde kan spilles om igjen
i en test ved å gjenbruke seeden.

## Status

Alle åtte fasene i ARKITEKTUR.md §11 er ferdige.

**Fase 1** — rom, romkode, QR, sanntid, fire spillerplasser, klar-status,
frakobling og reconnect.

**Fase 2** — vertens oppsett: alle tre formatene, fire vanskelighetsgrader,
1–3 brett, markering, vinnermodus, premiestadier, trekkemodus og hjelpemidler.

**Fase 3** — brettgenerering for alle tre formatene, 1–3 brett per spiller,
trekkmotor uten duplikater, manuell og automatisk trekking, pause.

**Fase 4** — markering med servervalidering, BINGO-knapp med vindu for samtidige
vinnere, automatisk og assistert vinnermodus, premiestadier og premievisning.

**Fase 5** — E2E med Playwright: én hovedskjerm og fire telefoner, hver i sin
egen nettleserkontekst.

**Fase 6** — selfie: kamera, komprimering på telefonen, midlertidig lagring og
automatisk sletting. Avatar er et likeverdig valg, ikke en plassholder.

**Fase 7** — stabilitet: trekkingen stopper når hovedskjermen mister nettet, pen
nedstenging, helsesjekk, og tester for rate limiting og samtidige hendelser.

**Fase 8** — tallopplesning på norsk, produksjonsbygg, TV-layout og denne
dokumentasjonen.

### Etterarbeid

**Ny runde og resultatskjerm** — når runden er over viser hovedskjermen hvem som
vant hvert stadium og hvor mange premier hver har fått i kveld. `Spill en runde
til` gir nye brett til de samme spillerne; premiene teller videre.

**Assistert markering** — «Med hint» lyser opp ruta med det trukne tallet til
den er krysset av. Den markerer ikke selv; barnet skal fortsatt trykke.

**Programleder, musikk og lydeffekter** — en norsk gameshowvert leser tallene
(«Tjueen … to en»), kommenterer spillet og slipper inn korte historier når det
er rom for det. Musikken dempes mens han snakker. Alt kan skrus av, og appen
fungerer uten AI-tjeneste. Se [LYD.md](LYD.md).

**Ark i 90-formatet** — brettene lages som ekte bingoark: seks brett som deler
alle 90 tallene mellom seg, hvert tall nøyaktig én gang. Verten velger 1–3 **ark**
per spiller, ikke enkeltbrett, og hvert ark har alle tallene for seg. Telefonen
tegner arket som én sammenhengende blokk med riss imellom, og man scroller
nedover i stedet for å bla mellom faner. De to andre formatene deler ut brett
for brett som før — arket er en egenskap ved formatet, ikke ved motoren.

**Vertsgodkjent overtakelse** — en telefon som er borte for godt kommer tilbake
ved at spilleren trykker på sitt eget navn og verten sier ja. Gjenopprettings-
nøkkelen byttes ut, så den gamle telefonen mister tilgangen.

### Ikke gjort

- **Testing på ekte iPhone.** All mobiltesting er gjort med iPhone-emulering i
  Chromium. Kamera og `localStorage` bør prøves på en faktisk telefon før
  premieren, og det krever HTTPS-sertifikatet over.
- **Redis.** Se «I produksjon» over.
- **Én E2E-test for sluttbildet.** Resultatskjermen og ny runde er dekket av
  elleve integrasjonstester og verifisert manuelt i nettleser, men E2E-testen
  som spilte en hel runde gjennom grensesnittet var ustabil i full kjøring og
  ble tatt ut. Se ARKITEKTUR.md §12.
