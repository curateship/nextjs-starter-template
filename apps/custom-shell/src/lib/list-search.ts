import * as React from "react"
import { useNavigate } from "@tanstack/react-router"

/**
 * A dashboard's search, filters, sort and page live in the address rather than
 * in memory, so going into a record and pressing Back returns the exact list
 * you left, a refresh keeps it, and the address can be handed to somebody else.
 *
 * Two halves:
 *
 * - The readers below are what a route's `validateSearch` is built from. Every
 *   value is checked against a fixed list or a range, so a hand-edited address
 *   can only ever fall back to the default — it can never break the page or
 *   send it somewhere.
 * - `useListSearchNavigate` writes the values back, dropping anything sitting
 *   at its default so clearing a filter clears it from the address too.
 *
 * The pattern this follows is the media page's `?owner=`.
 */

/** Long enough for any real search, short enough that nothing is smuggled in. */
const MAX_SEARCH_LENGTH = 120

/** A page number nobody could paginate to by hand anyway. */
const MAX_PAGE = 10_000

/** The search box. Blank means absent, never `?q=`. */
export function readSearchText(value: unknown) {
  if (typeof value !== "string") return undefined
  const text = value.slice(0, MAX_SEARCH_LENGTH)
  return text.trim() ? text : undefined
}

/** One of a fixed list, or nothing. Anything else falls back to the default. */
export function readOneOf<const T extends string>(
  value: unknown,
  allowed: readonly T[]
): T | undefined {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined
}

/** Which way a column sorts. */
export function readDirection(value: unknown): "asc" | "desc" | undefined {
  return value === "asc" || value === "desc" ? value : undefined
}

/** A 1-based page. Page 1 is the default, so it stays out of the address. */
export function readPage(value: unknown) {
  const page = typeof value === "number" ? value : Number(value)
  return Number.isInteger(page) && page > 1 && page <= MAX_PAGE ? page : undefined
}

/**
 * Writes list state back to the address. `replace` so a filter change does not
 * pile up a history entry per keystroke — Back then leaves the list entirely,
 * which is what somebody pressing it expects.
 */
export function useListSearchNavigate() {
  const navigate = useNavigate()

  return React.useCallback(
    (patch: Record<string, unknown>) => {
      void navigate({
        to: ".",
        search: (previous: Record<string, unknown>) =>
          dropDefaults({ ...previous, ...patch }),
        replace: true,
      })
    },
    [navigate]
  )
}

/** A value at its default is absent from the address, not an empty one. */
function dropDefaults(search: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(search).filter(
      ([, value]) => value !== undefined && value !== null && value !== ""
    )
  )
}

/**
 * The search box's text. Typing has to stay instant, so the input keeps its own
 * copy and the address catches up after the same 250ms these dashboards already
 * wait before fetching. Somebody else changing the address — Back, a pasted
 * link — puts the box back in step.
 */
export function useSearchBoxText(
  addressText: string,
  onSettled: (text: string) => void
) {
  const [text, setText] = React.useState(addressText)

  // The settler is a fresh function every render; keeping it in a ref leaves
  // the effect below keyed on the text, which is what actually changes.
  const settle = React.useRef(onSettled)
  React.useEffect(() => {
    settle.current = onSettled
  })

  // Somebody else changed the address — Back, or a pasted link — so the box
  // goes back in step. Adjusting during render rather than in an effect, which
  // is what React asks for when state has to follow a prop.
  const [lastAddressText, setLastAddressText] = React.useState(addressText)
  if (lastAddressText !== addressText) {
    setLastAddressText(addressText)
    setText(addressText)
  }

  React.useEffect(() => {
    if (text === addressText) return
    const timer = setTimeout(() => settle.current(text), SEARCH_SETTLE_MS)
    return () => clearTimeout(timer)
  }, [text, addressText])

  return [text, setText] as const
}

export const SEARCH_SETTLE_MS = 250
