import * as React from "react"

/**
 * How tall each Trade block on the left page is, worked out once for the
 * whole page so no two blocks claim the same spare room.
 *
 * A block shows at most 448px (28rem) and its list scrolls inside, so one
 * long list cannot push the blocks under it out of view. When the panel has
 * room to spare, a block whose list is cut off grows into it, page order
 * first, only as far as its own rows need (Tyler, 11 Nov 2026: "why is the
 * height capped if theres space in the left panel?", then "go"). What is
 * still spare goes to the last block on the page, which reaches the panel's
 * bottom (Tyler, 8 Nov 2026: "always make it fill all available space"). The
 * page then fits the panel exactly, so there is one scrollbar.
 *
 * A block that grew keeps its height when a block under it gets taller, such
 * as Folders opening a folder, and the panel scrolls instead (Tyler, 11 Nov
 * 2026: "if i click on the folder for the bottom panel ... it folder card
 * goes up a bit instead of staying in place"). Before, the block gave its
 * room back and everything under it moved up. It gives the room back only
 * when the panel itself changes height.
 */

/** What one block is told: an exact height, or null for its own. */
export type BlockShare = {
  height: number | null
  /** The last block, reaching the panel's bottom. */
  fills: boolean
}

export const OWN_HEIGHT: BlockShare = { height: null, fills: false }

/** Less room than this left under the last block, and it keeps its own height. */
export const MIN_FILL_PX = 240

/** One open block, in page order, as measured. */
export type MeasuredBlock = {
  /** Its height on screen now. */
  current: number
  /** Its height with nothing capping it: every row showing. */
  natural: number
  /** Whether it is the last thing on the page. */
  last: boolean
}

/**
 * Each block's share. `room` is the panel's height and `pageHeight` the
 * page's height now; the blocks' grown or filled heights are taken back out
 * of the page first, so the answer does not depend on the last answer and
 * the heights never bounce.
 */
export function shareHeights(
  blocks: readonly MeasuredBlock[],
  room: number,
  pageHeight: number,
  cap: number,
  /** True while the panel's height is the same as at the last pass. */
  keepGrown = false
): BlockShare[] {
  const base = blocks.map((block) => Math.min(block.natural, cap))
  const extra = blocks.reduce((sum, block, i) => sum + block.current - base[i], 0)
  let spare = room - (pageHeight - extra)
  return blocks.map((block, i) => {
    if (block.last) {
      // The last block takes what is left, or gives some back when the page
      // runs past the panel, as long as it keeps MIN_FILL_PX.
      const height = Math.floor(base[i] + spare)
      return height >= MIN_FILL_PX ? { height, fills: true } : OWN_HEIGHT
    }
    const want = block.natural - base[i]
    const kept = keepGrown ? Math.min(block.current, block.natural) - base[i] : 0
    const grow = Math.floor(Math.max(0, kept, Math.min(want, spare)))
    spare -= grow
    return grow > 0 ? { height: base[i] + grow, fills: false } : OWN_HEIGHT
  })
}

/**
 * Whether this block is the last thing on its page that shows: no block that
 * is not hidden, and no words, come after it.
 */
function lastOnPage(frame: Element, page: Element) {
  let top: Element = frame
  while (top.parentElement && top.parentElement !== page) top = top.parentElement
  for (let next = top.nextElementSibling; next; next = next.nextElementSibling) {
    const block = next.matches("[data-note-block]") ? next : next.querySelector("[data-note-block]")
    if (block) {
      if (!(block as HTMLElement).hidden) return false
    } else if (next.textContent?.trim()) {
      return false
    }
  }
  return true
}

type Entry = {
  tile: HTMLElement
  frame: Element
  publish: (share: BlockShare) => void
}

/** The one measurer for a page, shared by every block on it. */
class PageHeights {
  readonly entries = new Set<Entry>()
  private frameId = 0
  /** The panel's height at the last pass. */
  private room = -1
  private readonly sizes: ResizeObserver
  private readonly changes: MutationObserver

  constructor(
    private readonly page: Element,
    private readonly viewport: HTMLElement,
    private readonly content: Element
  ) {
    this.sizes = new ResizeObserver(() => this.schedule())
    this.sizes.observe(viewport)
    this.sizes.observe(content)
    // A block added, moved, hidden or written after another, or rows added
    // to a block's list.
    this.changes = new MutationObserver(() => this.schedule())
    this.changes.observe(page, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["hidden"],
    })
  }

  schedule() {
    cancelAnimationFrame(this.frameId)
    this.frameId = requestAnimationFrame(() => this.share())
  }

  stop() {
    cancelAnimationFrame(this.frameId)
    this.sizes.disconnect()
    this.changes.disconnect()
  }

  private share() {
    const shown: Entry[] = []
    for (const entry of this.entries) {
      if (entry.tile.isConnected && entry.tile.offsetParent !== null) shown.push(entry)
      else entry.publish(OWN_HEIGHT)
    }
    shown.sort((a, b) =>
      a.tile.compareDocumentPosition(b.tile) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1
    )
    const pageHeight = this.content.getBoundingClientRect().height
    const current = shown.map((entry) => entry.tile.getBoundingClientRect().height)
    // Every row showing: the tile's height and cap lifted for one read, then
    // put back before the browser draws.
    const kept = shown.map((entry) => entry.tile.style.cssText)
    for (const entry of shown) {
      entry.tile.style.height = ""
      entry.tile.style.maxHeight = "none"
    }
    const natural = shown.map((entry) => entry.tile.getBoundingClientRect().height)
    shown.forEach((entry, i) => {
      entry.tile.style.cssText = kept[i]
    })
    const cap = 28 * parseFloat(getComputedStyle(document.documentElement).fontSize)
    const lastIndex =
      shown.length && lastOnPage(shown[shown.length - 1].frame, this.page)
        ? shown.length - 1
        : -1
    const room = this.viewport.clientHeight
    const shares = shareHeights(
      shown.map((_, i) => ({ current: current[i], natural: natural[i], last: i === lastIndex })),
      room,
      pageHeight,
      cap,
      room === this.room
    )
    this.room = room
    shown.forEach((entry, i) => entry.publish(shares[i]))
  }
}

const pages = new WeakMap<Element, PageHeights>()

/** This block's share of the page, or its own height while folded. */
export function useBlockHeight(tile: HTMLElement | null, open: boolean): BlockShare {
  const [share, setShare] = React.useState<BlockShare>(OWN_HEIGHT)
  React.useEffect(() => {
    if (!tile || !open) return
    const page = tile.closest(".tiptap")
    const frame = tile.closest("[data-note-block]")
    const viewport = tile.closest<HTMLElement>('[data-slot="scroll-area-viewport"]')
    const content = viewport?.firstElementChild
    if (!page || !frame || !viewport || !content) return
    let heights = pages.get(page)
    if (!heights) {
      heights = new PageHeights(page, viewport, content)
      pages.set(page, heights)
    }
    const entry: Entry = {
      tile,
      frame,
      publish: (next) =>
        setShare((prev) =>
          prev.height === next.height && prev.fills === next.fills ? prev : next
        ),
    }
    heights.entries.add(entry)
    heights.schedule()
    const joined = heights
    return () => {
      joined.entries.delete(entry)
      if (joined.entries.size) joined.schedule()
      else {
        joined.stop()
        pages.delete(page)
      }
    }
  }, [open, tile])
  return open ? share : OWN_HEIGHT
}
