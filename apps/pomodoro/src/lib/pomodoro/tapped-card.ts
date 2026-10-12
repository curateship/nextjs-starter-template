import * as React from "react"

/**
 * The one card a tap set playing, across every grid of films on the page.
 *
 * A mouse plays a card's film while it hovers, and leaving the card stops it.
 * A phone has no hover, so a tap plays the film instead, and nothing used to
 * stop it but a second tap: four cards tapped meant four films at once. Now
 * a tap on one card stops the card tapped before it, wherever that card is.
 */
let tappedKey: string | null = null
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function setTappedKey(next: string | null) {
  if (next === tappedKey) return
  tappedKey = next
  for (const listener of listeners) listener()
}

/** Plays this card, stopping any other, or stops it if it was the one. */
export function toggleTappedCard(key: string) {
  setTappedKey(tappedKey === key ? null : key)
}

/** Stops this card if a tap had it playing. */
export function clearTappedCard(key: string) {
  if (tappedKey === key) setTappedKey(null)
}

export function isTappedCard(key: string) {
  return tappedKey === key
}

/**
 * Whether a tap has this card playing, with the calls to change it. The key
 * must be unique across grids, so it carries what the card shows, for
 * example `background:lofi` or `upload:<media id>`.
 */
export function useTappedCard(key: string) {
  const tapped = React.useSyncExternalStore(
    subscribe,
    () => tappedKey === key,
    () => false
  )
  // A card that leaves the page stops being the one playing, so it does not
  // start by itself when the same card is drawn again later.
  React.useEffect(() => () => clearTappedCard(key), [key])
  const toggle = React.useCallback(() => toggleTappedCard(key), [key])
  const clear = React.useCallback(() => clearTappedCard(key), [key])
  return { tapped, toggle, clear }
}
