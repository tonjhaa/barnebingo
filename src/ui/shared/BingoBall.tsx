'use client'

/**
 * Bingokulen.
 *
 * Dette er kveldens midtpunkt: tallet alle venter på, sett fra sofaen. Derfor
 * er det ikke et tall i en boks, men en kule med lys på — høylys oppe til
 * venstre, skygge nede til høyre, og en hvit kappe der tallet står trykt.
 *
 * Fargen kommer fra kolonnen tallet hører til. I 75-bingo er det B-I-N-G-O, i
 * 90-bingo er det tierne. Fargen sier altså noe sant om tallet i stedet for å
 * være dekor, og over tid lærer man hvor på brettet man skal lete før man har
 * rukket å lese tallet.
 */
export function BingoBall({
  number,
  letter,
  column,
  size = 'stor',
  /** Byttes når et nytt tall trekkes, så kula faller på nytt. */
  dropKey,
}: {
  number: number
  letter?: string | null
  column?: number | null
  size?: 'stor' | 'liten'
  dropKey?: string | number
}) {
  const farge = `var(--color-kule-${((column ?? 0) % 9) + 1})`
  const stor = size === 'stor'

  return (
    <div
      key={dropKey}
      className={`kule kule-faller ${stor ? 'w-[min(56vh,26rem)]' : 'w-20'}`}
      style={{ '--kulefarge': farge } as React.CSSProperties}
      role="img"
      aria-label={letter ? `${letter} ${number}` : `Nummer ${number}`}
    >
      <div className="kule-kappe flex-col">
        {letter && (
          <span
            aria-hidden
            className="font-[family-name:var(--font-tall)] font-extrabold tracking-[0.18em]"
            style={{
              fontSize: stor ? 'clamp(1.1rem, 3vw, 2.1rem)' : '0.6rem',
              // Kulefargen mørknet mot blekk. Gult på krem er ellers uleselig,
              // og bokstaven skal kunne leses fra sofaen som tallet.
              color: `color-mix(in oklab, ${farge} 55%, #241435)`,
              marginBottom: stor ? '0.1em' : 0,
            }}
          >
            {letter}
          </span>
        )}
        <span
          aria-hidden
          className="font-black"
          style={{ fontSize: stor ? 'clamp(3.5rem, 13vw, 9rem)' : '1.6rem' }}
        >
          {number}
        </span>
      </div>
    </div>
  )
}
