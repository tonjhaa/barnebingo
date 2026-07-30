'use client'

import type { ButtonHTMLAttributes } from 'react'

type Tone = 'sol' | 'bringebaer' | 'turkis' | 'stille'

const TONES: Record<Tone, string> = {
  sol: 'bg-sol text-natt hover:brightness-105',
  bringebaer: 'bg-bringebaer text-white hover:brightness-110',
  turkis: 'bg-turkis text-natt hover:brightness-105',
  stille: 'bg-flate-2 text-tekst border border-kant hover:border-lilla',
}

const SIZES = {
  stor: 'px-10 py-6 text-2xl rounded-3xl',
  vanlig: 'px-6 py-4 text-lg rounded-2xl',
  liten: 'px-4 py-2.5 text-base rounded-xl',
} as const

export function Button({
  tone = 'sol',
  size = 'vanlig',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: Tone
  size?: keyof typeof SIZES
}) {
  return (
    <button
      {...props}
      className={`
        ${TONES[tone]} ${SIZES[size]} ${className}
        font-extrabold tracking-tight
        transition-[transform,filter,opacity] duration-100
        active:scale-[0.97]
        disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100
        focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-lilla
      `}
    />
  )
}
