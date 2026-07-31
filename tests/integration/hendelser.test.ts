import { describe, expect, it } from 'vitest'
import type { GameEvent, GameEventData, GameEventKind } from '@/domain/audio/events'
import { C, E, type HostView } from '@/shared/protocol'
import { setupHarness, startRound, watch, type Lobby } from './harness'

/**
 * Hendelsesstrømmen som lydsystemet lever av.
 *
 * Poenget med disse testene er ikke hva programlederen sier — det avgjøres
 * lenger ute — men at spillet i det hele tatt forteller hva som skjedde, i
 * riktig rekkefølge, og bare når det faktisk skjedde.
 */
const h = setupHarness()

const KIDS = { format: 'kids', difficulty: 'enkel', drawMode: 'manual' }

function kinds(view: HostView): GameEventKind[] {
  return view.events.map((event) => event.data.kind)
}

function finn<K extends GameEventKind>(
  view: HostView,
  kind: K,
): Extract<GameEventData, { kind: K }> | undefined {
  const treff = view.events.filter((event): event is GameEvent => event.data.kind === kind)
  return treff.at(-1)?.data as Extract<GameEventData, { kind: K }> | undefined
}

async function siste(lobby: Lobby, kind: GameEventKind): Promise<HostView> {
  return lobby.state.until((view) => kinds(view).includes(kind))
}

