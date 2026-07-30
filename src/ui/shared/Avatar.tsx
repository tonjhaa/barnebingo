const AVATAR_EMOJI: Record<string, string> = {
  rev: '🦊',
  ugle: '🦉',
  pinnsvin: '🦔',
  frosk: '🐸',
}

/**
 * Spillerens ansikt. Selfien vinner når den finnes; ellers dyret. Avataren er
 * ikke en plassholder man skal skamme seg over — den er et fullverdig valg for
 * barn som ikke vil bli fotografert (§14).
 */
export function Avatar({
  name,
  color,
  avatarId,
  selfieUrl,
  size = 96,
  dimmed = false,
}: {
  name: string
  color: string
  avatarId: string
  selfieUrl?: string | null
  size?: number
  dimmed?: boolean
}) {
  return (
    <div
      className="relative grid shrink-0 place-items-center overflow-hidden rounded-full transition-[filter,opacity]"
      style={{
        width: size,
        height: size,
        background: dimmed ? '#2d2470' : color,
        boxShadow: dimmed ? 'none' : `0 0 0 4px ${color}44`,
        opacity: dimmed ? 0.45 : 1,
        filter: dimmed ? 'grayscale(1)' : undefined,
      }}
    >
      {selfieUrl ? (
        /* Midlertidig bilde fra prosessminnet — ikke en ressurs next/image kan
           optimalisere, og den skal heller ikke bufres noe sted. */
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={selfieUrl}
          alt={name}
          width={size}
          height={size}
          className="h-full w-full object-cover"
        />
      ) : (
        <span aria-hidden style={{ fontSize: size * 0.5, lineHeight: 1 }}>
          {AVATAR_EMOJI[avatarId] ?? '🎲'}
        </span>
      )}
    </div>
  )
}
