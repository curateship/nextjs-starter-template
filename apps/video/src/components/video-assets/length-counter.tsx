/** The share of the limit after which the count shows: 80 out of 100. */
const SHOW_FROM = 0.8

/**
 * "4,800 / 5,000" under a text box that stops at a length, once the words are
 * near the limit. Below that it draws nothing, so a short note never carries a
 * number it does not need. A box cuts pasted text at its limit without a word,
 * and this is what says so beforehand.
 */
export function LengthCounter({ length, max }: { length: number; max: number }) {
  if (length < max * SHOW_FROM) return null
  return (
    <span
      className={
        length >= max
          ? "text-xs tabular-nums text-destructive"
          : "text-xs tabular-nums text-muted-foreground"
      }
    >
      {length.toLocaleString()} / {max.toLocaleString()}
    </span>
  )
}
