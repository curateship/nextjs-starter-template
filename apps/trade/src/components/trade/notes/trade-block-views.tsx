import * as React from "react"
import { createPortal } from "react-dom"
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  EllipsisVerticalIcon,
  FolderIcon,
  Grid2x2Icon,
  LayersIcon,
  LayoutDashboardIcon,
  ListOrderedIcon,
  RadarIcon,
  ShieldCheckIcon,
  Trash2Icon,
} from "lucide-react"

import { BlockColumnsMenuRows, BlockHiddenColumns } from "@/components/trade/block-columns"
import { FoldHeading } from "@/components/trade/notes/fold-heading"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Collapsible,
  CollapsibleContent,
} from "@/components/ui/collapsible"
import {
  collapseStorageKey,
  useRememberedCollapse,
} from "@/lib/remembered-choice"
import { isTradeTableBlock } from "@/lib/trade/block-columns"
import { cn } from "@/lib/utils"

/**
 * Trade's own "/" blocks (the Admin 3 panel design, 7 Nov 2026; Tyler: "we
 * turn rules, folders, scanners, alerts, grid trades, dca trades and manual
 * trades into blocks", and the market's own details on the right). A block
 * keeps no values. It draws what the dashboard already shows, handed down by
 * `TradeBlocksProvider` around the page, so a block is the same live panel
 * that used to sit in its own column or behind a header button.
 */

/** What each block draws, from the dashboard that holds the page. */
export type TradeBlocks = {
  /**
   * A Rules block is a box the chart draws into, as the left panel was
   * before: the chart works out the rules' figures, so it keeps drawing them.
   * Each Rules block on screen, on either page, adds its box and takes it
   * away again when it goes.
   */
  addRulesSlot: (element: HTMLElement) => () => void
  grid: React.ReactNode
  dca: React.ReactNode
  manual: React.ReactNode
  scanner: React.ReactNode
  folders: React.ReactNode
  /**
   * The Protocols block's rows: Overview, then each exchange, the one on
   * screen picked (Tyler, 8 Nov 2026: "The protocols now goes into the left
   * panel as a block").
   */
  protocols: React.ReactNode
  /**
   * The rows the Protocols block's ⋮ adds before Move up and Move down: each
   * exchange with an eye to show it or hide it (Tyler, 8 Nov 2026: "the
   * protocols show and hide should be edited here and use the eye icon with
   * a slash to hide/unhide").
   */
  protocolsMenu: React.ReactNode
  /** The Folders block's ⋮ rows: a new folder's name, and Manage folders. */
  foldersMenu: React.ReactNode
  /**
   * The blocks to leave off the page right now: with "Hide empty blocks" on,
   * the trade blocks with nothing to show (Tyler, 8 Nov 2026: "why is the
   * block with no trades on it not hiding?"). A hidden block stays mounted, so
   * its panel can say when it has something again.
   */
  hidden: ReadonlySet<string>
}

const TradeBlocksContext = React.createContext<TradeBlocks | null>(null)

export function TradeBlocksProvider({
  value,
  children,
}: {
  value: TradeBlocks
  children: React.ReactNode
}) {
  return (
    <TradeBlocksContext.Provider value={value}>
      {children}
    </TradeBlocksContext.Provider>
  )
}

function useTradeBlocks() {
  return React.useContext(TradeBlocksContext)
}

/**
 * What a panel inside a block can reach of the block's heading row: a spot
 * for its own buttons (the scanner's cog, the folder plus), the count beside
 * the title, and whether the block is open.
 */
export type BlockHeading = {
  actions: HTMLElement | null
  setCount: (count: number | undefined) => void
  open: boolean
  /** The block stretches to the panel's bottom, so a list should fill it. */
  fills?: boolean
}

/** Exported so a panel's tests can stand in for the block around it. */
export const BlockHeadingContext = React.createContext<BlockHeading | null>(null)

