import { PROGRAMLEDER_INSTRUKSJON, type LeverandørId, type Stemmeoppsett } from './provider'

/**
 * Hvem programlederen er.
 *
 * Stemme-id-en står her, ikke i spillmotoren (§1). Skal en annen stemme prøves,
 * settes `TTS_VOICE` og klippene genereres på nytt — ingen kode endres.
 *
 * Standardstemmen er valgt for dette prosjektet etter beskrivelsen under. Den
 * er syntetisk og etterligner ingen virkelig person — det er et krav, ikke en
 * tilfeldighet.
 */

/** Beskrivelsen som ble brukt da stemmen ble valgt. Dokumentasjon, ikke kode. */
export const STEMMEBESKRIVELSE =
  'An original Norwegian male game-show host, approximately 35 to 45 years old. ' +
  'Warm, charismatic, energetic and highly engaging. Native Norwegian Bokmål ' +
  'pronunciation with exceptionally clear articulation of numbers, letters and ' +
  'Norwegian names. Rich and confident studio voice. Creates excitement and ' +
  'anticipation like the host of a family television game show. Friendly and ' +
  'understandable for young children, entertaining for adults, expressive ' +
  'without shouting, and never exaggerated or cartoonish.'

const STANDARDSTEMME: Record<LeverandørId, { stemme: string; modell: string }> = {
  // Flash v2.5 er den eneste ElevenLabs-modellen som kjenner norsk. Den er
  // raskere og litt mindre uttrykksfull enn multilingual v2, men den siste
  // kjenner ikke språket og faller tilbake på svensk og dansk — og leser
  // «fire» som det engelske ordet. Riktig språk slår marginal uttrykkskraft.
  elevenlabs: { stemme: '4kCDY3HJwvO7Zp3con83', modell: 'eleven_flash_v2_5' },
  openai: { stemme: 'onyx', modell: 'gpt-4o-mini-tts' },
  azure: { stemme: 'nb-NO-FinnNeural', modell: 'neural' },
  google: { stemme: 'nb-NO-Wavenet-D', modell: 'wavenet' },
}

/** Bare de variablene vi faktisk leser. Gjør oppsettet enkelt å teste. */
export type Miljø = Partial<Record<string, string | undefined>>

function erLeverandør(verdi: string | undefined): verdi is LeverandørId {
  return verdi === 'elevenlabs' || verdi === 'openai' || verdi === 'azure' || verdi === 'google'
}

export function stemmeoppsett(env: Miljø = process.env): Stemmeoppsett {
  const leverandør: LeverandørId = erLeverandør(env.TTS_PROVIDER)
    ? env.TTS_PROVIDER
    : 'elevenlabs'
  const standard = STANDARDSTEMME[leverandør]

  return {
    leverandør,
    stemme: env.TTS_VOICE ?? standard.stemme,
    modell: env.TTS_MODEL ?? standard.modell,
    språk: env.TTS_LANGUAGE ?? 'nb-NO',
    instruksjon: env.TTS_INSTRUCTIONS ?? PROGRAMLEDER_INSTRUKSJON,
    fart: env.TTS_SPEED ? Number(env.TTS_SPEED) : undefined,
  }
}