describe('hendelser fra spillet', () => {
  it('sier fra når lobbyen åpnes og noen blir med', async () => {
    const lobby = await h.createLobby(KIDS)
    await h.joinAs(lobby, 'Ada')

    const view = await siste(lobby, 'playerJoined')
    expect(kinds(view)).toContain('roomOpened')
    expect(finn(view, 'playerJoined')?.name).toBe('Ada')
  })

  it('teller klare spillere, og sier fra når alle er det', async () => {
    const lobby = await h.createLobby(KIDS)
    const ada = await h.joinAs(lobby, 'Ada')
    const bo = await h.joinAs(lobby, 'Bo')

    await h.expectOk(ada.socket, C.playerSetReady, { ...ada.auth, ready: true })
    const halvveis = await siste(lobby, 'playerReady')
    expect(finn(halvveis, 'playerReady')).toMatchObject({
      name: 'Ada',
      readyCount: 1,
      playerCount: 2,
    })
    expect(kinds(halvveis)).not.toContain('allReady')

    await h.expectOk(bo.socket, C.playerSetReady, { ...bo.auth, ready: true })
    const alle = await siste(lobby, 'allReady')
    expect(finn(alle, 'allReady')?.playerCount).toBe(2)
  })

  it('navngir spillerne når runden starter', async () => {
    const lobby = await h.createLobby(KIDS)
    const ada = await h.joinAs(lobby, 'Ada')
    const bo = await h.joinAs(lobby, 'Bo')

    await startRound(h, lobby, [ada, bo])

    const view = await siste(lobby, 'roundStarted')
    const start = finn(view, 'roundStarted')!
    expect(start.names.sort()).toEqual(['Ada', 'Bo'])
    expect(start.stageLabel).toBeTruthy()
    expect(start.roundNumber).toBe(1)
  })

  it('gir hvert trukket tall med bokstav og hvor mange som er igjen', async () => {
    const lobby = await h.createLobby({ format: 'bingo75', difficulty: 'normal', drawMode: 'manual' })
    const ada = await h.joinAs(lobby, 'Ada')
    await startRound(h, lobby, [ada])

    await h.expectOk(lobby.host, C.hostDrawNext, lobby.next())
    const view = await siste(lobby, 'numberDrawn')

    const trekk = finn(view, 'numberDrawn')!
    expect(trekk.value).toBeGreaterThanOrEqual(1)
    expect(trekk.value).toBeLessThanOrEqual(75)
    expect(['B', 'I', 'N', 'G', 'O']).toContain(trekk.letter)
    expect(trekk.remaining).toBe(74)
  })

  it('lar 90-formatet være uten bokstav', async () => {
    const lobby = await h.createLobby({ format: 'bingo90', difficulty: 'normal', drawMode: 'manual' })
    const ada = await h.joinAs(lobby, 'Ada')
    await startRound(h, lobby, [ada])

    await h.expectOk(lobby.host, C.hostDrawNext, lobby.next())
    const view = await siste(lobby, 'numberDrawn')
    expect(finn(view, 'numberDrawn')?.letter).toBeNull()
  })

  it('noterer ett tall per trekk, ikke ett per øyeblikksbilde', async () => {
    const lobby = await h.createLobby(KIDS)
    const ada = await h.joinAs(lobby, 'Ada')
    await startRound(h, lobby, [ada])

    for (let i = 0; i < 3; i++) {
      await h.expectOk(lobby.host, C.hostDrawNext, lobby.next())
    }
    const view = await lobby.state.until(
      (v) => v.events.filter((e) => e.data.kind === 'numberDrawn').length === 3,
    )
    // Markeringer utløser nye øyeblikksbilder uten å legge til hendelser.
    await h.expectOk(lobby.host, C.hostPause, lobby.next())
    const etter = await siste(lobby, 'paused')
    expect(etter.events.filter((e) => e.data.kind === 'numberDrawn')).toHaveLength(3)
    expect(view.eventSeq).toBeLessThan(etter.eventSeq)
  })

  it('sier fra om pause og fortsettelse', async () => {
    const lobby = await h.createLobby({ ...KIDS, drawMode: 'auto', drawIntervalMs: 60000 })
    const ada = await h.joinAs(lobby, 'Ada')
    await startRound(h, lobby, [ada])

    await h.expectOk(lobby.host, C.hostPause, lobby.next())
    await siste(lobby, 'paused')
    await h.expectOk(lobby.host, C.hostResumeGame, lobby.next())
    const view = await siste(lobby, 'resumed')
    expect(kinds(view)).toContain('paused')
  })

  it('skiller et bomtrykk fra en ekte bingo', async () => {
    const lobby = await h.createLobby(KIDS)
    const ada = await h.joinAs(lobby, 'Ada')
    await startRound(h, lobby, [ada])

    // Ingen tall er trukket, så kravet kan umulig være oppfylt.
    const svar = await h.ask(ada.socket, C.playerClaimBingo, ada.auth)
    expect(svar.ok).toBe(false)

    const view = await siste(lobby, 'bingoRejected')
    expect(finn(view, 'bingoRejected')?.name).toBe('Ada')
    expect(kinds(view)).not.toContain('bingoClaimed')
  })

  it('sier fra når en spiller mister og gjenoppretter forbindelsen', async () => {
    const lobby = await h.createLobby(KIDS)
    const ada = await h.joinAs(lobby, 'Ada')

    ada.socket.disconnect()
    const borte = await siste(lobby, 'playerDisconnected')
    expect(finn(borte, 'playerDisconnected')?.name).toBe('Ada')

    const igjen = await h.newClient()
    await h.expectOk(igjen, C.playerResume, ada.auth)
    const tilbake = await siste(lobby, 'playerReconnected')
    expect(finn(tilbake, 'playerReconnected')?.name).toBe('Ada')
  })

  it('gir hendelsene stigende sekvensnumre uten hull', async () => {
    const lobby = await h.createLobby(KIDS)
    const ada = await h.joinAs(lobby, 'Ada')
    await startRound(h, lobby, [ada])
    await h.expectOk(lobby.host, C.hostDrawNext, lobby.next())

    const view = await siste(lobby, 'numberDrawn')
    const seqs = view.events.map((event) => event.seq)
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b))
    expect(new Set(seqs).size).toBe(seqs.length)
    expect(view.eventSeq).toBe(seqs.at(-1))
  })

  it('holder hendelsene borte fra telefonene', async () => {
    const lobby = await h.createLobby(KIDS)
    const ada = await h.joinAs(lobby, 'Ada')
    const spillerState = watch<Record<string, unknown>>(ada.socket, E.playerState)
    await startRound(h, lobby, [ada])

    const view = await spillerState.until((v) => v.round !== null)
    expect(view.events).toBeUndefined()
  })
})
