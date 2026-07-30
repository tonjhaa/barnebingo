import { describe, expect, it } from 'vitest'
import { C, E, type PlayerView } from '@/shared/protocol'
import { setupHarness, startRound, watch, type JoinedPlayer, type Lobby } from './harness'

/**
 * Markering, BINGO og premieprogresjon ende-til-ende. Testene tvinger fram en
 * bingo ved å trekke helt til spilleren har det som trengs — trekkrekkefølgen
 * er seedet, men vi vet ikke seeden, så vi spiller heller runden.
 */
const h = setupHarness()

const KIDS = { format: 'kids', difficulty: 'enkel', winMode: 'manual' as const }

/** Hele rader på spillerens første brett, slik telefonen sist så det. */
function rowsOf(state: ReturnType<typeof watch<PlayerView>>): number {
  return state.latest?.boards[0]?.completedRows.length ?? 0
}

function marksOf(state: ReturnType<typeof watch<PlayerView>>): number {
  return state.latest?.boards[0]?.markedCount ?? 0
}

/**
 * Trekker og markerer helt til spilleren har nok hele rader. Trekkrekkefølgen
 * er seedet av serveren, så testen kan ikke velge tallene — den spiller runden.
 */
async function drawUntilRows(
  lobby: Lobby,
  player: JoinedPlayer,
  state: ReturnType<typeof watch<PlayerView>>,
  rows: number,
): Promise<void> {
  for (let draw = 1; draw <= 200; draw++) {
    if (rowsOf(state) >= rows) return

    const result = await h.ask(lobby.host, C.hostDrawNext, lobby.next())
    if (!result.ok) return

    const view = await state.until((v) => (v.round?.drawnCount ?? 0) >= draw)
    const value = view.round?.currentNumber
    const board = view.boards[0]
    if (value == null || !board) continue
    if (!board.cells.flat().some((cell) => cell.value === value)) continue

    await h.expectOk(player.socket, C.playerMark, {
      ...player.auth,
      boardId: board.id,
      value,
    })
    await state.until((v) =>
      Boolean(
        v.boards[0]?.cells.flat().some((cell) => cell.value === value && cell.marked),
      ),
    )
  }
}

/** Trekker til betingelsen slår til. Brukes med automatisk markering. */
async function drawUntil(
  lobby: Lobby,
  done: () => boolean,
  maxDraws = 60,
): Promise<void> {
  for (let draw = 1; draw <= maxDraws; draw++) {
    if (done()) return
    const result = await h.ask(lobby.host, C.hostDrawNext, lobby.next())
    if (!result.ok) return
    await lobby.state.until((v) => (v.round?.drawnCount ?? 0) >= draw)
  }
}

