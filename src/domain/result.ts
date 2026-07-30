/**
 * Domenet kaster ikke unntak for forventede avslag. En spiller som trykker på
 * feil tidspunkt er ikke en feil — det er et nei med en begrunnelse som skal
 * vises vennlig på en telefon.
 */
export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; code: string; message: string }

export function ok<T>(value: T): Result<T> {
  return { ok: true, value }
}

export function err<T = never>(code: string, message: string): Result<T> {
  return { ok: false, code, message }
}
