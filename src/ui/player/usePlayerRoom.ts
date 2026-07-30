'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  C,
  E,
  type ClaimResult,
  type LookupRoomResult,
  type PlayerView,
} from '@/shared/protocol'
import { playerSession, usePlayerSession } from '@/ui/shared/session'
import { CommandError, getSocket, send } from '@/ui/shared/socket'

export type PlayerStage =
  | 'kobler'
  | 'velgNavn'
  | 'selfie'
  | 'med'
  | 'finnesIkke'
  | 'avsluttet'

/**
 * Telefonens forbindelse. Prøver alltid å komme tilbake til plassen sin først:
 * en telefon som låser seg eller mister nettet skal havne rett tilbake i spillet
 * uten å velge navn på nytt (§23).
 */
export function usePlayerRoom(code: string) {
  const session = usePlayerSession()
  const [view, setView] = useState<PlayerView | null>(null)
  const [lookup, setLookup] = useState<LookupRoomResult | null>(null)
  const [joined, setJoined] = useState(false)
  const [missing, setMissing] = useState(false)
  const [closed, setClosed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [byttBilde, setByttBilde] = useState(false)
  const [venterPåVert, setVenterPåVert] = useState<string | null>(null)

  const savedForThisRoom = session?.code === code ? session : null

  useEffect(() => {
    const socket = getSocket()

    const attach = async () => {
      if (savedForThisRoom) {
        try {
          await send(C.playerResume, {
            roomId: savedForThisRoom.roomId,
            playerId: savedForThisRoom.playerId,
            recoveryKey: savedForThisRoom.recoveryKey,
          })
          setJoined(true)
          return
        } catch {
          // Nøkkelen gjelder ikke lenger — rommet er nytt eller borte.
          playerSession.clear()
        }
      }

      try {
        setLookup(await send<LookupRoomResult>(C.playerLookupRoom, { code }))
        setMissing(false)
      } catch (cause) {
        setError(cause instanceof CommandError ? cause.message : 'Fikk ikke kontakt.')
        setMissing(true)
      }
    }

    const onState = (next: PlayerView) => {
      setView(next)
      setJoined(Boolean(next.me))
    }
    const onClosed = () => {
      playerSession.clear()
      setClosed(true)
    }

    const onApproved = (data: {
      roomId: string
      code: string
      name: string
      playerId: string
      recoveryKey: string
    }) => {
      // Verten slapp oss inn: den nye nøkkelen er vår, og vi er i spillet.
      playerSession.set(data)
      setVenterPåVert(null)
      setJoined(true)
    }
    const onDenied = () => setVenterPåVert(null)

    socket.on(E.playerState, onState)
    socket.on(E.roomClosed, onClosed)
    socket.on(E.takeoverApproved, onApproved)
    socket.on(E.takeoverDenied, onDenied)
    socket.on('connect', attach)

    if (socket.connected) void attach()

    return () => {
      socket.off(E.playerState, onState)
      socket.off(E.roomClosed, onClosed)
      socket.off(E.takeoverApproved, onApproved)
      socket.off(E.takeoverDenied, onDenied)
      socket.off('connect', attach)
    }
  }, [code, savedForThisRoom])

  const stage: PlayerStage = closed
    ? 'avsluttet'
    : joined
      // Bildevalget ligger mellom navnet og klar-knappen (§16). Serveren husker
      // valget, så en reconnect ikke sender spilleren tilbake til kameraet.
      ? view?.me && (!view.me.profileReady || byttBilde)
        ? 'selfie'
        : 'med'
      : missing
        ? 'finnesIkke'
        : lookup || view
          ? 'velgNavn'
          : 'kobler'

  const claim = useCallback(
    async (name: string) => {
      const roomId = lookup?.roomId ?? view?.roomId
      if (!roomId) return
      setBusy(true)
      setError(null)
      try {
        const result = await send<ClaimResult>(C.playerClaim, { roomId, name })
        playerSession.set({ roomId, code, name, ...result })
        setJoined(true)
      } catch (cause) {
        setError(cause instanceof CommandError ? cause.message : 'Klarte ikke å bli med.')
      } finally {
        setBusy(false)
      }
    },
    [lookup, view, code],
  )

  const setReady = useCallback(
    async (ready: boolean) => {
      if (!savedForThisRoom) return
      setBusy(true)
      try {
        await send(C.playerSetReady, {
          roomId: savedForThisRoom.roomId,
          playerId: savedForThisRoom.playerId,
          recoveryKey: savedForThisRoom.recoveryKey,
          ready,
        })
      } catch (cause) {
        setError(cause instanceof CommandError ? cause.message : 'Klarte ikke å svare.')
      } finally {
        setBusy(false)
      }
    },
    [savedForThisRoom],
  )

  const setActiveBoard = useCallback(
    async (boardId: string) => {
      if (!savedForThisRoom) return
      try {
        await send(C.playerSetActiveBoard, {
          roomId: savedForThisRoom.roomId,
          playerId: savedForThisRoom.playerId,
          recoveryKey: savedForThisRoom.recoveryKey,
          boardId,
        })
      } catch (cause) {
        setError(cause instanceof CommandError ? cause.message : 'Klarte ikke å bytte brett.')
      }
    },
    [savedForThisRoom],
  )

  /**
   * Markerer eller fjerner en markering. Returnerer null når serveren godtok,
   * og ellers en tekst kalleren kan vise. Klienten tegner aldri et kryss selv —
   * det gjør den først når serveren har sagt ja i neste øyeblikksbilde.
   */
  const toggleCell = useCallback(
    async (boardId: string, value: number, marked: boolean): Promise<string | null> => {
      if (!savedForThisRoom) return 'Vi kjente deg ikke igjen.'
      try {
        await send(marked ? C.playerUnmark : C.playerMark, {
          roomId: savedForThisRoom.roomId,
          playerId: savedForThisRoom.playerId,
          recoveryKey: savedForThisRoom.recoveryKey,
          boardId,
          value,
        })
        return null
      } catch (cause) {
        return cause instanceof CommandError ? cause.message : 'Klarte ikke å markere.'
      }
    },
    [savedForThisRoom],
  )

  /** Sender bildet som binærdata. Socket.IO tar Blob rett fra lerretet. */
  const lagreSelfie = useCallback(
    async (blob: Blob): Promise<string | null> => {
      if (!savedForThisRoom) return 'Vi kjente deg ikke igjen.'
      try {
        setByttBilde(false)
        await send(
          C.playerUploadSelfie,
          {
            roomId: savedForThisRoom.roomId,
            playerId: savedForThisRoom.playerId,
            recoveryKey: savedForThisRoom.recoveryKey,
            contentType: blob.type || 'image/jpeg',
            data: await blob.arrayBuffer(),
          },
          20000,
        )
        return null
      } catch (cause) {
        return cause instanceof CommandError ? cause.message : 'Klarte ikke å lagre bildet.'
      }
    },
    [savedForThisRoom],
  )

  const brukAvatar = useCallback(async (): Promise<string | null> => {
    if (!savedForThisRoom) return 'Vi kjente deg ikke igjen.'
    try {
      setByttBilde(false)
      await send(C.playerUseAvatar, {
        roomId: savedForThisRoom.roomId,
        playerId: savedForThisRoom.playerId,
        recoveryKey: savedForThisRoom.recoveryKey,
      })
      return null
    } catch (cause) {
      return cause instanceof CommandError ? cause.message : 'Klarte ikke å velge avatar.'
    }
  }, [savedForThisRoom])

  /** «Det er meg» — spør verten om å få plassen tilbake på en ny telefon (§23). */
  const bePlassen = useCallback(
    async (name: string) => {
      const roomId = lookup?.roomId ?? view?.roomId
      if (!roomId) return
      setError(null)
      try {
        await send(C.playerRequestTakeover, { roomId, name })
        setVenterPåVert(name)
      } catch (cause) {
        setError(cause instanceof CommandError ? cause.message : 'Fikk ikke spurt verten.')
      }
    },
    [lookup, view],
  )

  const claimBingo = useCallback(async (): Promise<string | null> => {
    if (!savedForThisRoom) return 'Vi kjente deg ikke igjen.'
    try {
      await send(C.playerClaimBingo, {
        roomId: savedForThisRoom.roomId,
        playerId: savedForThisRoom.playerId,
        recoveryKey: savedForThisRoom.recoveryKey,
      })
      return null
    } catch (cause) {
      return cause instanceof CommandError ? cause.message : 'Klarte ikke å rope bingo.'
    }
  }, [savedForThisRoom])

  return {
    stage,
    view,
    setActiveBoard,
    toggleCell,
    claimBingo,
    lagreSelfie,
    brukAvatar,
    bePlassen,
    venterPåVert,
    byttBilde: () => setByttBilde(true),
    roster: view?.roster ?? lookup?.roster ?? [],
    config: view?.config ?? lookup?.config ?? null,
    error,
    busy,
    claim,
    setReady,
  }
}
