'use client'

import type { BoardCellView, BoardView } from '@/shared/protocol'

/**
 * Selve bingobrettet. Rutene er kvadratiske og deler bredden likt, så et
 * 3 × 9-brett fra 90-formatet får plass på en iPhone uten at noe må scrolles
 * eller zoomes — barnet skal se hele brettet på én gang.
 */
export function BoardGrid({
  board,
  color,
  columnLabels,
  compact = false,
  onToggle,
  rejected = null,
  hint = null,
}: {
  board: BoardView
  color: string
  columnLabels: string[]
  compact?: boolean
  /** Utelates når brettet bare skal ses på, f.eks. i automatisk markering. */
  onToggle?: (value: number, marked: boolean) => void
  /** Tallet som nettopp ble avvist. Ruta rister og går videre. */
  rejected?: number | null
  /** Tallet som skal lyse i assistert markering. Hintet markerer ikke selv. */
  hint?: number | null
}) {
  const cols = board.cells[0]?.length ?? 0
  const completed = new Set(board.completedRows)
  const gap = cols > 6 ? 3 : 6

  return (
    <div className="w-full" style={{ display: 'grid', gap }}>
      {columnLabels.length === cols && (
        <div
          aria-hidden
          className="grid"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap }}
        >
          {columnLabels.map((label) => (
            <span
              key={label}
              className="text-center font-black text-tekst-svak"
              style={{ fontSize: compact ? '0.7rem' : '1.1rem' }}
            >
              {label}
            </span>
          ))}
        </div>
      )}

      {board.cells.map((row, rowIndex) => (
        <div
          key={rowIndex}
          className="grid rounded-lg transition-shadow"
          style={{
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            gap,
            boxShadow: completed.has(rowIndex) ? `0 0 0 2px ${color}` : undefined,
          }}
        >
          {row.map((cell, colIndex) => (
            <Cell
              key={colIndex}
              cell={cell}
              color={color}
              compact={compact}
              tett={cols > 6}
              onToggle={onToggle}
              rister={cell.value !== null && cell.value === rejected}
              hinter={cell.value !== null && cell.value === hint}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

function Cell({
  cell,
  color,
  compact,
  tett,
  onToggle,
  rister,
  hinter,
}: {
  cell: BoardCellView
  color: string
  compact: boolean
  tett: boolean
  onToggle?: (value: number, marked: boolean) => void
  rister: boolean
  hinter: boolean
}) {
  if (cell.value === null && !cell.isFree) {
    // Tom rute i 90-formatet. Den er ikke en hindring, bare et hull i mønsteret.
    return <div className="aspect-square rounded-lg bg-natt/40" />
  }

  const style = {
    background: '#3b2461',
    color: cell.marked ? '#fffdf8' : '#e8dcf5',
    fontSize: compact ? (tett ? '0.6rem' : '0.85rem') : tett ? '0.95rem' : '1.6rem',
    boxShadow: 'inset 0 1px 0 rgb(255 255 255 / .06)',
  }
  const className = `relative grid aspect-square place-items-center rounded-lg font-[family-name:var(--font-tall)] font-extrabold tabular-nums ${
    rister ? 'rister' : hinter ? 'hinter' : ''
  }`

  const innhold = (
    <>
      <Blekk vises={cell.marked} color={color} seed={cell.value ?? 0} />
      <span className="relative">{cell.isFree ? '★' : cell.value}</span>
    </>
  )

  // Den frie ruta er alltid markert og skal ikke kunne trykkes bort.
  if (!onToggle || cell.isFree || cell.value === null) {
    return (
      <div className={className} style={style}>
        {innhold}
      </div>
    )
  }

  const value = cell.value
  return (
    <button
      aria-label={`${value}${cell.marked ? ', markert' : ''}`}
      aria-pressed={cell.marked}
      onClick={() => onToggle(value, cell.marked)}
      className={`${className} active:scale-95`}
      style={style}
    >
      {innhold}
    </button>
  )
}

/**
 * Tusjmerket. En bingotusj legger igjen en litt ujevn blekkflekk, ikke et
 * fylt rektangel — og ingen to flekker er like. Formen og vinkelen utledes
 * av tallet i ruta, så brettet ser håndmerket ut uten at noe er tilfeldig.
 */
function Blekk({
  vises,
  color,
  seed,
}: {
  vises: boolean
  color: string
  seed: number
}) {
  const vinkel = (seed * 37) % 360
  const form = [
    '48% 52% 55% 45% / 52% 48% 52% 48%',
    '54% 46% 47% 53% / 46% 55% 45% 54%',
    '45% 55% 52% 48% / 55% 45% 55% 45%',
  ][seed % 3]

  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-[7%] transition-[opacity,transform] duration-150"
      style={{
        background: color,
        borderRadius: form,
        transform: `rotate(${vinkel}deg) scale(${vises ? 1 : 0.4})`,
        opacity: vises ? 0.92 : 0,
        boxShadow: `0 0 6px ${color}66`,
      }}
    />
  )
}
