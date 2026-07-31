import { FRASEKLIPP } from './fraser'
import { NAVNEKLIPP } from './navn'
import { TALLKLIPP } from './tall'
import { VARIANTKLIPP } from './tallvarianter'
import type { Klipp } from './typer'

/**
 * Alt som skal genereres, ett sted.
 *
 * Genereringsskriptet leser denne lista og ingenting annet. Legger man til en
 * replikk i en innholdsfil, blir den med automatisk; fjerner man en, blir den
 * stående som en fil ingen spør etter, og valideringen sier fra.
 */
export function alleKlipp(): Klipp[] {
  return [...TALLKLIPP, ...FRASEKLIPP, ...VARIANTKLIPP, ...NAVNEKLIPP]
}

/** Oppslag id → klipp, for validering og for utviklingspanelet. */
export function klippEtterId(): Map<string, Klipp> {
  return new Map(alleKlipp().map((klipp) => [klipp.id, klipp]))
}

export type { Klipp }
export * from './typer'
