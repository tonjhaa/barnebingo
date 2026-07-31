import type { Klipp } from './typer'

/**
 * Egne innledninger for enkelte tall (§7).
 *
 * Varianten står *foran* tallet og erstatter den vanlige introen — den skal
 * ramme inn tallet, ikke skjule det. Derfor står ingen av dem etter tallet, og
 * ingen av dem er lange: «Halvveis til hundre! Femti … fem null» virker, mens
 * en setning på ti ord til ville tatt oppmerksomheten fra selve opplesningen.
 *
 * Ikke alle tall trenger en variant. De som ikke har en, leses helt vanlig.
 */

/** tall → innledninger som kan brukes foran det tallet. */
export const TALLVARIANTER: ReadonlyMap<number, Klipp[]> = new Map([
  [1, [{ id: 'variant-1-1', tekst: 'Aller først ut:' }]],
  [3, [{ id: 'variant-3-1', tekst: 'Gode gamle' }]],
  [
    7,
    [
      { id: 'variant-7-1', tekst: 'Det kjente lykketallet' },
      { id: 'variant-7-2', tekst: 'Kanskje dette blir et lykketall i dag:' },
    ],
  ],
  [10, [{ id: 'variant-10-1', tekst: 'Første tall med to sifre:' }]],
  [11, [{ id: 'variant-11-1', tekst: 'To like:' }]],
  [12, [{ id: 'variant-12-1', tekst: 'Et helt dusin:' }]],
  [13, [{ id: 'variant-13-1', tekst: 'Noen kaller det uflaks. Vi kaller det' }]],
  [20, [{ id: 'variant-20-1', tekst: 'Rundt og fint:' }]],
  [
    21,
    [
      { id: 'variant-21-1', tekst: 'To og én står sammen og blir' },
      { id: 'variant-21-2', tekst: 'Da ble det' },
    ],
  ],
  [22, [{ id: 'variant-22-1', tekst: 'To små svaner:' }]],
  [30, [{ id: 'variant-30-1', tekst: 'En tredjedel av nitti:' }]],
  [33, [{ id: 'variant-33-1', tekst: 'To like igjen:' }]],
  [40, [{ id: 'variant-40-1', tekst: 'Førti ballonger og' }]],
  [
    50,
    [
      { id: 'variant-50-1', tekst: 'Halvveis til hundre!' },
      { id: 'variant-50-2', tekst: 'Et stort og rundt tall:' },
    ],
  ],
  [55, [{ id: 'variant-55-1', tekst: 'To like på rad:' }]],
  [60, [{ id: 'variant-60-1', tekst: 'Like mange som minutter i en time:' }]],
  [66, [{ id: 'variant-66-1', tekst: 'To like til:' }]],
  [70, [{ id: 'variant-70-1', tekst: 'Opp i høyden med' }]],
  [
    75,
    [
      { id: 'variant-75-1', tekst: 'Siste stopp i syttifem-bingo:' },
      { id: 'variant-75-2', tekst: 'Helt på toppen i syttifem-bingo:' },
    ],
  ],
  [77, [{ id: 'variant-77-1', tekst: 'To like, og begge er lykketall:' }]],
  [80, [{ id: 'variant-80-1', tekst: 'Godt oppe nå:' }]],
  [88, [{ id: 'variant-88-1', tekst: 'To like helt på tampen:' }]],
  [
    90,
    [
      { id: 'variant-90-1', tekst: 'Der kom det høyeste tallet:' },
      { id: 'variant-90-2', tekst: 'Helt på toppen av tallrekken:' },
    ],
  ],
])

export function variantFor(tall: number): Klipp[] {
  return TALLVARIANTER.get(tall) ?? []
}

export const VARIANTKLIPP: Klipp[] = [...TALLVARIANTER.values()].flat()
