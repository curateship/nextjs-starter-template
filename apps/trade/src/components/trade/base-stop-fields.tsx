import { OptionCard } from "@/components/trade/option-card"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { BASE_STOP_INTERVAL } from "@/lib/trade/dca"

/**
 * The base half of a ladder's stop: rest it under the confirmed base instead
 * of a fixed distance from the entry.
 *
 * Lives in its own file because two screens ask for it — the window that
 * places a ladder and the one that edits a live ladder's exits — and the words
 * are the difficult part. A rule explained two ways is a rule nobody trusts.
 *
 * It owns nothing. Both screens keep the three answers themselves, the same
 * way they keep every other field.
 */
export function BaseStopFields({
  on,
  underPct,
  reclaimDays,
  disabled,
  onOn,
  onUnderPct,
  onReclaimDays,
}: {
  on: boolean
  underPct: string
  reclaimDays: string
  disabled: boolean
  onOn: (next: boolean) => void
  onUnderPct: (next: string) => void
  onReclaimDays: (next: string) => void
}) {
  return (
    <OptionCard
      id="base-stop-on"
      title="Stop under the base"
      defaultOpen={on}
      hint={`The stop moves onto the ${BASE_STOP_INTERVAL} base once one confirms below your buy; the percent above stands until then, so set it to 100 for no stop before that. If it fires, everything sells and the next rung down goes on with a fresh stop — until the rungs run out, which ends the ladder for good.`}
      toggle={{ checked: on, disabled, onChange: onOn }}
    >
      <div className="grid gap-2">
        <FieldLabel
          htmlFor="base-stop-under"
          hint="0 rests it on the base itself, which is the setup this was measured on. Raise it to sit clear of the level so a poke through does not take you out."
        >
          Percent under the base
        </FieldLabel>
        <Input
          id="base-stop-under"
          inputMode="decimal"
          value={underPct}
          disabled={disabled || !on}
          onChange={(event) => onUnderPct(event.target.value)}
        />
      </div>

      <div className="grid gap-2">
        <FieldLabel
          htmlFor="base-stop-reclaim"
          hint="Price closing back above where you were cut, and holding above it this long, puts the same rung back for the same money. A close under starts the wait again."
        >
          Buy back after (days)
        </FieldLabel>
        <Input
          id="base-stop-reclaim"
          inputMode="decimal"
          value={reclaimDays}
          disabled={disabled || !on}
          onChange={(event) => onReclaimDays(event.target.value)}
        />
      </div>
    </OptionCard>
  )
}