describe('markering', () => {
  it('godtar et trukket tall og avviser et som ikke er trukket', async () => {
    const lobby = await h.createLobby(KIDS)
    const klara = await h.joinAs(lobby, 'Klara')
    const state = watch<PlayerView>(klara.socket, E.playerState)
    await startRound(h, lobby, [klara])

    await h.expectOk(lobby.host, C.hostDrawNext, lobby.next())
    const etterTrekk = await state.until((v) => (v.round?.drawnCount ?? 0) === 1)
    const trukket = etterTrekk.round!.currentNumber!
    const board = etterTrekk.boards[0]
    const alle = board.cells.flat().map((c) => c.value).filter((v): v is number => v !== null)

    const utrukket = alle.find((v) => v !== trukket)!
    const avvist = await h.ask(klara.socket, C.playerMark, {
      ...klara.auth,
      boardId: board.id,
      value: utrukket,
    })
    expect(avvist.ok).toBe(false)
    if (!avvist.ok) expect(avvist.code).toBe('mark/notDrawn')

    if (alle.includes(trukket)) {
      await h.expectOk(klara.socket, C.playerMark, {
        ...klara.auth,
        boardId: board.id,
        value: trukket,
      })
      const etter = await state.until((v) => v.boards[0].markedCount === 1)
      expect(etter.boards[0].cells.flat().find((c) => c.value === trukket)?.marked).toBe(
        true,
      )
    }
  })

  it('avviser et tall som ikke står på brettet', async () => {
    const lobby = await h.createLobby(KIDS)
    const klara = await h.joinAs(lobby, 'Klara')
    const state = watch<PlayerView>(klara.socket, E.playerState)
    await startRound(h, lobby, [klara])
    await h.expectOk(lobby.host, C.hostDrawNext, lobby.next())

    const view = await state.until((v) => (v.round?.drawnCount ?? 0) === 1)
    const board = view.boards[0]
    const påBrettet = new Set(board.cells.flat().map((c) => c.value))
    const fremmed = [...Array(40).keys()].map((n) => n + 1).find((n) => !påBrettet.has(n))!

    const result = await h.ask(klara.socket, C.playerMark, {
      ...klara.auth,
      boardId: board.id,
      value: fremmed,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('mark/notOnBoard')
  })

  it('lar ingen markere på et annet barns brett', async () => {
    const lobby = await h.createLobby(KIDS)
    const klara = await h.joinAs(lobby, 'Klara')
    const edvin = await h.joinAs(lobby, 'Edvin')
    const edvinState = watch<PlayerView>(edvin.socket, E.playerState)
    await startRound(h, lobby, [klara, edvin])
    await h.expectOk(lobby.host, C.hostDrawNext, lobby.next())

    const edvinsBrett = (await edvinState.until((v) => v.boards.length > 0)).boards[0]
    const result = await h.ask(klara.socket, C.playerMark, {
      ...klara.auth,
      boardId: edvinsBrett.id,
      value: 1,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('board/notYours')
  })

  it('markerer automatisk når verten har valgt det', async () => {
    const lobby = await h.createLobby({ ...KIDS, markingMode: 'auto' })
    const klara = await h.joinAs(lobby, 'Klara')
    const state = watch<PlayerView>(klara.socket, E.playerState)
    await startRound(h, lobby, [klara])

    for (let i = 0; i < 12; i++) {
      await h.expectOk(lobby.host, C.hostDrawNext, lobby.next())
    }

    const view = await state.until((v) => (v.round?.drawnCount ?? 0) === 12)
    // Alt som er trukket og står på brettet skal være krysset av.
    expect(view.boards[0].markedCount).toBeGreaterThan(0)
    const umarkert = view.boards[0].cells
      .flat()
      .filter((cell) => cell.value !== null && !cell.marked)
    expect(umarkert.every((cell) => cell.value !== null)).toBe(true)
  })

  it('lar spilleren angre en markering', async () => {
    const lobby = await h.createLobby(KIDS)
    const klara = await h.joinAs(lobby, 'Klara')
    const state = watch<PlayerView>(klara.socket, E.playerState)
    await startRound(h, lobby, [klara])

    let markert: { boardId: string; value: number } | null = null
    for (let i = 0; i < 40 && !markert; i++) {
      await h.expectOk(lobby.host, C.hostDrawNext, lobby.next())
      const view = await state.until((v) => (v.round?.drawnCount ?? 0) === i + 1)
      const value = view.round!.currentNumber!
      const board = view.boards[0]
      if (board.cells.flat().some((cell) => cell.value === value)) {
        await h.expectOk(klara.socket, C.playerMark, {
          ...klara.auth,
          boardId: board.id,
          value,
        })
        markert = { boardId: board.id, value }
      }
    }

    expect(markert).not.toBeNull()
    await state.until((v) => v.boards[0].markedCount === 1)
    await h.expectOk(klara.socket, C.playerUnmark, { ...klara.auth, ...markert! })
    const etter = await state.until((v) => v.boards[0].markedCount === 0)
    expect(etter.boards[0].markedCount).toBe(0)
  })
})

describe('BINGO', () => {
  it('avviser et krav uten dekning, uten straff', async () => {
    const lobby = await h.createLobby(KIDS)
    const klara = await h.joinAs(lobby, 'Klara')
    const state = watch<PlayerView>(klara.socket, E.playerState)
    await startRound(h, lobby, [klara])
    await h.expectOk(lobby.host, C.hostDrawNext, lobby.next())

    const result = await h.ask(klara.socket, C.playerClaimBingo, klara.auth)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.code).toBe('bingo/invalid')
      expect(result.message).toContain('Ikke helt ennå')
    }

    // Spillet går videre og markeringene er i behold.
    const view = await state.until((v) => v.round?.status === 'active')
    expect(view.round?.status).toBe('active')
    await h.expectOk(lobby.host, C.hostDrawNext, lobby.next())
  })

  it('godkjenner en ekte bingo og deler ut premien', async () => {
    const lobby = await h.createLobby({ ...KIDS, bingoWindowMs: 0 })
    const klara = await h.joinAs(lobby, 'Klara')
    const state = watch<PlayerView>(klara.socket, E.playerState)
    await startRound(h, lobby, [klara])

    await drawUntilRows(lobby, klara, state, 1)
    expect(rowsOf(state)).toBeGreaterThanOrEqual(1)

    await h.expectOk(klara.socket, C.playerClaimBingo, klara.auth)

    const premie = await lobby.state.until((v) => v.round?.prize != null)
    expect(premie.round?.prize?.winners.map((w) => w.name)).toEqual(['Klara'])
    expect(premie.round?.prize?.stageLabel).toBe('Én rad')
    expect(premie.round?.prize?.nextStageLabel).toBe('To rader')
    expect(premie.round?.status).toBe('showingPrize')
  })

  it('stopper trekkingen mens bingoen kontrolleres', async () => {
    const lobby = await h.createLobby({ ...KIDS, bingoWindowMs: 0 })
    const klara = await h.joinAs(lobby, 'Klara')
    const state = watch<PlayerView>(klara.socket, E.playerState)
    await startRound(h, lobby, [klara])
    await drawUntilRows(lobby, klara, state, 1)
    await h.expectOk(klara.socket, C.playerClaimBingo, klara.auth)
    await lobby.state.until((v) => v.round?.prize != null)

    const nektet = await h.ask(lobby.host, C.hostDrawNext, lobby.next())
    expect(nektet.ok).toBe(false)
    if (!nektet.ok) expect(nektet.code).toBe('draw/notActive')
  })

  it('går videre til neste premie med markeringene i behold', async () => {
    const lobby = await h.createLobby({ ...KIDS, bingoWindowMs: 0 })
    const klara = await h.joinAs(lobby, 'Klara')
    const state = watch<PlayerView>(klara.socket, E.playerState)
    await startRound(h, lobby, [klara])
    await drawUntilRows(lobby, klara, state, 1)
    await h.expectOk(klara.socket, C.playerClaimBingo, klara.auth)
    await lobby.state.until((v) => v.round?.prize != null)

    const førKryss = marksOf(state)
    await h.expectOk(lobby.host, C.hostAdvancePrize, lobby.next())

    const etter = await lobby.state.until((v) => v.round?.stageLabel === 'To rader')
    expect(etter.round?.status).toBe('active')
    expect(etter.round?.stageIndex).toBe(1)
    expect(etter.round?.prize).toBeNull()
    expect(marksOf(state)).toBe(førKryss)
  })

  it('avviser et krav på det gamle stadiet etter at det er vunnet', async () => {
    const lobby = await h.createLobby({ ...KIDS, bingoWindowMs: 0 })
    const klara = await h.joinAs(lobby, 'Klara')
    const state = watch<PlayerView>(klara.socket, E.playerState)
    await startRound(h, lobby, [klara])
    await drawUntilRows(lobby, klara, state, 1)
    await h.expectOk(klara.socket, C.playerClaimBingo, klara.auth)
    await lobby.state.until((v) => v.round?.prize != null)
    await h.expectOk(lobby.host, C.hostAdvancePrize, lobby.next())
    await lobby.state.until((v) => v.round?.stageLabel === 'To rader')

    // Én rad holder ikke lenger — nå kreves to.
    if (rowsOf(state) < 2) {
      const result = await h.ask(klara.socket, C.playerClaimBingo, klara.auth)
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.code).toBe('bingo/invalid')
    }
  })
})

describe('bingo-vinduet', () => {
  it('lar to spillere som roper nesten samtidig vinne sammen', async () => {
    const lobby = await h.createLobby({
      ...KIDS,
      markingMode: 'auto',
      bingoWindowMs: 1500,
      allowMultipleWinnersPerStage: true,
    })
    const klara = await h.joinAs(lobby, 'Klara')
    const edvin = await h.joinAs(lobby, 'Edvin')
    const k = watch<PlayerView>(klara.socket, E.playerState)
    const e = watch<PlayerView>(edvin.socket, E.playerState)
    await startRound(h, lobby, [klara, edvin])

    // Automatisk markering: trekk til begge har en hel rad.
    await drawUntil(lobby, () => rowsOf(k) >= 1 && rowsOf(e) >= 1)

    await h.expectOk(klara.socket, C.playerClaimBingo, klara.auth)
    await h.expectOk(edvin.socket, C.playerClaimBingo, edvin.auth)

    const premie = await lobby.state.until((v) => v.round?.prize != null, 6000)
    const navn = premie.round!.prize!.winners.map((w) => w.name).sort()
    expect(navn).toEqual(['Edvin', 'Klara'])
  }, 20000)

  it('kårer bare den første når verten har valgt én vinner', async () => {
    const lobby = await h.createLobby({
      ...KIDS,
      markingMode: 'auto',
      bingoWindowMs: 1000,
      allowMultipleWinnersPerStage: false,
    })
    const klara = await h.joinAs(lobby, 'Klara')
    const edvin = await h.joinAs(lobby, 'Edvin')
    const k = watch<PlayerView>(klara.socket, E.playerState)
    const e = watch<PlayerView>(edvin.socket, E.playerState)
    await startRound(h, lobby, [klara, edvin])

    await drawUntil(lobby, () => rowsOf(k) >= 1 && rowsOf(e) >= 1)

    await h.expectOk(klara.socket, C.playerClaimBingo, klara.auth)
    await h.expectOk(edvin.socket, C.playerClaimBingo, edvin.auth)

    const premie = await lobby.state.until((v) => v.round?.prize != null, 6000)
    expect(premie.round!.prize!.winners.map((w) => w.name)).toEqual(['Klara'])
    // Den andre får «du hadde også bingo», ikke «ugyldig».
    expect(premie.round!.prize!.alsoHadBingo).toEqual(['Edvin'])
  }, 20000)
})

describe('automatisk vinner', () => {
  it('roper bingo for spilleren uten at noen trykker', async () => {
    const lobby = await h.createLobby({
      ...KIDS,
      markingMode: 'auto',
      winMode: 'autoWin',
    })
    const klara = await h.joinAs(lobby, 'Klara')
    await startRound(h, lobby, [klara])

    await drawUntil(lobby, () => Boolean(lobby.state.latest?.round?.prize))

    const premie = await lobby.state.until((v) => v.round?.prize != null, 5000)
    expect(premie.round!.prize!.winners.map((w) => w.name)).toEqual(['Klara'])
    expect(premie.round!.prize!.stageLabel).toBe('Én rad')
  }, 20000)
})

describe('hint i assistert modus', () => {
  it('sier fra til spilleren, men bare når verten har valgt assistert', async () => {
    const assistert = await h.createLobby({
      ...KIDS,
      markingMode: 'auto',
      winMode: 'assisted',
    })
    const klara = await h.joinAs(assistert, 'Klara')
    const state = watch<PlayerView>(klara.socket, E.playerState)
    await startRound(h, assistert, [klara])

    await drawUntil(assistert, () => Boolean(state.latest?.bingoHint))
    expect(state.latest?.bingoHint).toBe(true)
  }, 20000)

  it('sender aldri hintet i manuell modus', async () => {
    const lobby = await h.createLobby({ ...KIDS, markingMode: 'auto', winMode: 'manual' })
    const klara = await h.joinAs(lobby, 'Klara')
    const state = watch<PlayerView>(klara.socket, E.playerState)
    await startRound(h, lobby, [klara])

    await drawUntil(lobby, () => rowsOf(state) >= 1)

    expect(rowsOf(state)).toBeGreaterThanOrEqual(1)
    // Spilleren har faktisk bingo, men skal oppdage det selv.
    expect(state.latest?.bingoHint).toBe(false)
  }, 20000)
})

describe('hele runden', () => {
  it('spilles ferdig gjennom alle premiestadiene', async () => {
    const lobby = await h.createLobby({
      ...KIDS,
      markingMode: 'auto',
      winMode: 'autoWin',
      enabledStageIds: ['row1', 'full'],
    })
    const klara = await h.joinAs(lobby, 'Klara')
    await startRound(h, lobby, [klara])

    const vunne: string[] = []
    for (let i = 0; i < 60; i++) {
      const prize = lobby.state.latest?.round?.prize
      if (prize && !vunne.includes(prize.stageLabel)) {
        vunne.push(prize.stageLabel)
        if (prize.isFinalStage) break
        await h.expectOk(lobby.host, C.hostAdvancePrize, lobby.next())
        await lobby.state.until((v) => v.round?.prize == null)
        continue
      }
      const result = await h.ask(lobby.host, C.hostDrawNext, lobby.next())
      if (!result.ok) break
      await lobby.state.until((v) => (v.round?.drawnCount ?? 0) > 0)
    }

    expect(vunne).toEqual(['Én rad', 'Fullt brett'])
    const slutt = await lobby.state.until((v) => v.round?.status === 'finished', 5000)
    expect(slutt.status).toBe('finished')
    expect(slutt.roster.find((s) => s.name === 'Klara')?.progress?.prizes).toBe(2)
  }, 30000)
})
