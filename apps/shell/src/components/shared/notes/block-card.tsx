import * as React from "react"
import { createPortal } from "react-dom"
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react"
import { Trash2Icon } from "lucide-react"

import { FoldHeading } from "@/components/shared/notes/fold-heading"
import { Button } from "@/components/ui/button"
import {
  Collapsible,
  CollapsibleContent,
} from "@/components/ui/collapsible"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
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
  open: boolean
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
 * the bin, with no fold arrow. Pressing the title folds it, and the fold is
 * remembered in this browser per block. The panel sits in one white tile.
 */
export function BlockCard({
  editable,
  onRemove,
  kind,
  title,
  icon,
  removeLabel,
  children,
}: {
  editable: boolean
  onRemove: () => void
  kind: string
  title: string
  icon: React.ReactNode
  removeLabel: string
  children: React.ReactNode
}) {
  const [open, setOpen, noFlashKey] = useRememberedCollapse(
    collapseStorageKey.settingsCard(`page-block-${kind}`)
  )
  const [actions, setActions] = React.useState<HTMLSpanElement | null>(null)
  const [count, setCount] = React.useState<number | undefined>(undefined)
  const heading = React.useMemo(
    () => ({ actions, setCount, open }),
    [actions, open]
  )
  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="grid grid-cols-[minmax(0,1fr)] overflow-hidden rounded-2xl bg-[color-mix(in_oklab,var(--muted)_50%,var(--background))]"
    >
      <BlockHeadingContext.Provider value={heading}>
        <FoldHeading
          band
          icon={icon}
          title={title}
          count={count || undefined}
          open={open}
          className="[&>button[aria-hidden]]:hidden [&>h2]:!m-0 [&>h2]:!p-0 [&>h2]:!text-base [&>h2]:!leading-tight [&>h2]:!font-semibold"
        >
          {/* The panel's own buttons, shown while the block is open. */}
          <span
            ref={setActions}
            className={cn("flex shrink-0 items-center gap-1", !open && "hidden")}
          />
          {editable ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={removeLabel}
                  className="text-muted-foreground opacity-0 group-hover/block:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
                  onClick={onRemove}
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{removeLabel}</TooltipContent>
            </Tooltip>
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
          className="min-w-0 px-[3px] pb-[3px] data-[state=closed]:hidden"
        >
          {/* One white tile with rounded corners (Tyler, 7 Nov 2026: "THis should
              be rounded corner"). A table's grey heading and totals rows turn
              white inside it, or they melt into the grey block around the tile
              and its corners read as square. */}
          <div data-block-tile="" className="flex max-h-[28rem] min-h-0 flex-col overflow-hidden rounded-[calc(1rem-3px)] bg-background text-sm [&_tfoot_td]:!bg-background [&_tfoot_tr]:!bg-background [&_thead_th]:!bg-background">
            {children}
          </div>
        </CollapsibleContent>
      </BlockHeadingContext.Provider>
    </Collapsible>
  )
}

type BlockSpec = {
  /** The block's own name, which its fold is remembered under. */
  kind: string
  title: string
  icon: React.ReactNode
  /** What the tile holds, drawn by the app from its own context. */
  Draw: React.ComponentType
}

/**
 * The editor view for one app block: the frame, the card, and the app's
 * `Draw` on the tile. Pass the result to `blockNode`.
 */
export function blockView({ kind, title, icon, Draw }: BlockSpec) {
  return function PageBlockView({ editor, selected, deleteNode }: NodeViewProps) {
    return (
      <BlockFrame selected={selected} name={kind}>
        <BlockCard
          editable={editor.isEditable}
          onRemove={deleteNode}
          kind={kind}
          title={title}
          icon={icon}
          removeLabel={`Remove ${title.toLowerCase()}`}
        >
          <Draw />
        </BlockCard>
      </BlockFrame>
    )
  }
}
