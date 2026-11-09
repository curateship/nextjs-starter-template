import * as React from "react"

import {
  BlockCard,
  BlockHeadingActions,
  useBlockCount,
  useBlockMenu,
  type BlockMenuItem,
} from "@/components/shared/notes/block-card"
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
      {/* The tile stops at 28rem and a longer block scrolls inside it, so one
          long block never pushes the rest of the page away (the design's rule). */}
      <div className="grid min-h-0 grid-cols-[minmax(0,1fr)] overflow-y-auto [scrollbar-width:thin]">{children}</div>
    </BlockCard>
    </div>
  )
}

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
