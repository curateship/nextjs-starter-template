import * as React from "react"

/**
 * The one switch that hides every figure saying what you made or lost.
 *
 * **Why it is a store rather than a React context.** These figures are on
 * nearly every screen this app has — the header, both order panels, the bottom
 * panel, the P&L page, a backtest, a flow's run — and a context would need a
 * provider wrapped round a tree the shell owns, which an app may not edit. A
 * module with a listener list is read from anywhere, and every figure on
 * screen redraws in the frame the switch is pressed.
 *
 * **What it hides is money you made or lost, not money you have.** Balances,
 * order sizes and coin prices stay readable, because somebody hiding their
 * profit from the person beside them still has to be able to trade.
 */
const STORAGE_KEY = "trade:hide-pnl"

let hidden = false
/**
 * Counts every answer this browser has been given, so a slow read cannot
 * overwrite a newer one.
 *
 * The server read is asked for as the page opens and takes a moment. Somebody
 * who presses the switch inside that moment had their choice quietly undone
 * when the older answer landed on top of it.
 */
let version = 0
const listeners = new Set<() => void>()

/**
 * What this browser remembers, or null when it has never been told.
 *
 * The server is the truth. The browser's copy exists so a figure is not on
 * screen unblurred for the second the server takes to answer — the same trade
 * the watched levels make in `watched-cache.ts`.
 *
 * Deliberately one key for the browser rather than one per account. At the
 * moment this is read nobody knows yet who is signed in, and the two ways of
 * being wrong are not equal: hiding a figure that did not need hiding is a
 * blurred number for a third of a second, while showing one that did is the
 * thing the switch exists to prevent. The value is a yes or a no about
 * whoever uses this browser, and no amount of money is in it.
 */
export function startHidePnl(): boolean | null {
  if (typeof window === "undefined") return null
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    return saved === null ? null : saved === "true"
  } catch {
    return null
  }
}

/** Which answer this browser is on. See `version`. */
export function hidePnlVersion(): number {
  return version
}

/** Hides or shows every figure at once, and remembers the answer. */
export function setHidePnl(next: boolean) {
  version += 1
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, String(next))
    } catch {
      // A browser with site data switched off still gets the switch. It just
      // cannot remember it, which is the smaller of the two failures.
    }
  }
  if (hidden === next) return
  hidden = next
  for (const listener of listeners) listener()
}

/** The answer right now, for code that is not a component. */
export function hidePnlNow(): boolean {
  return hidden
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * True while profit and loss is hidden.
 *
 * Always false on the server, so the page hydrates from the answer it was
 * rendered with. The remembered choice is applied a beat later, by the
 * header's own switch, before the browser paints.
 */
export function useHidePnl(): boolean {
  return React.useSyncExternalStore(
    subscribe,
    () => hidden,
    () => false
  )
}

/**
 * The frosted glass a hidden figure wears: blurred past reading, and not
 * selectable, so it cannot be copied out of the page either.
 *
 * The figure keeps its place and its real width. Swapping it for dots would
 * move every column beside it the moment the switch was pressed, and a row
 * that jumps is a row somebody has to find again.
 */
const HIDDEN_PNL_CLASS = "blur-[5px] select-none"

/** The class a money figure adds while the switch is on, or nothing. */
export function useHiddenPnlClass(): string | undefined {
  return useHidePnl() ? HIDDEN_PNL_CLASS : undefined
}
