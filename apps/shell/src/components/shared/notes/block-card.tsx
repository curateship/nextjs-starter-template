import * as React from "react"
import { createPortal } from "react-dom"
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react"
import { ArrowDownIcon, ArrowUpIcon, EllipsisVerticalIcon, Trash2Icon } from "lucide-react"

import { FoldHeading } from "@/components/shared/notes/fold-heading"
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
import { cn } from "@/lib/utils"

/**
 * The card every app's "/" block draws in, copied from Trade's
 * `trade-block-views.tsx` (Tyler, 7 Nov 2026: "Add this card styling to the
 * skill", and for the CRM the same day: "we need to use trade's card design
 * though"). A solid light grey block, its title on a heading band, and what
 * it shows on one white tile 3px inside it. An app's block keeps no values:
 * it draws what the app's screen already knows, which the screen hands down
 * through a context of the app's own around the page.
 */

/**
 * What a panel inside a block can reach of the block's heading row: a spot
 * for its own buttons (the scanner's cog, the folder plus), the count beside
 * the title, and whether the block is open.
 */
export type BlockHeading = {
  actions: HTMLElement | null
  setCount: (count: number | undefined) => void
  setMenu: (items: BlockMenuItem[] | undefined) => void
  open: boolean
}

/** One row a panel adds to its block's ⋮, above Delete block. */
export type BlockMenuItem = {
  label: string
  icon?: React.ReactNode
  onSelect: () => void
}

/** Exported so a panel's tests can stand in for the block around it. */
export const BlockHeadingContext = React.createContext<BlockHeading | null>(null)

/** Puts its children in the block's heading row, before the ⋮. Outside a block it draws them where it is. */
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
 * The count beside the block's title, such as the alerts that fired since the
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
 * Rows for the block's ⋮, above Delete block (Tyler, 7 Nov 2026, on the CRM's
 * Segments block: "a vertical 3 dot to open a dropdown that show add a
 * segment and delete block"). The rows are read when the menu opens, so a
 * caller may hand a new array every render.
 */
export function useBlockMenu(items: BlockMenuItem[] | undefined) {
  const heading = React.useContext(BlockHeadingContext)
  const setMenu = heading?.setMenu
  const latest = React.useRef(items)
  React.useEffect(() => {
    latest.current = items
  })
  // Keyed on the labels, so a new array with the same rows changes nothing.
  const labels = JSON.stringify(items?.map((item) => item.label) ?? [])
  React.useEffect(() => {
    if (!setMenu) return
    // The effect above has already stored this render's rows.
    const rows = latest.current
    setMenu(
      rows?.length
        ? rows.map((item, index) => ({
            ...item,
            onSelect: () => latest.current?.[index]?.onSelect(),
          }))
        : undefined
    )
    return () => setMenu(undefined)
  }, [setMenu, labels])
}

/** Whether the block holding this panel is open, or true outside a block. */
export function useBlockOpen() {
  return React.useContext(BlockHeadingContext)?.open ?? true
}

/** The frame each block sits in, as every other "/" block's. */
export function BlockFrame({
  selected,
  name,
  children,
}: {
  selected: boolean
  name: string
  children: React.ReactNode
}) {
  return (
    <NodeViewWrapper
      data-selected={selected || undefined}
      data-page-block={name}
      data-note-block=""
      className="group/block relative [&_a]:text-inherit! [&_a:hover]:text-foreground!"
    >
      {children}
    </NodeViewWrapper>
  )
}

/**
 * Every block is one card, as Project's team blocks are: a solid light
 * grey box whose heading row holds the title, the panel's own buttons and
 * the ⋮, with no fold arrow. Pressing the title folds it, and the fold is
 * remembered in this browser per block. The panel sits in one white tile.
 */
