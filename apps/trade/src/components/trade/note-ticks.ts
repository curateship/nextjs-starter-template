import * as React from "react"

/**
 * Which rule notes are ticked on each coin, in this browser.
 *
 * Ticks belong to one coin and one entry: placing an order on the coin clears
 * them, so the next trade asks again, and a reload starts with none. Kept in
 * this module so the chart's Rules box and the window before an entry tick the
 * same boxes, and a layout change that remounts the chart keeps them.
 */
const ticks = new Map<string, ReadonlySet<string>>()
const listeners = new Set<() => void>()
const NONE: ReadonlySet<string> = new Set()

function changed() {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function noteTicksOf(marketKey: string): ReadonlySet<string> {
  return ticks.get(marketKey) ?? NONE
}

export function setNoteTick(marketKey: string, key: string, on: boolean) {
  const next = new Set(noteTicksOf(marketKey))
  if (on) next.add(key)
  else next.delete(key)
  ticks.set(marketKey, next)
  changed()
}

/** After an entry on the coin goes out: the next one ticks again. */
export function clearNoteTicks(marketKey: string) {
  if (!ticks.has(marketKey)) return
  ticks.delete(marketKey)
  changed()
}

/** The ticked note keys for one coin, redrawn whenever a box is ticked. */
export function useNoteTicks(marketKey: string | null): ReadonlySet<string> {
  return React.useSyncExternalStore(
    subscribe,
    () => (marketKey ? noteTicksOf(marketKey) : NONE),
    () => NONE
  )
}
