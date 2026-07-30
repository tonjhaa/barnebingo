'use client'

import { io, type Socket } from 'socket.io-client'
import type { Ack } from '@/shared/protocol'

let socket: Socket | null = null

export function getSocket(): Socket {
  if (!socket) {
    socket = io({
      // WebSocket først; polling er nettet-i-kjelleren-fallback.
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionDelayMax: 4000,
    })
  }
  return socket
}

export class CommandError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message)
  }
}

/**
 * Sender en kommando og venter på serverens svar. Alle kommandoer er
 * spørsmål — klienten antar aldri at noe lyktes.
 */
export function send<T>(event: string, payload: unknown, timeoutMs = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new CommandError('net/timeout', 'Fikk ikke kontakt med spillet.'))
    }, timeoutMs)

    getSocket().emit(event, payload, (response: Ack<T>) => {
      clearTimeout(timer)
      if (response?.ok) resolve(response.data)
      else
        reject(
          new CommandError(
            response?.code ?? 'net/unknown',
            response?.message ?? 'Noe gikk galt.',
          ),
        )
    })
  })
}
