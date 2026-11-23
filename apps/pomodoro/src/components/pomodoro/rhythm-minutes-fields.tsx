import { NumberField } from "@/components/ui/number-field"

/**
 * The "Focus / Short break / Long break" minutes triple.
 *
 * One component because the same three boxes are on the Settings card, inside
 * a custom preset and in the host-a-room dialog, and three copies drifted:
 * two of them guarded a cleared box with a ternary and one did not, so the
 * same field showed `NaN` on one screen and an empty box on another.
 *
 * Each box is a `NumberField`, which keeps half-typed text on screen and only
 * hands back a whole number inside the limits. Clearing a box therefore leaves
 * the last good number in the form's state: Save and Create stay pressable and
 * save what the boxes last agreed on, rather than going dead with no word.
 *
 * `idPrefix` keeps the three ids apart when two of these are on one page. Pass
 * something with no spaces in it, because the ids become `htmlFor` targets.
 */
export const RHYTHM_MINUTES_MIN = 1
export const RHYTHM_MINUTES_MAX = 90

export function RhythmMinutesFields({
  idPrefix,
  focusMinutes,
  shortBreakMinutes,
  longBreakMinutes,
  onFocusMinutes,
  onShortBreakMinutes,
  onLongBreakMinutes,
  className = "grid gap-4 sm:grid-cols-3",
}: {
  idPrefix: string
  focusMinutes: number
  shortBreakMinutes: number
  longBreakMinutes: number
  onFocusMinutes: (value: number) => void
  onShortBreakMinutes: (value: number) => void
  onLongBreakMinutes: (value: number) => void
  className?: string
}) {
  const fields = [
    ["focus", "Focus minutes", focusMinutes, onFocusMinutes],
    ["short", "Short break", shortBreakMinutes, onShortBreakMinutes],
    ["long", "Long break", longBreakMinutes, onLongBreakMinutes],
  ] as const

  return (
    <div className={className}>
      {fields.map(([key, label, value, onChange]) => (
        <NumberField
          key={key}
          id={`${idPrefix}-${key}`}
          label={label}
          value={value}
          min={RHYTHM_MINUTES_MIN}
          max={RHYTHM_MINUTES_MAX}
          onChange={onChange}
        />
      ))}
    </div>
  )
}
