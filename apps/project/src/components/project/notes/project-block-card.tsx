import * as React from "react"

import {
  BlockCard,
  BlockHeadingActions,
  useBlockCount,
  useBlockMenu,
  useBlockOpen,
  type BlockMenuItem,
} from "@/components/shared/notes/block-card"
import { useBlockHeight } from "@/components/project/notes/block-heights"
import { ScrollArea } from "@/components/ui/scroll-area"
import { DashboardCardHeader } from "@/components/shared/dashboard-card-header"
import { DashboardTabs, type DashboardTab } from "@/components/shared/dashboard-tabs"
import type { BlockEditing } from "@/components/project/notes/note-block-drawings"
import { cn } from "@/lib/utils"


/**
 * Every card-shaped Project block in the shell's block card (task "Shell
 * look/three-panel-shell-look", Tyler, 9 Nov 2026: "update the app's all 3
 * panel dashboard to match the improved shell's ui"): a frosted grey box with
 * its corners, grey and edge from Settings → Styling → Blocks, a 57px heading
 * whose title folds it, a ⋮ holding the block's own rows then Delete block,
 * and what it shows on one white tile. Project's blocks keep their own nodes
 * and drawings; only the card is the shell's.
 *
 * The same drawing serves the editor and the reading view, so a page read
 * only gets the card with no Delete block.
 */
export function ProjectBlockCard({
  editing,
  kind,
  title,
  icon,
  count,
  menu,
  children,
}: {
  editing: BlockEditing
  /** The name its fold is remembered under in this browser. */
  kind: string
  title: string
  icon: React.ReactNode
  /** Beside the title, on its patch. */
  count?: number
  /** The block's own rows in its ⋮, above Delete block. */
  menu?: BlockMenuItem[]
  children: React.ReactNode
}) {
  return (
    <div className={ONE_LINE_TITLE}>
    <BlockCard
      editable={editing.editable}
      onRemove={editing.editable ? editing.remove : undefined}
      kind={kind}
      title={title}
      icon={icon}
    >
      <HeadingExtras count={count} menu={menu} />
      <BlockBody>{children}</BlockBody>
    </BlockCard>
    </div>
  )
}

/**
 * What a block shows, in a scroll area filling its tile, as Trade's blocks
 * are (Tyler, 11 Nov 2026: "it needs area scroll and it needs to have the
 * height automatic adjustment like how trade blocks does it"). The tile stops
 * at 28rem and a longer list scrolls inside it, so one long block never
 * pushes the rest of the page away. When the panel has room to spare, a
 * cut-off block grows into it, and the last block on the page reaches the
 * panel's bottom (`block-heights.ts`). The tile is the shell's
 * (`shared/notes/block-card.tsx`), so its height is set on it from here
 * rather than by changing the shell's card.
 */
function BlockBody({ children }: { children: React.ReactNode }) {
  const open = useBlockOpen()
  // Held twice: the state lets the measurer start once the tile is there, and
  // the ref is what the height is written on.
  const [tile, setTile] = React.useState<HTMLElement | null>(null)
  const tileRef = React.useRef<HTMLElement | null>(null)
  const share = useBlockHeight(tile, open)
  const findTile = React.useCallback((node: HTMLDivElement | null) => {
    const found = node?.closest<HTMLElement>("[data-block-tile]") ?? null
    tileRef.current = found
    setTile(found)
  }, [])
  React.useLayoutEffect(() => {
    const tile = tileRef.current
    if (!tile) return
    tile.style.height = share.height !== null ? `${share.height}px` : ""
    tile.style.maxHeight = share.height !== null ? "none" : ""
    // While this block fills, the page drops what sits under it (`project-page-notes.tsx`).
    tile.classList.toggle(BLOCK_FILLS, share.fills)
  }, [tile, share])
  return (
    <ScrollArea
      ref={findTile}
      // A column, so the scrolling box takes the tile's height whether the
      // tile is capped at 28rem or given a height. A plain "full height"
      // resolves against nothing under a cap alone, and the box grew to its
      // rows with nothing to scroll.
      className="flex min-h-0 flex-1 flex-col"
      viewportClassName="h-auto min-h-0 flex-1"
    >
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)]">{children}</div>
    </ScrollArea>
  )
}

/**
 * A block's tabs, drawn as the middle panel's List, Board and Calendar are
 * (Tyler, 11 Nov 2026: "fix the tabs ui. it needs to be consistent with ui
 * standard", then "no it needs to look like this", of My tasks' tabs): the
 * shell's panel header with `DashboardTabs` in it, so they follow Settings →
 * Styling → Dashboard tabs and an underline sits on the header's line. It
 * stays at the top of the tile while the rows under it scroll.
 */
export function BlockTabs({
  value,
  onValueChange,
  tabs,
}: {
  value: string
  onValueChange: (value: string) => void
  tabs: DashboardTab[]
}) {
  return (
    <DashboardCardHeader className="sticky top-0 z-10 bg-[var(--block-body)]">
      <DashboardTabs value={value} onValueChange={onValueChange} tabs={tabs} />
    </DashboardCardHeader>
  )
}

/** On a block's tile while it reaches the panel's bottom. */
export const BLOCK_FILLS = "project-block-fills"

/**
 * A block's title on one line, cut short with "…" in a narrow panel, so the
 * heading stays the panel header's 57px instead of breaking a project's name
 * one letter a line beside its buttons. A block with no buttons of its own
 * gives their empty spot's gap to the title too ("Check-ins" fits at the
 * narrowest panel). Set from outside the shell's card, on a wrapper that
 * draws no box of its own.
 */
export const ONE_LINE_TITLE =
  "contents [&_h2>button>span:first-child]:block [&_h2>button>span:first-child]:truncate [&_h2+span:empty]:hidden"

/**
 * A block's own buttons in its heading row, shown while the heading is
 * pointed at or holds the keyboard, while one of them has its dropdown open,
 * and always on a phone, as its ⋮ is. The rest of the time the title has the
 * room.
 */
export function QuietHeadingButtons({ children }: { children: React.ReactNode }) {
  return (
    <BlockHeadingActions>
      <span className="hidden items-center gap-1 group-hover/fold:flex group-has-[:focus-visible]/fold:flex has-[[data-state=open]]:flex [@media(hover:none)]:flex">
        {children}
      </span>
    </BlockHeadingActions>
  )
}

/** Hands the count and the ⋮ rows to the heading, from inside the card. */
function HeadingExtras({ count, menu }: { count: number | undefined; menu: BlockMenuItem[] | undefined }) {
  useBlockCount(count)
  useBlockMenu(menu)
  return null
}

/**
 * A small grey heading inside a block's tile, over one group of its rows
 * ("Didn't check in", "Invited"), with its count at the right.
 */
export function TileHeading({ children, count, className }: { children: React.ReactNode; count?: number; className?: string }) {
  return (
    <div className={cn("flex min-w-0 items-center justify-between gap-2 px-4 pt-3 text-sm font-medium text-muted-foreground", className)}>
      <span className="min-w-0 truncate">{children}</span>
      {count !== undefined ? <span className="shrink-0 tabular-nums">{count}</span> : null}
    </div>
  )
}

/** The tile's own padding for a block whose body is not rows. */
export const TILE_BODY = "grid min-w-0 gap-3 p-3"
