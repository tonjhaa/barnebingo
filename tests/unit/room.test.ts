import { beforeEach, describe, expect, it } from 'vitest'
import { defaultConfigInput } from '@/domain/formats/registry'
import {
  ROOM_IDLE_TIMEOUT_MS,
  ROOM_MAX_LIFETIME_MS,
  canStart,
  claimPlayer,
  createRoom,
  isExpired,
  openLobby,
  setConnected,
  setReady,
  touch,
  updateConfig,
  type Room,
} from '@/domain/room'
import { normalizeRoomCode, generateRoomCode, secretsMatch } from '@/domain/ids'

const NOW = 1_700_000_000_000

function nyttRom(): Room {
  const room = createRoom({ code: 'ABCD', configInput: defaultConfigInput(), now: NOW })
  openLobby(room)
  return room
}

describe('romkode', () => {
  it('bruker bare tegn som ikke kan forveksles', () => {
    for (let i = 0; i < 300; i++) {
      expect(generateRoomCode(() => false)).toMatch(/^[A-HJ-NP-Z2-9]{4}$/)
    }
  })

  it('hopper over koder som allerede er i bruk', () => {
    const brukt = new Set<string>()
    for (let i = 0; i < 50; i++) {
      const code = generateRoomCode((candidate) => brukt.has(candidate))
      expect(brukt.has(code)).toBe(false)
      brukt.add(code)
    }
  })

  it('rydder opp i det brukeren taster', () => {
    expect(normalizeRoomCode(' ab-7k ')).toBe('AB7K')
  })
})

describe('hemmeligheter', () => {
  it('godtar bare identiske nøkler', () => {
    expect(secretsMatch('abc123', 'abc123')).toBe(true)
    expect(secretsMatch('abc123', 'abc124')).toBe(false)
    expect(secretsMatch('abc123', 'abc1234')).toBe(false)
    expect(secretsMatch(undefined, 'abc')).toBe(false)
    expect(secretsMatch('', '')).toBe(false)
  })
})

describe('lobby', () => {
  let room: Room

  beforeEach(() => {
    room = nyttRom()
  })

  it('starter i konfigurasjon og åpner til lobby', () => {
    const fresh = createRoom({
      code: 'WXYZ',
      configInput: defaultConfigInput(),
      now: NOW,
    })
    expect(fresh.status).toBe('configuring')
    expect(openLobby(fresh).ok).toBe(true)
    expect(fresh.status).toBe('lobby')
  })

  it('åpner ikke lobbyen to ganger', () => {
    expect(openLobby(room).ok).toBe(false)
  })

  it('lar fire spillere ta hver sin plass', () => {
    for (const navn of ['Klara', 'Edvin', 'Reodor', 'Pernilla'] as const) {
      expect(claimPlayer(room, navn, NOW).ok).toBe(true)
    }
    expect(room.players).toHaveLength(4)
  })

  it('gir hver spiller sin egen gjenopprettingsnøkkel', () => {
    claimPlayer(room, 'Klara', NOW)
    claimPlayer(room, 'Edvin', NOW)
    const [a, b] = room.players
    expect(a.recoveryKey).not.toBe(b.recoveryKey)
    expect(a.recoveryKey.length).toBeGreaterThan(20)
  })

  it('lar bare én telefon ta hvert navn', () => {
    expect(claimPlayer(room, 'Klara', NOW).ok).toBe(true)
    const igjen = claimPlayer(room, 'Klara', NOW)
    expect(igjen.ok).toBe(false)
    if (!igjen.ok) expect(igjen.code).toBe('claim/taken')
  })

  it('gir ikke bort plassen til en frakoblet spiller', () => {
    const claimed = claimPlayer(room, 'Klara', NOW)
    if (!claimed.ok) throw new Error('kunne ikke bli med')
    setConnected(room, claimed.value.id, false, NOW)
    expect(claimPlayer(room, 'Klara', NOW).ok).toBe(false)
  })

  it('nekter å slippe inn spillere før lobbyen er åpen', () => {
    const stengt = createRoom({
      code: 'QRST',
      configInput: defaultConfigInput(),
      now: NOW,
    })
    const result = claimPlayer(stengt, 'Klara', NOW)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.code).toBe('claim/closed')
  })
})

describe('klar-status', () => {
  let room: Room

  beforeEach(() => {
    room = nyttRom()
  })

  it('kan ikke starte uten spillere', () => {
    expect(canStart(room)).toBe(false)
  })

  it('kan starte når alle tilkoblede er klare', () => {
    const klara = claimPlayer(room, 'Klara', NOW)
    const edvin = claimPlayer(room, 'Edvin', NOW)
    if (!klara.ok || !edvin.ok) throw new Error('kunne ikke bli med')

    setReady(room, klara.value.id, true)
    expect(canStart(room)).toBe(false)

    setReady(room, edvin.value.id, true)
    expect(canStart(room)).toBe(true)
    expect(room.status).toBe('ready')
  })

  it('venter ikke på en spiller som er frakoblet', () => {
    const klara = claimPlayer(room, 'Klara', NOW)
    const edvin = claimPlayer(room, 'Edvin', NOW)
    if (!klara.ok || !edvin.ok) throw new Error('kunne ikke bli med')

    setReady(room, klara.value.id, true)
    setConnected(room, edvin.value.id, false, NOW)
    expect(canStart(room)).toBe(true)
  })

  it('faller tilbake til lobby når noen ombestemmer seg', () => {
    const klara = claimPlayer(room, 'Klara', NOW)
    if (!klara.ok) throw new Error('kunne ikke bli med')
    setReady(room, klara.value.id, true)
    expect(room.status).toBe('ready')
    setReady(room, klara.value.id, false)
    expect(room.status).toBe('lobby')
  })

  it('nullstiller klar-status når reglene endres', () => {
    const klara = claimPlayer(room, 'Klara', NOW)
    if (!klara.ok) throw new Error('kunne ikke bli med')
    setReady(room, klara.value.id, true)

    updateConfig(room, { format: 'bingo75', difficulty: 'normal' })
    expect(room.players[0].ready).toBe(false)
    expect(canStart(room)).toBe(false)
  })

  it('avviser ugyldige regelendringer uten å røre rommet', () => {
    const før = room.profile.format
    const result = updateConfig(room, {
      format: 'bingo90',
      difficulty: 'normal',
      enabledStageIds: [],
      boardsPerPlayer: 3,
      drawMode: 'auto',
      drawIntervalMs: 1000,
    })
    expect(result.ok).toBe(false)
    expect(room.profile.format).toBe(før)
  })
})

describe('utløpstid', () => {
  it('lever mens noen bruker rommet', () => {
    const room = nyttRom()
    touch(room, NOW + ROOM_IDLE_TIMEOUT_MS - 1000)
    expect(isExpired(room, NOW + ROOM_IDLE_TIMEOUT_MS - 500)).toBe(false)
  })

  it('utløper når det har vært stille lenge', () => {
    const room = nyttRom()
    expect(isExpired(room, NOW + ROOM_IDLE_TIMEOUT_MS + 1000)).toBe(true)
  })

  it('utløper uansett aktivitet etter maksimal levetid', () => {
    const room = nyttRom()
    const sent = NOW + ROOM_MAX_LIFETIME_MS + 1000
    touch(room, sent)
    expect(isExpired(room, sent)).toBe(true)
  })
})
