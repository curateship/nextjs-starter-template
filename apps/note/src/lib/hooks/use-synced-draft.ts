import * as React from "react"

/**
 * A box somebody types in, that follows the saved value when the saved value
 * changes underneath it.
 *
 * Every editable field with a draft of its own needs this: typing writes to the
 * draft so the caret never jumps mid-save, and a new saved value — a different
 * record opened, a save coming back — replaces the draft.
 *
 * **Not an effect.** Setting state in an effect body makes React render twice
 * for one change, and `react-hooks/set-state-in-effect` refuses it. This is
 * React's own answer: compare against the last value seen during render and
 * adjust there, so the corrected value is in the first paint rather than the
 * second. https://react.dev/learn/you-might-not-need-an-effect
 *
 * The draft is replaced, not merged, so a half-typed edit loses out to a new
 * saved value. That is the right way round: the alternative is a box showing
 * one record's words beside another record's label.
 */
export function useSyncedDraft<T>(
  value: T
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [draft, setDraft] = React.useState(value)
  const [lastValue, setLastValue] = React.useState(value)

  if (lastValue !== value) {
    setLastValue(value)
    setDraft(value)
  }

  return [draft, setDraft]
}
