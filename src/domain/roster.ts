/**
 * Fast spillerliste. Spilleren «velger navn» ved å ta en ledig plass her (§16),
 * ikke ved å skrive fritekst — det holder navnene korte, kjente og trygge, og
 * fjerner hele klassen av problemer med upassende eller doble navn.
 */
export const ROSTER = [
  { name: 'Klara', color: '#e0457b', avatarId: 'rev' },
  { name: 'Edvin', color: '#2f7ed8', avatarId: 'ugle' },
  { name: 'Reodor', color: '#f2a03d', avatarId: 'pinnsvin' },
  { name: 'Pernilla', color: '#3fa14a', avatarId: 'frosk' },
] as const

export type PlayerName = (typeof ROSTER)[number]['name']

export const ROSTER_NAMES: readonly PlayerName[] = ROSTER.map((slot) => slot.name)

export function rosterSlot(name: PlayerName) {
  const slot = ROSTER.find((s) => s.name === name)
  if (!slot) throw new Error(`Ukjent spiller: ${name}`)
  return slot
}

export function isRosterName(value: string): value is PlayerName {
  return ROSTER_NAMES.includes(value as PlayerName)
}
