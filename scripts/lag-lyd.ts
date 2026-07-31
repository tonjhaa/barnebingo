/**
 * Genererer programlederens lydklipp.
 *
 *     ELEVENLABS_API_KEY=... npm run lyd
 *     TTS_PROVIDER=openai OPENAI_API_KEY=... npm run lyd
 *     npm run lyd -- --navn Ada,Bo        # legg til nye spillernavn
 *     npm run lyd -- --sjekk              # si hva som mangler, uten å lage noe
 *
 * Klippene havner i `public/lyd/` og skal committes. Da er stemmen den samme på
 * alle skjermer, og appen trenger verken nøkkel eller nett i drift.
 *
 * Skriptet er trygt å kjøre om igjen: klipp som allerede finnes med riktig
 * stemmeoppsett hoppes over. Bytter du stemme, lages alt på nytt — det er
 * meningen, ellers ville halve kvelden hatt gammel stemme.
 */
import { join } from 'node:path'
import { alleKlipp } from '../src/content'
import { navnKlipp } from '../src/content/navn'
import type { Klipp } from '../src/content/typer'
import { lagLeverandør, NØKKELVARIABEL } from '../src/server/tts/leverandorer'
import { stemmeoppsett } from '../src/server/tts/stemme'
import { VoiceAssetService } from '../src/server/tts/VoiceAssetService'

const MAPPE = join(process.cwd(), 'public', 'lyd')

function flagg(navn: string): string | undefined {
  const i = process.argv.indexOf(`--${navn}`)
  return i === -1 ? undefined : process.argv[i + 1]
}

const barePrøv = process.argv.includes('--sjekk')
const ekstraNavn = (flagg('navn') ?? '')
  .split(',')
  .map((n) => n.trim())
  .filter(Boolean)

async function main(): Promise<void> {
  const oppsett = stemmeoppsett()
  const leverandør = lagLeverandør(oppsett)

  const klipp: Klipp[] = [...alleKlipp(), ...ekstraNavn.map(navnKlipp)]
  // Samme navn kan stå både i demolista og i --navn.
  const unike = [...new Map(klipp.map((k) => [k.id, k])).values()]

  const tjeneste = new VoiceAssetService(MAPPE, oppsett, leverandør)

  if (barePrøv) {
    const mangler: string[] = []
    for (const enkelt of unike) {
      if (!(await tjeneste.erOppdatert(enkelt))) mangler.push(enkelt.id)
    }
    console.log(`${unike.length} klipp totalt, ${mangler.length} mangler.`)
    if (mangler.length > 0) console.log(mangler.slice(0, 20).join(', '))
    process.exit(0)
  }

  if (!leverandør) {
    console.error(
      `Mangler nøkkel for ${oppsett.leverandør}. Sett ${NØKKELVARIABEL[oppsett.leverandør]}.\n`,
    )
    console.error('  ELEVENLABS_API_KEY=... npm run lyd')
    console.error('  TTS_PROVIDER=openai OPENAI_API_KEY=... npm run lyd\n')
    console.error('Appen kjører uten dette — da leser nettleserens egen stemme i stedet.')
    process.exit(1)
  }

  console.log(`Leverandør: ${leverandør.navn}`)
  console.log(`Stemme:     ${oppsett.stemme} (${oppsett.modell})`)
  console.log(`Klipp:      ${unike.length}\n`)

  const resultat = await tjeneste.sikreAlle(unike, (ferdig, av, id) => {
    process.stdout.write(`\r  ${ferdig}/${av}  ${id.padEnd(24)}`)
  })

  console.log(`\n\n${resultat.laget.length} nye, ${resultat.gjenbrukt.length} fantes fra før.`)

  if (resultat.feilet.length > 0) {
    console.log(`\n${resultat.feilet.length} feilet:`)
    for (const { id, feil } of resultat.feilet.slice(0, 10)) {
      console.log(`  ${id}: ${feil}`)
    }
    console.log('\nKjør på nytt for å ta resten. Det som gikk gjennom er lagret.')
    process.exit(1)
  }

  console.log('\nCommit public/lyd/, så følger stemmen med appen.')
}

void main()
