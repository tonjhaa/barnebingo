# Eksterne ressurser

Skrevet av `npm run assets` fra `src/content/assets.ts`. Ikke rediger her.

## Hentet utenfra

| Id | Fil | Skaper | Lisens | Kommersielt | Hentet |
| --- | --- | --- | --- | --- | --- |
| skrift-archivo | src/app/layout.tsx (next/font) | Omnibus-Type | SIL Open Font License 1.1 | ja | 2026-07-30 |
| skrift-familjen-grotesk | src/app/layout.tsx (next/font) | Göran Söderström | SIL Open Font License 1.1 | ja | 2026-07-30 |

- **skrift-archivo**: https://fonts.google.com/specimen/Archivo
- **skrift-familjen-grotesk**: https://fonts.google.com/specimen/Familjen+Grotesk

## Laget i prosjektet

| Id | Fil | Skaper | Lisens | Kommersielt | Laget |
| --- | --- | --- | --- | --- | --- |
| stemme-programleder | public/lyd/*.mp3 | Barnebingo (tekstene) og valgt TTS-leverandør (syntesen) | Se leverandørens vilkår. Tekstene er prosjektets egne. | ja | 2026-07-31 |
| effekter | public/lyd/effekt/*.wav | Barnebingo | CC0-1.0 | ja | 2026-07-31 |
| musikk-bakgrunn | public/lyd/musikk/bakgrunn.wav | Barnebingo | CC0-1.0 | ja | 2026-07-31 |

## Begrensninger

- **stemme-programleder**: Stemmen er syntetisk og etterligner ingen virkelig person. Sjekk leverandørens vilkår før kommersiell bruk — de varierer.
- **skrift-archivo**: Skriften kan ikke selges alene.
- **skrift-familjen-grotesk**: Skriften kan ikke selges alene.

## Slik legger du til en ressurs

Prosessen står i ARKITEKTUR.md §14. Kort fortalt: finn ressursen,
kontroller lisensen, last den ned manuelt, legg den i `public/`, og
registrer den i `src/content/assets.ts`. Kjør så `npm run assets`.

Ikke bygg en nedlaster. Ikke bruk noe med uklar lisens.
