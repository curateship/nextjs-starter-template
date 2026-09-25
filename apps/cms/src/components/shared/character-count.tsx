import { cn } from "@/lib/utils"

/**
 * How much of a capped field is used up, shown beside its label.
 *
 * A field with a `maxLength` and no counter simply stops accepting letters. To
 * the person typing, nothing is highlighted, nothing is said and the keyboard
 * appears to have died — several of them reloaded the page and lost what they
 * had written. This is the one answer to that, used on every capped field, so
 * one field behaving well and six not can never happen again.
 *
 * It owns nothing but the number: the field, its label and its state stay
 * where they were.
 */

/**
 * How close to the cap counts as "nearly there".
 *
 * Twenty characters is about three words — far enough ahead to finish a
 * sentence differently, close enough that saying it earlier would be noise.
 */
const NEARLY_FULL = 20

export function CharacterCount({
  value,
  max,
  className,
}: {
  /** What is currently in the field. */
  value: string
  /** The field's own `maxLength`. Pass the same number, not a copy of it. */
  max: number
  className?: string
}) {
  const used = value.length
  const left = max - used
  const nearlyFull = left <= NEARLY_FULL

  return (
    <span className={cn("flex items-center gap-1 text-xs", className)}>
      <span
        aria-hidden="true"
        className={cn(
          "tabular-nums",
          // Weight as well as colour, because the UI standard forbids saying
          // anything with colour alone.
          nearlyFull ? "font-medium text-foreground" : "text-muted-foreground"
        )}
      >
        {used}/{max}
        {left === 0 ? " · full" : null}
      </span>
      {/*
        * Announced, but not on all three hundred keystrokes. The live region
        * is empty until the cap is in sight, so a screen reader says something
        * when it is worth hearing rather than reading a running total aloud
        * through a whole paragraph.
        */}
      <span aria-live="polite" className="sr-only">
        {nearlyFull
          ? left === 0
            ? `Character limit reached: ${max} characters.`
            : `${left} characters left.`
          : ""}
      </span>
    </span>
  )
}
