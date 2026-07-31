import { join } from 'node:path'
import { navnKlipp, navnKlippId } from '@/content/navn'
import { log } from '@/infra/logger'
import { lagLeverandør } from './leverandorer'
import { stemmeoppsett } from './stemme'
import { VoiceAssetService } from './VoiceAssetService'

/**
 * Navneklipp på forespørsel.
 *
 * Spillerne skriver navnene sine selv, så de kan ikke ligge ferdig generert.
 * To regler holder dette forsvarlig:
 *
 *   – Generering skjer i lobbyen, aldri under en runde. Ventetiden på et API
 *     ville ellers blitt hørbar akkurat der tallet skulle komme.
 *   – Verten må be om det. Uten det sier programlederen «Én spiller til er
 *     klar» i stedet, og ingen barns navn forlater maskinen (§21, K3).
 *
 * Det eneste som sendes er fornavnet. Ikke romkode, ikke spiller-id, ikke
 * IP-adresse, ikke bilde.
 */

export const LYDMAPPE = join(process.cwd(), 'public', 'lyd')

export class Navnelyd {
  private readonly oppsett = stemmeoppsett()
  private readonly tjeneste: VoiceAssetService
  /**
   * Navn vi vet har klipp. Holdes i minnet fordi den slås opp ved hvert
   * øyeblikksbilde, og et filsystemkall per snapshot ville vært sløsing.
   */
  private klare = new Set<string>()
  private lastet: Promise<void>

  constructor(mappe: string = LYDMAPPE) {
    this.tjeneste = new VoiceAssetService(mappe, this.oppsett, lagLeverandør(this.oppsett))
    this.lastet = this.last()
  }

  /** Er det i det hele tatt mulig å lage nye klipp her? */
  get kanGenerere(): boolean {
    return lagLeverandør(this.oppsett) !== null
  }

  private async last(): Promise<void> {
    this.klare = await this.tjeneste.genererteIder()
  }

  /**
   * Navnene som ennå ikke kan leses opp. Synkront, siden det leses av hvert
   * øyeblikksbilde. Før manifestet er lest er svaret «alle mangler», og det er
   * riktig svar: vi vet ennå ikke om noen finnes.
   */
  utenKlipp(navn: string[]): string[] {
    return navn.filter((n) => !this.klare.has(navnKlippId(n)))
  }

  harKlipp(navn: string): boolean {
    return this.klare.has(navnKlippId(navn))
  }

  /**
   * Lager klipp for navnene som mangler. Returnerer navnene som fikk stemme.
   * Feil håndteres som fravær av klipp: replikken blir navnefri, og spillet
   * går videre.
   */
  async lag(navn: string[]): Promise<string[]> {
    await this.lastet
    const mangler = this.utenKlipp(navn)
    if (mangler.length === 0) return []

    const resultat = await this.tjeneste.sikreAlle(mangler.map(navnKlipp))
    for (const id of [...resultat.laget, ...resultat.gjenbrukt]) this.klare.add(id)

    if (resultat.feilet.length > 0) {
      log.warn('klarte ikke å lage navnelyd', {
        antall: resultat.feilet.length,
        første: resultat.feilet[0]?.feil,
      })
    }
    return mangler.filter((n) => this.klare.has(navnKlippId(n)))
  }
}