export function BlockCard({
  editable,
  onRemove,
  moves,
  kind,
  title,
  icon,
  children,
}: {
  editable: boolean
  /** Left out for a fixed block, which has no Delete block. */
  onRemove?: () => void
  /**
   * A fixed block's Move up and Move down, worked out as its ⋮ opens, so
   * only a move that can happen is offered.
   */
  moves?: () => BlockMenuItem[]
  kind: string
  title: string
  icon: React.ReactNode
  children: React.ReactNode
}) {
  const [open, setOpen, noFlashKey] = useRememberedCollapse(
    collapseStorageKey.settingsCard(`page-block-${kind}`)
  )
  const [actions, setActions] = React.useState<HTMLSpanElement | null>(null)
  const [count, setCount] = React.useState<number | undefined>(undefined)
  const [menu, setMenu] = React.useState<BlockMenuItem[] | undefined>(undefined)
  const heading = React.useMemo(
    () => ({ actions, setCount, setMenu, open }),
    [actions, open]
  )
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      // Corners, grey and edge from Settings → Styling → Blocks; the
      // fallbacks are the look blocks had before the setting existed.
      className="grid grid-cols-[minmax(0,1fr)] overflow-hidden rounded-[var(--shell-block-radius,1rem)] [background:color-mix(in_oklab,var(--muted)_var(--shell-block-shade,50%),var(--card))]"
    >
      <BlockHeadingContext.Provider value={heading}>
        <FoldHeading
          band
          icon={icon}
          title={title}
          count={count || undefined}
          open={open}
          // As tall as the panel's own header, its title dark grey (Tyler,
          // 8 Nov 2026: "Make the block header the same height as the
          // panel's header", then "blocks header should be dark gray").
          className="min-h-[var(--dashboard-card-header-height,57px)] [&>button[aria-hidden]]:hidden [&>h2]:!m-0 [&>h2]:!p-0 [&>h2]:!text-base [&>h2]:!leading-tight [&>h2]:!font-semibold [&>h2]:!text-foreground/75"
        >
          {/* The panel's own buttons, shown while the block is open. */}
          <span
            ref={setActions}
            className={cn("flex shrink-0 items-center gap-1", !open && "hidden")}
          />
          {/* Every block's ⋮, in place of the bin it had (Tyler, 7 Nov 2026:
              "All blocks should be replaed with the 3 dot dropdown"): the
              block's own rows, then Delete block. Shown only while the
              heading is pointed at, never for a row inside the tile ("hover
              over the item should only show the item 3 dot, not the header
              too"). */}
          {menu?.length || (editable && (onRemove || moves)) ? (
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`More for ${title}`}
                  className="text-muted-foreground opacity-0 group-hover/fold:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100"
                >
                  <EllipsisVerticalIcon className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                {(menu ?? []).map((item) => (
                  <DropdownMenuItem key={item.label} onSelect={item.onSelect}>
                    {item.icon}
                    {item.label}
                  </DropdownMenuItem>
                ))}
                {editable && moves ? <MoveRows moves={moves} after={Boolean(menu?.length)} /> : null}
                {editable && onRemove ? (
                  <>
                    {menu?.length ? <DropdownMenuSeparator /> : null}
                    <DropdownMenuItem variant="destructive" onSelect={onRemove}>
                      <Trash2Icon className="size-4" />
                      Delete block
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </FoldHeading>
        {/* Kept mounted while folded, so a panel inside keeps its count and its
            live reads. */}
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
              and its corners read as square. */}
          <div data-block-tile="" className="flex max-h-[28rem] min-h-0 flex-col overflow-hidden rounded-[calc(var(--shell-block-radius,1rem)-var(--shell-block-inset,3px))] bg-card text-sm [&_tfoot_td]:!bg-card [&_tfoot_tr]:!bg-card [&_thead_th]:!bg-card">
            {children}
          </div>
        </CollapsibleContent>
      </BlockHeadingContext.Provider>
    </Collapsible>
  )
}

/** A fixed block's moves, under any rows of the block's own. */
function MoveRows({ moves, after }: { moves: () => BlockMenuItem[]; after: boolean }) {
  // Worked out once as the menu opens: the rows are drawn only while it is open.
  const [rows] = React.useState(moves)
  if (rows.length === 0) return null
  return (
    <>
      {after ? <DropdownMenuSeparator /> : null}
      {rows.map((item) => (
        <DropdownMenuItem key={item.label} onSelect={item.onSelect}>
          {item.icon}
          {item.label}
        </DropdownMenuItem>
      ))}
    </>
  )
}

type BlockSpec = {
  /** The block's own name, which its fold is remembered under. */
  kind: string
  title: string
  icon: React.ReactNode
  /** What the tile holds, drawn by the app from its own context. */
  Draw: React.ComponentType
  /**
   * A block the page always keeps, such as Admin's Dashboards (Tyler,
   * 8 Nov 2026: "It can be a fixed block but I'd need to be able to move it
   * too"). Its ⋮ has Move up and Move down in place of Delete block. The
   * node itself refuses to be taken off; see `keepOnPage`.
   */
  fixed?: boolean
}

/**
 * Move up or Move down for the top-level block at `pos`: it swaps places
 * with the line or block beside it. Null when there is nothing on that side.
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
    // One step, so the editor never sees the page without the block.
    const tr = editor.state.tr.delete(pos, pos + node.nodeSize)
    const at = direction === -1 ? pos - neighbour.nodeSize : pos + neighbour.nodeSize
    editor.view.dispatch(tr.insert(at, node).scrollIntoView())
  }
}

/**
 * The editor view for one app block: the frame, the card, and the app's
 * `Draw` on the tile. Pass the result to `blockNode`.
 */
export function blockView({ kind, title, icon, Draw, fixed = false }: BlockSpec) {
  return function PageBlockView({ editor, selected, deleteNode, getPos }: NodeViewProps) {
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
      <BlockFrame selected={selected} name={kind}>
        <BlockCard
          editable={editor.isEditable}
          onRemove={fixed ? undefined : deleteNode}
          moves={fixed ? moves : undefined}
          kind={kind}
          title={title}
          icon={icon}
        >
          <Draw />
        </BlockCard>
      </BlockFrame>
    )
  }
}
