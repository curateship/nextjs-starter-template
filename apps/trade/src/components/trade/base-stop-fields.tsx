import { OptionCard } from "@/components/trade/option-card"
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
    <OptionCard
      id="base-stop-on"
      title={short ? "Stop above resistance" : "Stop under the base"}
      defaultOpen={on}
      hint={
        short
          ? `The stop moves onto the ${BASE_STOP_INTERVAL} resistance once one confirms above your sell; the percent above stands until then, so set it to 100 for no stop before that. If it fires, the whole short is bought back and the grid is over.`
          : `The stop moves onto the ${BASE_STOP_INTERVAL} base once one confirms below your buy; the percent above stands until then, so set it to 100 for no stop before that. If it fires, everything sells and the next rung down goes on with a fresh stop — until the rungs run out, which ends the ladder for good.`
      }
      toggle={{ checked: on, disabled, onChange: onOn }}
    >
      <div className="grid gap-2">
        <FieldLabel
          htmlFor="base-stop-under"
          hint={
            short
              ? "0 rests it on the resistance itself. Raise it to sit clear of the level so a poke through does not take you out."
              : "0 rests it on the base itself, which is the setup this was measured on. Raise it to sit clear of the level so a poke through does not take you out."
          }
        >
          {short ? "Percent above resistance" : "Percent under the base"}
        </FieldLabel>
        <Input
          id="base-stop-under"
          inputMode="decimal"
          value={underPct}
          disabled={disabled || !on}
          // Only while the box is being used. A switched-off base stop keeps
          // whatever was last typed in it, and outlining a box nothing is
          // reading points at a problem that is not there.
          aria-invalid={showErrors && on && badBaseUnderPct(underPct)}
          onChange={(event) => onUnderPct(event.target.value)}
          onBlur={onBlur}
        />
      </div>

      <div className="grid gap-2">
        <FieldLabel
          htmlFor="base-stop-reclaim"
          hint={
            short
              ? "Price closing back under where you were cut, and holding under it this long, puts the same level back for the same money. A close above starts the wait again."
              : "Price closing back above where you were cut, and holding above it this long, puts the same rung back for the same money. A close under starts the wait again."
          }
        >
          {short ? "Sell again after (days)" : "Buy back after (days)"}
        </FieldLabel>
        <Input
          id="base-stop-reclaim"
          inputMode="decimal"
          value={reclaimDays}
          disabled={disabled || !on}
          aria-invalid={showErrors && on && badBaseReclaimDays(reclaimDays)}
          onChange={(event) => onReclaimDays(event.target.value)}
          onBlur={onBlur}
        />
      </div>
    </OptionCard>
  )
}
