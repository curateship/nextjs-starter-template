import * as React from "react"
import { PersonStandingIcon } from "lucide-react"

import { Checkbox } from "@/components/ui/checkbox"
import { plural } from "@/lib/format/plural"
import { cn } from "@/lib/utils"

/**
 * The card that shows while a break is on: a line that says what the break
 * is for and a short list of things to do away from the screen. Tyler's
 * designs of 8 Oct 2026, one for the short break and one for the long one.
 * The timer and a room both draw it.
 *
 * The ticks are only for the person ticking them. They are kept for this
 * break and start empty on the next one, which is why the caller keys the
 * card by the break it belongs to.
 */

const SHORT_BREAK_STEPS = [
  "Look at something 20 feet away for 20 seconds",
  "Roll your shoulders and stretch your neck",
  "Refill your water",
]

const LONG_BREAK_STEPS = [
  "Go for a short walk, even just around the room",
  "Have a snack or make a drink",
  "Do a full-body stretch for a couple of minutes",
  "Check in on something that isn't a screen",
]

export function BreakCard({
  kind,
  minutes,
  sessions,
  className,
}: {
  kind: "short" | "long"
  /** How long this break is, so the heading says the real number. */
  minutes: number
  /** The focuses in a round, which the long break's line counts. */
  sessions: number
  className?: string
}) {
  const steps = kind === "short" ? SHORT_BREAK_STEPS : LONG_BREAK_STEPS
  const [done, setDone] = React.useState<ReadonlySet<number>>(() => new Set())
  const headingId = React.useId()
  const title =
    kind === "short"
      ? `Nice work! Take a ${minutes} minute break from the screen`
      : `Great session! Take ${minutes} ${plural(minutes, "minute")} to recharge`
  const line =
    kind === "short"
      ? "Stand up, stretch and give your eyes a rest."
      : `You finished all ${sessions} ${plural(sessions, "session")}. Get up and move around properly.`

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        "flex w-full flex-col gap-3 rounded-[24px] border border-sky-400/25 bg-gradient-to-br from-sky-400/10 via-[var(--p-surface)] to-[var(--p-surface)] p-5 sm:p-6",
        className
      )}
    >
      <header className="flex items-center gap-4 px-1 pb-1">
        <span
          aria-hidden="true"
          className="grid size-11 shrink-0 place-items-center rounded-full bg-sky-400/15 text-sky-700 dark:text-sky-300"
        >
          <PersonStandingIcon className="size-5" />
        </span>
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id={headingId} className="text-lg font-semibold leading-snug">
            {title}
          </h2>
          <p className="text-[15px] text-muted-foreground">{line}</p>
        </div>
      </header>
      <ul className="flex flex-col gap-2">
        {steps.map((step, index) => {
          const id = `${headingId}-step-${index}`
          const checked = done.has(index)
          return (
            <li key={step}>
              <label
                htmlFor={id}
                className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl bg-foreground/[0.04] px-3 py-2 dark:bg-black/20"
              >
                <Checkbox
                  id={id}
                  checked={checked}
                  onCheckedChange={() =>
                    setDone((current) => {
                      const next = new Set(current)
                      if (next.has(index)) next.delete(index)
                      else next.add(index)
                      return next
                    })
                  }
                  className="size-5 rounded-full border-[1.5px] border-muted-foreground/60 dark:bg-transparent"
                />
                <span
                  className={cn(
                    "text-[15px]",
                    checked && "text-muted-foreground line-through"
                  )}
                >
                  {step}
                </span>
              </label>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
