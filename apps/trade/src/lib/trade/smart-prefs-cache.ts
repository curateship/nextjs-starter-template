import { loadSmartDcaParams, loadSmartGridParams } from "@/lib/api/trade/smart-orders"
import type { DcaParams } from "@/lib/trade/dca"
import type { GridParams } from "@/lib/trade/grid"

/**
 * The last-known settings of the two smart-order windows, remembered in the
 * browser for the life of the tab.
 *
 * The saved settings live on the server, which is one to two seconds away.
 * A window that opened on defaults and swapped to the saved setup when the
 * read landed changed shape in front of whoever had just opened it — the
 * range choice visibly snapped from one mode to the other. So the settings
 * are remembered HERE the moment they are first seen (or placed with), every
 * later window opens already on them, and the fetch is started as the
 * right-click menu opens so even the first window usually has its answer in
 * hand by the time a preset is picked.
 *
 * This is a copy of what the server said, never the record — the server's
 * row stays the one that is saved and loaded. Deliberately not localStorage:
 * trading preferences live on the server, and this only papers over the
 * seconds it takes to ask.
 */

let dcaKnown: DcaParams | null = null
let gridKnown: GridParams | null = null

let dcaPending: Promise<DcaParams | null> | null = null
let gridPending: Promise<GridParams | null> | null = null

// Counts placements. A read that left BEFORE a placement carries the settings
// from before it, and letting that answer land over the placement's own put
// the window back on a choice that had just been placed away — pick "Below
// the price you clicked", place, and the next window flipped itself to
// "Around today's price". A read only counts while nothing newer has been
// remembered since it started.
let dcaPlaced = 0
let gridPlaced = 0

/** What the last read or placement said, or null before either has happened. */
export function knownDcaPrefs(): DcaParams | null {
  return dcaKnown
}

export function knownGridPrefs(): GridParams | null {
  return gridKnown
}

/** A placement saved these on the server; the next window opens on them. */
export function rememberDcaPrefs(params: DcaParams): void {
  dcaKnown = params
  dcaPlaced += 1
}

export function rememberGridPrefs(params: GridParams): void {
  gridKnown = params
  gridPlaced += 1
}

/**
 * The settings as the page's own loader carried them, filled in only where
 * nothing is known yet. The dashboard's bootstrap hands these over at page
 * load, so the first right-click of a session opens on the saved settings
 * with nothing left to fetch. Never allowed to overwrite: the route keeps
 * its loader answer for up to a minute, so on a later visit these can be
 * older than a placement made in between, and older must never win.
 */
export function seedSmartPrefs(
  dca: DcaParams | null,
  grid: GridParams | null
): void {
  if (dca && !dcaKnown) dcaKnown = dca
  if (grid && !gridKnown) gridKnown = grid
}

/** Both settings reads, started early. Called as the right-click menu opens. */
export function prefetchSmartPrefs(): void {
  void freshDcaPrefs()
  void freshGridPrefs()
}

export function freshDcaPrefs(): Promise<DcaParams | null> {
  if (!dcaPending) {
    const startedAfter = dcaPlaced
    const read = loadSmartDcaParams()
      .then(({ params }) => {
        // A placement since this read left already knows better than the
        // answer — the answer is from before the placement was saved.
        if (dcaPlaced !== startedAfter) return dcaKnown
        if (params) dcaKnown = params
        return params
      })
      // A failed read answers with whatever is already known; the window
      // works either way.
      .catch(() => dcaKnown)
    dcaPending = read
    void read.finally(() => {
      if (dcaPending === read) dcaPending = null
    })
  }
  return dcaPending
}

export function freshGridPrefs(): Promise<GridParams | null> {
  if (!gridPending) {
    const startedAfter = gridPlaced
    const read = loadSmartGridParams()
      .then(({ params }) => {
        if (gridPlaced !== startedAfter) return gridKnown
        if (params) gridKnown = params
        return params
      })
      .catch(() => gridKnown)
    gridPending = read
    void read.finally(() => {
      if (gridPending === read) gridPending = null
    })
  }
  return gridPending
}
