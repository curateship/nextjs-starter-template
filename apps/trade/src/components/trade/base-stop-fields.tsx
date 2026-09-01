import { Checkbox } from "@/components/ui/checkbox"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { badBaseReclaimDays, badBaseUnderPct } from "@/lib/trade/base-stop"
import { BASE_STOP_INTERVAL } from "@/lib/trade/dca"

/**
 * The level half of a stop: rest it past the confirmed 4h level instead of a
 * fixed distance from the entry.
 *
 * Lives in its own file because five screens ask for it — the windows that
 * place a ladder and a grid, the two that edit a live one's exits, and the
 * automation panel — and the words are the difficult part. A rule explained
 * two ways is a rule nobody trusts.
 *
 * A plain checkbox row, not a card of its own — Tyler's ask, 1 Sep 2026: it
 * sits inside the Stop loss card already, and a card in a card read as a
 * second window. Its two boxes appear under the row while it is on.
 *
 * **The level has two sides.** A buying plan rests under a confirmed floor,
 * which this app calls a base. A selling grid rests above a confirmed ceiling,
 * which is resistance. Same indicator, same settings, same pass — mirrored. So
 * the words mirror too, and `direction` is the only thing that decides which
 * set you see.
 *
 * It owns nothing. Every screen keeps the three answers itself, the same way
 * it keeps every other field. What counts as a bad answer, and the sentence
 * each bad answer gives back, is in `lib/trade/base-stop.ts` so the screens'
 * refusal lines and these boxes' outlines can never disagree.
 */
export function BaseStopFields({
  on,
  underPct,
  reclaimDays,
  disabled,
  showErrors = true,
  direction = "long",
  onOn,
  onUnderPct,
  onReclaimDays,
  onBlur,
}: {
  on: boolean
  underPct: string
  reclaimDays: string
  disabled: boolean
  showErrors?: boolean
  /**
   * Which way the plan runs. Everything but a selling grid buys first, so
   * "long" is the default and no other screen has to say anything.
   */
  direction?: "long" | "short"
  onOn: (next: boolean) => void
  onUnderPct: (next: string) => void
  onReclaimDays: (next: string) => void
  onBlur?: () => void
}) {
  const short = direction === "short"
  return (
    <>
      <div className="flex items-center gap-2">
        <Checkbox
          id="base-stop-on"
          checked={on}
          disabled={disabled}
          onCheckedChange={(next) => onOn(next === true)}
        />
        <FieldLabel
          htmlFor="base-stop-on"
          hint={
            short
              ? `The stop moves onto the ${BASE_STOP_INTERVAL} resistance once one confirms above your short. Until then the percent above stands — 100 means no stop before it.`
              : `The stop moves onto the ${BASE_STOP_INTERVAL} base once one confirms below your buy. Until then the percent above stands — 100 means no stop before it.`
          }
        >
          {short ? "Stop above resistance" : "Stop under the base"}
        </FieldLabel>
      </div>
      {on ? (
        <>
          <div className="grid gap-2">
            <FieldLabel
              htmlFor="base-stop-under"
              hint="0 rests it on the level itself. Raise it to sit clear, so a poke through does not take you out."
            >
              {short ? "Percent above resistance" : "Percent under the base"}
            </FieldLabel>
            <Input
              id="base-stop-under"
              inputMode="decimal"
              value={underPct}
              disabled={disabled}
              aria-invalid={showErrors && badBaseUnderPct(underPct)}
              onChange={(event) => onUnderPct(event.target.value)}
              onBlur={onBlur}
            />
          </div>

          <div className="grid gap-2">
            <FieldLabel
              htmlFor="base-stop-reclaim"
              hint={
                short
                  ? "Price closing back under where you were cut, and holding this long, puts the level back for the same money."
                  : "Price closing back above where you were cut, and holding this long, puts the rung back for the same money."
              }
            >
              {short ? "Sell again after (days)" : "Buy back after (days)"}
            </FieldLabel>
            <Input
              id="base-stop-reclaim"
              inputMode="decimal"
              value={reclaimDays}
              disabled={disabled}
              aria-invalid={showErrors && badBaseReclaimDays(reclaimDays)}
              onChange={(event) => onReclaimDays(event.target.value)}
              onBlur={onBlur}
            />
          </div>
        </>
      ) : null}
    </>
  )
}
