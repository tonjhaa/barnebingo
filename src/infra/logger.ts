/**
 * Minimal logg. Ingen bilder, ingen gjenopprettingsnøkler, ingen vertsnøkler —
 * romkode og spillernavn er det groveste som slipper ut (§25).
 */
type Level = 'debug' | 'info' | 'warn' | 'error'

const LEVEL_ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 }
const threshold = LEVEL_ORDER[(process.env.LOG_LEVEL as Level) ?? 'info'] ?? 20

function emit(level: Level, message: string, data?: Record<string, unknown>) {
  if (LEVEL_ORDER[level] < threshold) return
  const line = data
    ? `${message} ${JSON.stringify(data)}`
    : message
  const stamp = new Date().toISOString().slice(11, 19)
  console[level === 'debug' ? 'log' : level](`${stamp} ${level.padEnd(5)} ${line}`)
}

export const log = {
  debug: (m: string, d?: Record<string, unknown>) => emit('debug', m, d),
  info: (m: string, d?: Record<string, unknown>) => emit('info', m, d),
  warn: (m: string, d?: Record<string, unknown>) => emit('warn', m, d),
  error: (m: string, d?: Record<string, unknown>) => emit('error', m, d),
}
