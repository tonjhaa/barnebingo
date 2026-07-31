'use client'

import {
  LÆRINGSMODUS,
  STANDARD_LYD,
  type Lydinnstillinger,
} from '@/domain/audio/settings'
import { Button } from '@/ui/shared/Button'
import { Segmented, type Choice } from '@/ui/shared/Controls'

/**
 * Vertens lydvalg (§13).
 *
 * Panelet er ordnet etter hvor ofte noe endres: programlederen øverst, fordi
 * det er der forskjellen merkes mest, og hjelpemidlene nederst, fordi de settes
 * én gang for et bestemt barn.
 *
 * De to knappene på toppen er snarveier, ikke ekstra valg — de setter de samme
 * bryterne som står under, og verten kan justere videre etterpå.
 */
export function LydPanel({
  verdi,
  onEndre,
  onTest,
  kanLeseNavn,
}: {
  verdi: Lydinnstillinger
  onEndre: (neste: Lydinnstillinger) => void
  onTest: () => void
  /** Finnes navneklipp i det hele tatt? Uten dem er valget meningsløst. */
  kanLeseNavn: boolean
}) {
  const sett = <K extends keyof Lydinnstillinger>(nøkkel: K, v: Lydinnstillinger[K]) =>
    onEndre({ ...verdi, [nøkkel]: v })

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button tone="stille" onClick={() => onEndre({ ...STANDARD_LYD, på: verdi.på })}>
          Vanlig gameshow
        </Button>
        <Button tone="stille" onClick={() => onEndre({ ...LÆRINGSMODUS, på: verdi.på })}>
          Rolig læringsmodus
        </Button>
        <Button tone="stille" onClick={onTest}>
          Hør stemmen
        </Button>
      </div>

      <Felt
        etikett="Programleder"
        hint="Hvor mye han legger seg i. «Bare tall» sier ingenting annet."
      >
        <Segmented
          ariaLabel="Programleder"
          value={verdi.programleder}
          onChange={(v) => sett('programleder', v)}
          options={
            [
              { value: 'av', label: 'Av' },
              { value: 'bareTall', label: 'Bare tall' },
              { value: 'tallOgMeldinger', label: 'Tall og meldinger' },
              { value: 'fulltGameshow', label: 'Fullt gameshow' },
            ] as ReadonlyArray<Choice<Lydinnstillinger['programleder']>>
          }
        />
      </Felt>

      <Felt etikett="Opplesningsnivå" hint="Hvor mye variasjon det er rundt tallet.">
        <Segmented
          ariaLabel="Opplesningsnivå"
          value={verdi.nivå}
          onChange={(v) => sett('nivå', v)}
          options={
            [
              { value: 'enkel', label: 'Enkel' },
              { value: 'variert', label: 'Variert' },
              { value: 'gameshow', label: 'Gameshow' },
              { value: 'rolig', label: 'Rolig' },
            ] as ReadonlyArray<Choice<Lydinnstillinger['nivå']>>
          }
        />
      </Felt>

      <Felt
        etikett="Tallopplesning"
        hint="«Tjueen … to en» gjør tallet tydelig for de som ennå leser langsomt."
      >
        <Segmented
          ariaLabel="Tallopplesning"
          value={verdi.tallopplesning}
          onChange={(v) => sett('tallopplesning', v)}
          options={
            [
              { value: 'helt', label: 'Helt tall' },
              { value: 'heltOgSifre', label: 'Tall og sifre' },
              { value: 'bokstavHeltOgSifre', label: 'Bokstav, tall og sifre' },
            ] as ReadonlyArray<Choice<Lydinnstillinger['tallopplesning']>>
          }
        />
      </Felt>

      <Felt etikett="Bokstav" hint="Gjelder bare formater med B–I–N–G–O.">
        <Segmented
          ariaLabel="Bokstav"
          value={verdi.bokstav}
          onChange={(v) => sett('bokstav', v)}
          options={
            [
              { value: 'før', label: 'Før tallet' },
              { value: 'etter', label: 'Etter tallet' },
              { value: 'av', label: 'Ingen' },
            ] as ReadonlyArray<Choice<Lydinnstillinger['bokstav']>>
          }
        />
      </Felt>

      <Felt
        etikett="Historier"
        hint="Korte innslag mellom tallene. Kommer aldri når noen er nær bingo."
      >
        <Segmented
          ariaLabel="Historier"
          value={verdi.historier}
          onChange={(v) => sett('historier', v)}
          options={
            [
              { value: 'av', label: 'Av' },
              { value: 'sjelden', label: 'Sjelden' },
              { value: 'normal', label: 'Normal' },
              { value: 'ofte', label: 'Ofte' },
            ] as ReadonlyArray<Choice<Lydinnstillinger['historier']>>
          }
        />
      </Felt>

      <div className="grid gap-6 sm:grid-cols-2">
        <Felt etikett="Musikk" hint="Dempes automatisk når programlederen snakker.">
          <Segmented
            ariaLabel="Musikk"
            value={verdi.musikk}
            onChange={(v) => sett('musikk', v)}
            options={NIVÅVALG}
          />
        </Felt>

        <Felt etikett="Lydeffekter" hint="Trekk, markering, bingo og fanfare.">
          <Segmented
            ariaLabel="Lydeffekter"
            value={verdi.effekter}
            onChange={(v) => sett('effekter', v)}
            options={NIVÅVALG}
          />
        </Felt>
      </div>

      <Felt etikett="Tempo" hint="Hvor lang pause det er før neste replikk.">
        <Segmented
          ariaLabel="Tempo"
          value={verdi.tempo}
          onChange={(v) => sett('tempo', v)}
          options={
            [
              { value: 'rolig', label: 'Rolig' },
              { value: 'normalt', label: 'Normalt' },
              { value: 'raskt', label: 'Raskt' },
            ] as ReadonlyArray<Choice<Lydinnstillinger['tempo']>>
          }
        />
      </Felt>

      <Felt etikett="Hjelp til barn" hint="Tallet sies én gang til på slutten.">
        <Segmented
          ariaLabel="Gjenta tallet"
          value={verdi.gjentaTallet}
          onChange={(v) => sett('gjentaTallet', v)}
          options={
            [
              { value: false, label: 'Av' },
              { value: true, label: 'Gjenta tallet' },
            ] as ReadonlyArray<Choice<boolean>>
          }
        />
      </Felt>

      {kanLeseNavn && (
        <Felt
          etikett="Spillernavn"
          hint="Programlederen sier navnene høyt. Uten dette sier han «én spiller til»."
        >
          <Segmented
            ariaLabel="Spillernavn"
            value={verdi.lesNavn}
            onChange={(v) => sett('lesNavn', v)}
            options={
              [
                { value: true, label: 'Si navnene' },
                { value: false, label: 'Uten navn' },
              ] as ReadonlyArray<Choice<boolean>>
            }
          />
        </Felt>
      )}
    </div>
  )
}

const NIVÅVALG: ReadonlyArray<Choice<'av' | 'lav' | 'normal'>> = [
  { value: 'av', label: 'Av' },
  { value: 'lav', label: 'Lav' },
  { value: 'normal', label: 'Normal' },
]

function Felt({
  etikett,
  hint,
  children,
}: {
  etikett: string
  hint: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <div>
        <p className="text-lg font-bold">{etikett}</p>
        <p className="text-base text-tekst-svak">{hint}</p>
      </div>
      {children}
    </div>
  )
}
