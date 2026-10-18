import * as React from "react"

import { loadHidePnl } from "@/lib/api/trade/hide-pnl"
import { useEffectBeforePaint } from "@/lib/hooks/use-effect-before-paint"

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
 * Brings the saved choice into this page, once, the first time anything that
 * reads the switch is drawn: the browser's remembered answer before the first
 * paint, then the server's, which wins.
 *
 * **Every reader starts it, not the header.** It used to run from Trade's top
 * bar, which is on every screen of Trade on its own. Inside Personal's middle
 * panel Trade draws no top bar, so the saved choice never arrived and every
 * figure showed. Tyler found it on 18 Oct 2026.
 *
 * **Every other open copy of Trade follows the switch at once**: another tab,
 * or a Trade screen kept loaded in Personal. Each copy keeps the answer in its
 * own memory, so the browser's note that the remembered answer changed in
 * another page is applied here too. That is also how a choice made in Trade's
 * own tab reaches a copy inside Personal, which has no switch of its own.
 */
let started = false
/** The server read is asked for once a page; a refused read lets the next reader try again. */
let asked = false

function startSync() {
  if (!started) {
    started = true
    const remembered = startHidePnl()
    if (remembered !== null) setHidePnl(remembered)
    window.addEventListener("storage", (event) => {
      if (event.key !== STORAGE_KEY || event.newValue === null) return
      setHidePnl(event.newValue === "true")
    })
  }
  if (asked) return
  asked = true
  // Read after the remembered answer has been applied, so only a person
  // pressing the switch in the meantime counts as newer than this read.
  const at = version
  void loadHidePnl()
    .then((answer) => {
      if (version === at) setHidePnl(answer.hidden)
    })
    .catch(() => {
      asked = false
    })
}

/**
 * True while profit and loss is hidden.
 *
 * Always false on the server, so the page hydrates from the answer it was
 * rendered with. The saved choice is applied a beat later, before the browser
 * paints, by `startSync`.
 */
export function useHidePnl(): boolean {
  useEffectBeforePaint(startSync, [])
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
