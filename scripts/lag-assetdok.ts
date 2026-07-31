/**
 * Skriver lisensdokumentasjonen ut fra assetregisteret.
 *
 *     npm run assets
 *
 * Dokumentene redigeres aldri for hånd. Gjorde man det, ville de sagt noe annet
 * enn registeret, og da er de verdiløse som svar på «hva får vi bruke dette
 * til?». Registeret er kilden; disse filene er utskrifter av det.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ASSETS, fraTredjepart, måKrediteres, validerAssets } from '../src/content/assets'

const ROT = process.cwd()

function attribution(): string {
  const krediteres = måKrediteres()

  return [
    '# Kreditering',
    '',
    'Skrevet av `npm run assets` fra `src/content/assets.ts`. Ikke rediger her.',
    '',
    krediteres.length === 0
      ? 'Ingen av ressursene i Barnebingo krever kreditering. Lyd, musikk og\n' +
        'lydeffekter er laget i prosjektet; skriftene er under åpne lisenser uten\n' +
        'krav om navngivelse.'
      : krediteres
          .map((asset) => `- **${asset.kategori}** — ${asset.kreverKreditering}`)
          .join('\n'),
    '',
    '## Skriftene',
    '',
    ...ASSETS.filter((a) => a.type === 'skrift').map(
      (a) => `- ${a.id.replace('skrift-', '')} av ${a.skaper}, ${a.lisens}`,
    ),
    '',
  ].join('\n')
}

function tredjepart(): string {
  const eksterne = fraTredjepart()
  const egne = ASSETS.filter((asset) => asset.url === null)

  const rad = (a: (typeof ASSETS)[number]) =>
    `| ${a.id} | ${a.fil} | ${a.skaper} | ${a.lisens} | ${a.kommersielt ? 'ja' : 'nei'} | ${a.hentet} |`

  return [
    '# Eksterne ressurser',
    '',
    'Skrevet av `npm run assets` fra `src/content/assets.ts`. Ikke rediger her.',
    '',
    '## Hentet utenfra',
    '',
    eksterne.length === 0
      ? 'Ingen.'
      : [
          '| Id | Fil | Skaper | Lisens | Kommersielt | Hentet |',
          '| --- | --- | --- | --- | --- | --- |',
          ...eksterne.map(rad),
          '',
          ...eksterne.map((a) => `- **${a.id}**: ${a.url}`),
        ].join('\n'),
    '',
    '## Laget i prosjektet',
    '',
    '| Id | Fil | Skaper | Lisens | Kommersielt | Laget |',
    '| --- | --- | --- | --- | --- | --- |',
    ...egne.map(rad),
    '',
    '## Begrensninger',
    '',
    ...ASSETS.filter((a) => a.begrensninger).map(
      (a) => `- **${a.id}**: ${a.begrensninger}`,
    ),
    '',
    '## Slik legger du til en ressurs',
    '',
    'Prosessen står i ARKITEKTUR.md §14. Kort fortalt: finn ressursen,',
    'kontroller lisensen, last den ned manuelt, legg den i `public/`, og',
    'registrer den i `src/content/assets.ts`. Kjør så `npm run assets`.',
    '',
    'Ikke bygg en nedlaster. Ikke bruk noe med uklar lisens.',
    '',
  ].join('\n')
}

async function main(): Promise<void> {
  const feil = validerAssets()
  if (feil.length > 0) {
    console.error('Assetregisteret har feil:\n')
    for (const { id, melding } of feil) console.error(`  ${id}: ${melding}`)
    process.exit(1)
  }

  await writeFile(join(ROT, 'ATTRIBUTION.md'), attribution())
  await writeFile(join(ROT, 'THIRD_PARTY_ASSETS.md'), tredjepart())

  await mkdir(join(ROT, 'assets'), { recursive: true })
  await writeFile(
    join(ROT, 'assets', 'manifest.json'),
    `${JSON.stringify({ versjon: 1, assets: ASSETS }, null, 2)}\n`,
  )

  console.log(`${ASSETS.length} ressurser registrert.`)
  console.log('  ATTRIBUTION.md')
  console.log('  THIRD_PARTY_ASSETS.md')
  console.log('  assets/manifest.json')
}

void main()
