'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ConfigInput } from '@/domain/formats/types'
import { C, E, type HostView } from '@/shared/protocol'
import { hostSession, useHostSession } from '@/ui/shared/session'
import { CommandError, getSocket, send } from '@/ui/shared/socket'

export type HostConnection = 'kobler' | 'tilkoblet' | 'utenTilgang' | 'avsluttet'

/**
 * Hovedskjermens forbindelse til rommet. Gjenopptar seg selv ved hver
 * reconnect — en TV som mister wifi et halvminutt skal ikke ødelegge kvelden.
 *
 * Statusen er avledet, ikke satt: den er en ren funksjon av hva vi vet, slik at
 * to hendelser i rask rekkefølge aldri kan etterlate skjermen i feil tilstand.
 */
export function useHostRoom(roomId: string) {
  const session = useHostSession()
  const [view, setView] = useState<HostView | null>(null)
  const [live, setLive] = useState(false)
  const [denied, setDenied] = useState(false)
  const [closed, setClosed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const seq = useRef(0)

  const isHost = Boolean(session && session.roomId === roomId)
  const hostKey = session?.hostKey

  useEffect(() => {
    if (!hostKey) return
    const socket = getSocket()

    const resume = () => {
      send(C.hostResume, { roomId, hostKey }).catch(() => setDenied(true))
    }

    const onState = (next: HostView) => {
      seq.current = Math.max(seq.current, next.hostSeq)
      setView(next)
      setLive(true)
      setDenied(false)
    }

    socket.on(E.hostState, onState)
    socket.on(E.roomClosed, () => setClosed(true))
    socket.on('connect', resume)
    socket.on('disconnect', () => setLive(false))

    if (socket.connected) resume()

    return () => {
      socket.off(E.hostState, onState)
      socket.off(E.roomClosed)
      socket.off('connect', resume)
      socket.off('disconnect')
    }
  }, [roomId, hostKey])

  const status: HostConnection =
    !isHost || denied
      ? 'utenTilgang'
      : closed
        ? 'avsluttet'
        : view && live
          ? 'tilkoblet'
          : 'kobler'

  /**
   * Hver vertskommando får et sekvensnummer som er høyere enn forrige. Serveren
   * avviser gamle numre, så et dobbelttrykk blir til én handling uansett hvor
   * mange ganger meldingen kommer fram (ARKITEKTUR.md §6).
   */
  const command = useCallback(
    async (event: string, payload: Record<string, unknown> = {}) => {
      if (!hostKey) return false
      seq.current += 1
      setError(null)
      try {
        await send(event, { ...payload, roomId, hostKey, seq: seq.current })
        return true
      } catch (cause) {
        if (cause instanceof CommandError && cause.code !== 'auth/replay') {
          setError(cause.message)
        }
        return false
      }
    },
    [roomId, hostKey],
  )

  const openLobby = useCallback(() => command(C.hostOpenLobby), [command])

  const updateConfig = useCallback(
    (config: ConfigInput) => command(C.hostUpdateConfig, { config }),
    [command],
  )

  const startGame = useCallback(() => command(C.hostStartGame), [command])
  const drawNext = useCallback(() => command(C.hostDrawNext), [command])
  const pause = useCallback(() => command(C.hostPause), [command])
  const resumeGame = useCallback(() => command(C.hostResumeGame), [command])
  const advancePrize = useCallback(() => command(C.hostAdvancePrize), [command])
  const newRound = useCallback(() => command(C.hostNewRound), [command])
  const generateNames = useCallback(() => command(C.hostGenerateNames), [command])
  const approveTakeover = useCallback(
    (name: string) => command(C.hostApproveTakeover, { name }),
    [command],
  )
  const denyTakeover = useCallback(
    (name: string) => command(C.hostDenyTakeover, { name }),
    [command],
  )

  const closeRoom = useCallback(async () => {
    const done = await command(C.hostCloseRoom)
    if (done) hostSession.clear()
    return done
  }, [command])

  return {
    view,
    status,
    error,
    command,
    openLobby,
    updateConfig,
    startGame,
    drawNext,
    pause,
    resumeGame,
    advancePrize,
    newRound,
    generateNames,
    approveTakeover,
    denyTakeover,
    closeRoom,
  }
}
