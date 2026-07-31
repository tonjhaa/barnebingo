import type { GameEvent, GameEventData } from './events'

/**
 * Hendelsesloggen.
 *
 * Rommet sender fulle øyeblikksbilder, ikke differ (ARKITEKTUR.md §6). Det er
 * riktig for tilstand, men lyd kan ikke utledes av tilstand alene: to
 * øyeblikksbilder på rad forteller ikke om spilleren rakk å bli klar og
 * frakoblet igjen imellom, og et gjentatt snapshot skal ikke lese opp tallet på
 * nytt. Derfor en logg med et monotont sekvensnummer ved siden av.
 *
 * Klienten husker høyeste `seq` den har hørt og spiller bare det som er nyere.
 * En hovedskjerm som kobler seg til midt i en runde hopper rett til slutten i
 * stedet for å lese opp de siste tjue tallene i full fart.
 */

/**
 * Hvor mange hendelser som holdes. Nok til at en kort nettverksglipp ikke
 * mister noe, lite nok til at et rom som lever i seks timer ikke vokser.
 */
export const MAX_EVENTS = 40

export interface EventLog {
  events: GameEvent[]
  /** Siste utdelte sekvensnummer. Starter på null, så første hendelse blir 1. */
  seq: number
}

export function createEventLog(): EventLog {
  return { events: [], seq: 0 }
}

export function appendEvent(log: EventLog, data: GameEventData, now: number): GameEvent {
  const event: GameEvent = { seq: ++log.seq, at: now, data }
  log.events.push(event)
  if (log.events.length > MAX_EVENTS) {
    log.events.splice(0, log.events.length - MAX_EVENTS)
  }
  return event
}

/** Alt som er nyere enn `seq`. Tom liste når mottakeren er à jour. */
export function eventsSince(log: EventLog, seq: number): GameEvent[] {
  return log.events.filter((event) => event.seq > seq)
}