/** Puts its children in the block's heading row, before the bin. Outside a block it draws them where it is. */
export function BlockHeadingActions({
  children,
}: {
  children: React.ReactNode
}) {
  const heading = React.useContext(BlockHeadingContext)
  if (!heading) return <>{children}</>
  if (!heading.actions) return null
  return createPortal(children, heading.actions)
}

/**
 * The count beside the block's title, such as the scanner's matches since the
 * block was last open. `undefined` shows none.
 */
export function useBlockCount(count: number | undefined) {
  const heading = React.useContext(BlockHeadingContext)
  const setCount = heading?.setCount
  React.useEffect(() => {
    setCount?.(count)
  }, [count, setCount])
}

/**
 * Whether the block holding this panel stretches to the bottom of the panel,
 * so a list inside should take all of it and scroll there.
 */
export function useBlockFills() {
  return React.useContext(BlockHeadingContext)?.fills ?? false
}

/** Whether the block holding this panel is open, or true outside a block. */
export function useBlockOpen() {
  return React.useContext(BlockHeadingContext)?.open ?? true
}

/** The frame each block sits in, as every other "/" block's. */
function Frame({
  selected,
  name,
  hidden = false,
  children,
}: {
  selected: boolean
  name: string
  hidden?: boolean
  children: React.ReactNode
}) {
  return (
    <NodeViewWrapper
      hidden={hidden || undefined}
      data-selected={selected || undefined}
      data-trade-block={name}
      data-note-block=""
      // Edge to edge, from Settings → Styling → Blocks, as the shell's
      // BlockCard: the block reaches past the panel's side space to its edges.
      // Image, video and link blocks keep the space, as they do in the shell.
      className="group/block relative mx-[calc(var(--panel-gutter,0px)*var(--shell-block-bleed,0)*-1)] [&_a]:text-inherit! [&_a:hover]:text-foreground!"
    >
      {children}
    </NodeViewWrapper>
  )
}

/** Less room than this left under the last block, and it keeps its own height. */
const MIN_FILL_PX = 240

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

/**
 * The height that takes the last block on the page down to the panel's
 * bottom, the panel's gutter under it (Tyler, 8 Nov 2026: "always make it
 * fill all available space"), or null to keep its own. The tile grows or
 * shrinks by however much the page falls short of, or runs past, the
 * panel's height, so the page fits the panel exactly and only the block's
 * own list scrolls ("theres 2 areascroll here"). What sits under the block
 * takes no room meanwhile (`saving-document.tsx`). With less than
 * `MIN_FILL_PX` left, the block keeps its own height and the page scrolls as
 * before.
 */
