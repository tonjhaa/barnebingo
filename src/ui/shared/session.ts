'use client'

/**
 * Nøkler som lever på enheten. Vertsnøkkelen og gjenopprettingsnøkkelen havner
 * aldri i en URL — en QR-kode blir fotografert, en URL blir delt, og begge
 * deler ville gitt bort kontrollen over rommet (§25).
 */

import { useMemo, useSyncExternalStore } from 'react'

const HOST_KEY = 'barnebingo.vert'
const PLAYER_KEY = 'barnebingo.spiller'

export interface HostSession {
  roomId: string
  code: string
  hostKey: string
}

export interface PlayerSession {
  roomId: string
  code: string
  playerId: string
  recoveryKey: string
  name: string
}

function read<T>(key: string): T | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function write(key: string, value: unknown): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Privat surfemodus e.l. Appen fungerer, men reconnect gjør det ikke.
  }
}

/** Lokale endringer varsles her; 'storage' dekker bare andre faner. */
const listeners = new Set<() => void>()

function notify() {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  window.addEventListener('storage', listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', listener)
  }
}

function raw(key: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

export const hostSession = {
  get: () => read<HostSession>(HOST_KEY),
  set: (session: HostSession) => {
    write(HOST_KEY, session)
    notify()
  },
  clear: () => {
    window.localStorage.removeItem(HOST_KEY)
    notify()
  },
}

export const playerSession = {
  get: () => read<PlayerSession>(PLAYER_KEY),
  set: (session: PlayerSession) => {
    write(PLAYER_KEY, session)
    notify()
  },
  clear: () => {
    window.localStorage.removeItem(PLAYER_KEY)
    notify()
  },
}

/**
 * Leser lagret sesjon som en ekstern kilde. `useSyncExternalStore` gir riktig
 * oppførsel både ved hydrering (serveren har ingen localStorage) og når nøkkelen
 * endres midt i en økt — uten å sette tilstand fra en effekt.
 */
function useStoredSession<T>(key: string): T | null {
  const json = useSyncExternalStore(
    subscribe,
    () => raw(key),
    () => null,
  )
  return useMemo(() => {
    if (!json) return null
    try {
      return JSON.parse(json) as T
    } catch {
      return null
    }
  }, [json])
}

export function useHostSession(): HostSession | null {
  return useStoredSession<HostSession>(HOST_KEY)
}

export function usePlayerSession(): PlayerSession | null {
  return useStoredSession<PlayerSession>(PLAYER_KEY)
}
