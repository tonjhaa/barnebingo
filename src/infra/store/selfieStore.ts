import { randomBytes } from 'node:crypto'

/**
 * Selfier lever i prosessminnet og dør med rommet. Ingen disk, ingen backup,
 * ingen permanent URL (§25). Referansen er tilfeldig, så en URL kan ikke gjettes.
 */
export interface StoredSelfie {
  roomId: string
  contentType: string
  bytes: Buffer
  createdAt: number
}

export const MAX_SELFIE_BYTES = 300 * 1024
export const ALLOWED_SELFIE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export type SelfieType = (typeof ALLOWED_SELFIE_TYPES)[number]

/**
 * Filsignaturer. Vi stoler ikke på hva klienten kaller filen — et bilde skal
 * være et bilde fordi de første bytene sier det, ikke fordi noen påstod det
 * i en header (§25).
 */
const MAGIC: Record<SelfieType, (bytes: Buffer) => boolean> = {
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) =>
    b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/webp': (b) =>
    b.subarray(0, 4).toString('ascii') === 'RIFF' &&
    b.subarray(8, 12).toString('ascii') === 'WEBP',
}

export interface SelfieProblem {
  code: string
  message: string
}

export function validateSelfie(
  bytes: Buffer,
  contentType: string,
): SelfieProblem | null {
  if (!ALLOWED_SELFIE_TYPES.includes(contentType as SelfieType)) {
    return { code: 'selfie/type', message: 'Bare vanlige bildefiler er lov.' }
  }
  if (bytes.length === 0) {
    return { code: 'selfie/empty', message: 'Bildet var tomt.' }
  }
  if (bytes.length > MAX_SELFIE_BYTES) {
    return { code: 'selfie/tooBig', message: 'Bildet var for stort.' }
  }
  if (bytes.length < 16 || !MAGIC[contentType as SelfieType](bytes)) {
    return { code: 'selfie/notAnImage', message: 'Dette så ikke ut som et bilde.' }
  }
  return null
}

export class SelfieStore {
  private items = new Map<string, StoredSelfie>()

  put(params: {
    roomId: string
    contentType: string
    bytes: Buffer
    now: number
  }): string {
    const ref = randomBytes(24).toString('base64url')
    this.items.set(ref, {
      roomId: params.roomId,
      contentType: params.contentType,
      bytes: params.bytes,
      createdAt: params.now,
    })
    return ref
  }

  /** Krever rom-id: en referanse alene gir ikke tilgang på tvers av rom. */
  get(ref: string, roomId: string): StoredSelfie | undefined {
    const item = this.items.get(ref)
    return item && item.roomId === roomId ? item : undefined
  }

  remove(ref: string): void {
    this.items.delete(ref)
  }

  removeRoom(roomId: string): number {
    let removed = 0
    for (const [ref, item] of this.items) {
      if (item.roomId === roomId) {
        this.items.delete(ref)
        removed++
      }
    }
    return removed
  }

  get size(): number {
    return this.items.size
  }
}
