import {
  PROGRAMLEDER_INSTRUKSJON,
  TtsFeil,
  type LeverandørId,
  type Stemmeoppsett,
  type Talebestilling,
  type TextToSpeechProvider,
} from './provider'
import type { Miljø } from './stemme'

/**
 * Adapterne.
 *
 * Hver av dem gjør én ting: oversetter en bestilling til leverandørens format
 * og gir tilbake mp3-bytes. Ingen av dem vet hva teksten handler om, og ingen
 * av dem får se noe annet enn teksten som skal leses (§21).
 *
 * ElevenLabs står først fordi målet er en uttrykksfull norsk gameshowstemme,
 * og det er der de norske stemmene har mest liv. De tre andre finnes fordi
 * valget skal kunne omgjøres uten at noe annet endres.
 */

async function lesFeil(svar: Response): Promise<string> {
  try {
    return (await svar.text()).slice(0, 300)
  } catch {
    return svar.statusText
  }
}

export class ElevenLabsProvider implements TextToSpeechProvider {
  readonly id = 'elevenlabs' as const
  readonly navn = 'ElevenLabs'
  readonly format = 'mp3' as const

  constructor(private readonly nøkkel: string) {}

  async syntetiser({ tekst, oppsett }: Talebestilling): Promise<Buffer> {
    const språk = elevenlabsSpråk(oppsett.modell, oppsett.språk)

    const svar = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(oppsett.stemme)}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: { 'xi-api-key': this.nøkkel, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: tekst,
          model_id: oppsett.modell,
          ...(språk ? { language_code: språk } : {}),
          voice_settings: {
            stability: 0.45,
            similarity_boost: 0.75,
            // Litt stil gir liv til opplesningen uten å gjøre den teatralsk.
            style: 0.35,
            use_speaker_boost: true,
          },
        }),
      },
    )
    if (!svar.ok) throw new TtsFeil(this.id, svar.status, await lesFeil(svar))
    return Buffer.from(await svar.arrayBuffer())
  }
}

export class OpenAiProvider implements TextToSpeechProvider {
  readonly id = 'openai' as const
  readonly navn = 'OpenAI Text-to-Speech'
  readonly format = 'mp3' as const

  constructor(private readonly nøkkel: string) {}

  async syntetiser({ tekst, oppsett }: Talebestilling): Promise<Buffer> {
    const svar = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.nøkkel}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: oppsett.modell,
        voice: oppsett.stemme,
        input: tekst,
        instructions: oppsett.instruksjon ?? PROGRAMLEDER_INSTRUKSJON,
        response_format: 'mp3',
        speed: oppsett.fart ?? 1,
      }),
    })
    if (!svar.ok) throw new TtsFeil(this.id, svar.status, await lesFeil(svar))
    return Buffer.from(await svar.arrayBuffer())
  }
}

export class AzureProvider implements TextToSpeechProvider {
  readonly id = 'azure' as const
  readonly navn = 'Microsoft Azure AI Speech'
  readonly format = 'mp3' as const

  constructor(
    private readonly nøkkel: string,
    private readonly region: string,
  ) {}

  async syntetiser({ tekst, oppsett }: Talebestilling): Promise<Buffer> {
    // Azure vil ha SSML. Teksten kommer fra innholdsfilene våre, men escapes
    // uansett — et spillernavn er data, ikke markup (§20).
    const ssml =
      `<speak version="1.0" xml:lang="${oppsett.språk}">` +
      `<voice name="${oppsett.stemme}">` +
      `<prosody rate="${oppsett.fart ?? 1}">${escapeXml(tekst)}</prosody>` +
      `</voice></speak>`

    const svar = await fetch(
      `https://${this.region}.tts.speech.microsoft.com/cognitiveservices/v1`,
      {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': this.nøkkel,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': 'audio-24khz-96kbitrate-mono-mp3',
        },
        body: ssml,
      },
    )
    if (!svar.ok) throw new TtsFeil(this.id, svar.status, await lesFeil(svar))
    return Buffer.from(await svar.arrayBuffer())
  }
}

export class GoogleProvider implements TextToSpeechProvider {
  readonly id = 'google' as const
  readonly navn = 'Google Cloud Text-to-Speech'
  readonly format = 'mp3' as const

  constructor(private readonly nøkkel: string) {}

  async syntetiser({ tekst, oppsett }: Talebestilling): Promise<Buffer> {
    const svar = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(this.nøkkel)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { text: tekst },
          voice: { languageCode: oppsett.språk, name: oppsett.stemme },
          audioConfig: { audioEncoding: 'MP3', speakingRate: oppsett.fart ?? 1 },
        }),
      },
    )
    if (!svar.ok) throw new TtsFeil(this.id, svar.status, await lesFeil(svar))
    const data = (await svar.json()) as { audioContent?: string }
    if (!data.audioContent) {
      throw new TtsFeil(this.id, svar.status, 'Svaret manglet audioContent')
    }
    return Buffer.from(data.audioContent, 'base64')
  }
}

/**
 * Språkkoden ElevenLabs vil ha, eller null når modellen ikke tar imot noen.
 *
 * To ting skiller seg fra resten av prosjektet, og begge er ElevenLabs' egne
 * regler: koden skal være ISO 639-1 med to bokstaver («nb»), ikke en lokalitet
 * («nb-NO»), og `eleven_multilingual_v2` godtar den ikke i det hele tatt — den
 * gjenkjenner språket fra teksten selv.
 *
 * Vi lagrer likevel «nb-NO» internt, siden det er det de andre tre
 * leverandørene vil ha. Oversettelsen hører hjemme her, hos den som har det
 * avvikende kravet.
 */
export function elevenlabsSpråk(modell: string, språk: string): string | null {
  if (modell.includes('multilingual')) return null
  return språk.split('-')[0].toLowerCase()
}

export function escapeXml(tekst: string): string {
  return tekst
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** Miljøvariabelen hver leverandør leser nøkkelen sin fra. */
export const NØKKELVARIABEL: Record<LeverandørId, string> = {
  elevenlabs: 'ELEVENLABS_API_KEY',
  openai: 'OPENAI_API_KEY',
  azure: 'AZURE_SPEECH_KEY',
  google: 'GOOGLE_TTS_API_KEY',
}

/**
 * Bygger leverandøren fra miljøet. Returnerer null når nøkkelen mangler —
 * det er en normal tilstand, ikke en feil: appen skal kjøre uten nøkkel så
 * lenge klippene allerede er generert (§2).
 */
export function lagLeverandør(
  oppsett: Stemmeoppsett,
  env: Miljø = process.env,
): TextToSpeechProvider | null {
  const nøkkel = env[NØKKELVARIABEL[oppsett.leverandør]]
  if (!nøkkel) return null

  switch (oppsett.leverandør) {
    case 'elevenlabs':
      return new ElevenLabsProvider(nøkkel)
    case 'openai':
      return new OpenAiProvider(nøkkel)
    case 'azure':
      return new AzureProvider(nøkkel, env.AZURE_SPEECH_REGION ?? 'westeurope')
    case 'google':
      return new GoogleProvider(nøkkel)
  }
}