function useFillHeight(tile: HTMLElement | null, open: boolean): number | null {
  const [height, setHeight] = React.useState<number | null>(null)
  React.useEffect(() => {
    if (!tile || !open) return
    const page = tile.closest(".tiptap")
    const frame = tile.closest("[data-note-block]")
    const viewport = tile.closest<HTMLElement>('[data-slot="scroll-area-viewport"]')
    const content = viewport?.firstElementChild
    if (!page || !frame || !viewport || !content) return
    let frameId = 0
    const measure = () => {
      cancelAnimationFrame(frameId)
      frameId = requestAnimationFrame(() => {
        if (!lastOnPage(frame, page)) {
          setHeight(null)
          return
        }
        const shortfall = viewport.clientHeight - content.getBoundingClientRect().height
        const next = Math.floor(tile.getBoundingClientRect().height + shortfall)
        setHeight(next >= MIN_FILL_PX ? next : null)
      })
    }
    const sizes = new ResizeObserver(measure)
    sizes.observe(viewport)
    sizes.observe(content)
    // A block added, moved, hidden or written after this one.
    const changes = new MutationObserver(measure)
    changes.observe(page, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden"] })
    measure()
    return () => {
      cancelAnimationFrame(frameId)
      sizes.disconnect()
      changes.disconnect()
    }
  }, [open, tile])
  return open ? height : null
}

/**
 * Every Trade block is one card, as Project's team blocks are: a solid light
 * grey box whose heading row holds the title, the panel's own buttons and
 * the bin, with no fold arrow. Pressing the title folds it, and the fold is
 * remembered in this browser per block. The panel sits in one white tile.
 */
function BlockCard({
  editable,
  onRemove,
  moves,
  menu,
  kind,
  title,
  icon,
  children,
}: {
  editable: boolean
  /** Left out for a fixed block, which cannot be deleted. */
  onRemove?: () => void
  /**
   * A fixed block's Move up and Move down, in a ⋮ where the bin would be,
   * worked out as the ⋮ opens so only a move that can happen is offered.
   */
  moves?: () => BlockMove[]
  /** Rows of the block's own in its ⋮, above the moves; shown locked or not. */
  menu?: React.ReactNode
  kind: string
  title: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  const [open, setOpen, noFlashKey] = useRememberedCollapse(
    collapseStorageKey.settingsCard(`trade-block-${kind}`)
  )
  const [actions, setActions] = React.useState<HTMLSpanElement | null>(null)
  const [count, setCount] = React.useState<number | undefined>(undefined)
  const [tile, setTile] = React.useState<HTMLDivElement | null>(null)
  const fillHeight = useFillHeight(tile, open)
  const fills = fillHeight !== null
  const heading = React.useMemo(
    () => ({ actions, setCount, open, fills }),
    [actions, open, fills]
  )
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      // The shell's block look, from Settings → Styling → Blocks: its corners,
      // its grey (the Shade) and the white tile's inset, a little see-through
      // and frosted over a cover, as the shell's own blocks are
      // (`shared/notes/block-card.tsx`; Tyler, 8 Nov 2026: "This should follow
      // settings shade"). The tile is the card colour, so it stays right in
      // the dark theme too.
      className="grid grid-cols-[minmax(0,1fr)] overflow-hidden rounded-[var(--shell-block-radius,1rem)] backdrop-blur-md [background:color-mix(in_oklab,color-mix(in_oklab,var(--muted)_var(--shell-block-shade,50%),var(--card))_60%,transparent)]"
    >
      <BlockHeadingContext.Provider value={heading}>
        <FoldHeading
          band
          icon={icon}
          title={title}
          count={count || undefined}
          open={open}
          // One line for the title, never broken mid-word ("Protocol / s" at the
          // left panel's narrowest); it shortens with "…" only when there is
          // no room at all.
          className="min-h-[var(--dashboard-card-header-height,57px)] [&>button[aria-hidden]]:hidden [&>h2]:!m-0 [&>h2]:!min-w-0 [&>h2]:!truncate [&>h2]:!p-0 [&>h2]:!text-base [&>h2]:!leading-tight [&>h2]:!font-semibold [&>h2]:!text-foreground/75"
        >
          {/* The panel's own buttons, shown while the block is open. */}
          <span
            ref={setActions}
            className={cn("flex shrink-0 items-center gap-1", !open && "hidden")}
          />
          {/* Every block's ⋮, in place of the bin it had, as the shell's
              blocks have (Tyler, 8 Nov 2026: "this is suppoosed to be a 3 dot
              dropdown with delete in the bottom"): the block's own rows, a
              fixed block's moves, then Delete block. */}
          {menu || (editable && (moves || onRemove)) ? (
            <BlockMenu
              title={title}
              moves={editable ? moves : undefined}
              onRemove={editable ? onRemove : undefined}
            >
              {menu}
            </BlockMenu>
          ) : null}
        </FoldHeading>
        {/* Kept mounted while folded, so a panel inside keeps its count and its
            live reads, and the Rules box keeps the chart's figures. */}
        <CollapsibleContent
          forceMount
          data-collapse-key={noFlashKey}
          // 3px of the grey block round its white tile, 70% less than the 10px
          // it was (Tyler, 7 Nov 2026: "reduce the padding ehre by 50%", "try
          // 100%", "try 90%", then "Make padding 70% instead").
          className="min-w-0 px-[var(--shell-block-inset,3px)] pb-[var(--shell-block-inset,3px)] data-[state=closed]:hidden"
        >
          {/* One white tile with rounded corners (Tyler, 7 Nov 2026: "THis should
              be rounded corner"). A table's grey heading and totals rows turn
              white inside it, or they melt into the grey block around the tile
              and its corners read as square. Their line is then the Divider
              lines colour alone: the table line's grey band, there to match a
              grey heading row, goes clear, or it drew a grey line Settings
              could not change (Tyler, 8 Nov 2026: "this border here is not
              wired to the styling setting"). */}
          <div
            ref={setTile}
            data-block-tile=""
            // The last block on the page reaches the panel's bottom.
            style={fills ? { height: fillHeight, maxHeight: "none" } : undefined}
            className={cn(
              "flex max-h-[28rem] min-h-0 flex-col overflow-hidden rounded-[calc(var(--shell-block-radius,1rem)-var(--shell-block-inset,3px))] bg-card text-sm [&_tfoot_td]:!bg-card [&_tfoot_tr]:!bg-card [&_thead_th]:!bg-card [&_thead_th]:![--shell-table-band:transparent] [&_[data-slot=table-footer]]:![--shell-table-band:transparent]",
              // While this block fills, the page's writing area takes away
              // what sits under it (`saving-document.tsx`).
              fills && "trade-block-fills"
            )}
          >
            {children}
          </div>
        </CollapsibleContent>
      </BlockHeadingContext.Provider>
    </Collapsible>
  )
}

/** What a block shows on a page that has no dashboard behind it, such as a preview. */
function NotHere() {
  return (
    <p className="p-3 text-xs text-muted-foreground">
      This block shows on the trading dashboard.
    </p>
  )
}

/** One move a fixed block's ⋮ offers. */
type BlockMove = { label: string; icon: React.ReactNode; onSelect: () => void }

/**
 * A block's ⋮, as the shell's blocks have: the block's own rows, then, on a
 * fixed block, Move up and Move down, then Delete block on any other.
 */
function BlockMenu({
  title,
  moves,
  onRemove,
  children,
}: {
  title: string
  moves?: () => BlockMove[]
  /** Delete block, last, under a line; left out for a fixed block. */
  onRemove?: () => void
  children?: React.ReactNode
}) {
  const [rows, setRows] = React.useState<BlockMove[]>([])
  return (
    <DropdownMenu modal={false} onOpenChange={(open) => open && setRows(moves?.() ?? [])}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`More for ${title}`}
          className="text-muted-foreground opacity-0 group-hover/block:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100"
        >
          <EllipsisVerticalIcon className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[min(70vh,32rem)] w-56">
        {children}
        {children && rows.length ? <DropdownMenuSeparator /> : null}
        {rows.map((row) => (
          <DropdownMenuItem key={row.label} onSelect={row.onSelect}>
            {row.icon}
            {row.label}
          </DropdownMenuItem>
        ))}
        {onRemove ? (
          <>
            {children || rows.length ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem variant="destructive" onSelect={onRemove}>
              <Trash2Icon className="size-4" />
              Delete block
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * Move up or Move down for the top-level block at `pos`: it swaps places
 * with the line or block beside it, in one step so the page is never without
 * the block. Null when there is nothing on that side. Copied from the shell's
 * `block-card.tsx`.
 */
function moveBlock(editor: NodeViewProps["editor"], pos: number, direction: -1 | 1) {
  const { doc } = editor.state
  const $pos = doc.resolve(pos)
  if ($pos.depth !== 0) return null
  const index = $pos.index(0)
  const node = doc.child(index)
  const neighbourIndex = index + direction
  if (neighbourIndex < 0 || neighbourIndex >= doc.childCount) return null
  const neighbour = doc.child(neighbourIndex)
  return () => {
    const tr = editor.state.tr.delete(pos, pos + node.nodeSize)
    const at = direction === -1 ? pos - neighbour.nodeSize : pos + neighbour.nodeSize
    editor.view.dispatch(tr.insert(at, node).scrollIntoView())
  }
}

type BlockSpec = {
  kind: string
  title: string
  icon: React.ReactNode
  draw: (blocks: TradeBlocks) => React.ReactNode
  /** Rows of the block's own for its ⋮, from the dashboard. */
  menu?: (blocks: TradeBlocks) => React.ReactNode
  /**
   * A block the page always keeps, as Admin's Dashboards block (Tyler, 8 Nov
   * 2026: "It can be a fixed block but I'd need to be able to move it too"):
   * its ⋮ has Move up and Move down, and it has no bin. The node itself
   * refuses to be taken off (`keepOnPage`).
   */
  fixed?: boolean
}

function blockView({ kind, title, icon, draw, menu, fixed = false }: BlockSpec) {
  return function TradeBlockView({ editor, selected, deleteNode, getPos }: NodeViewProps) {
    const blocks = useTradeBlocks()
    const moves = () => {
      const pos = getPos()
      if (typeof pos !== "number") return []
      const up = moveBlock(editor, pos, -1)
      const down = moveBlock(editor, pos, 1)
      return [
        ...(up ? [{ label: "Move up", icon: <ArrowUpIcon className="size-4" />, onSelect: up }] : []),
        ...(down ? [{ label: "Move down", icon: <ArrowDownIcon className="size-4" />, onSelect: down }] : []),
      ]
    }
    return (
      <Frame selected={selected} name={kind} hidden={blocks?.hidden.has(kind)}>
        <BlockCard
          editable={editor.isEditable}
          onRemove={fixed ? undefined : deleteNode}
          moves={fixed ? moves : undefined}
          menu={
            blocks && menu
              ? menu(blocks)
              : blocks && isTradeTableBlock(kind)
                ? <BlockColumnsMenuRows block={kind} />
                : undefined
          }
          kind={kind}
          title={title}
          icon={icon}
        >
          {!blocks ? (
            <NotHere />
          ) : isTradeTableBlock(kind) ? (
            // Manual, Grid and DCA trades hide the columns picked in their ⋮.
            <BlockHiddenColumns block={kind}>{draw(blocks)}</BlockHiddenColumns>
          ) : (
            draw(blocks)
          )}
        </BlockCard>
      </Frame>
    )
  }
}

/** The Rules box, drawn into by the chart. */
function RulesSlot({ addSlot }: { addSlot: TradeBlocks["addRulesSlot"] }) {
  const [element, setElement] = React.useState<HTMLDivElement | null>(null)
  React.useEffect(() => (element ? addSlot(element) : undefined), [addSlot, element])
  return <div ref={setElement} className="flex min-h-24 min-w-0 flex-1 flex-col" />
}

export const RulesBlockView = blockView({
  kind: "rules",
  title: "Rules",
  icon: <ShieldCheckIcon />,
  draw: (blocks) => <RulesSlot addSlot={blocks.addRulesSlot} />,
})

export const ManualTradesBlockView = blockView({
  kind: "manual-trades",
  title: "Manual trades",
  icon: <ListOrderedIcon />,
  draw: (blocks) => blocks.manual,
})

export const GridTradesBlockView = blockView({
  kind: "grid-trades",
  title: "Grid trades",
  icon: <Grid2x2Icon />,
  draw: (blocks) => blocks.grid,
})

export const DcaTradesBlockView = blockView({
  kind: "dca-trades",
  title: "DCA trades",
  icon: <LayersIcon />,
  draw: (blocks) => blocks.dca,
})

export const ScannerBlockView = blockView({
  kind: "scanner",
  title: "Scanner",
  icon: <RadarIcon />,
  draw: (blocks) => blocks.scanner,
})

export const FoldersBlockView = blockView({
  kind: "folders",
  title: "Folders",
  icon: <FolderIcon />,
  draw: (blocks) => blocks.folders,
  menu: (blocks) => blocks.foldersMenu,
})

export const ProtocolsBlockView = blockView({
  kind: "protocols",
  title: "Protocols",
  icon: <LayoutDashboardIcon />,
  draw: (blocks) => blocks.protocols,
  menu: (blocks) => blocks.protocolsMenu,
  fixed: true,
})
