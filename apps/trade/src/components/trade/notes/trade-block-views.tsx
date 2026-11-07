import * as React from "react"
import { createPortal } from "react-dom"
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react"
import {
  FolderIcon,
  Grid2x2Icon,
  InfoIcon,
  LayersIcon,
  ListOrderedIcon,
  RadarIcon,
  ShieldCheckIcon,
  SirenIcon,
  Trash2Icon,
} from "lucide-react"

import { FoldHeading } from "@/components/trade/notes/fold-heading"
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
   * The Rules block is a box the chart draws into, as the left panel was
   * before: the chart works out the rules' figures, so it keeps drawing them.
   */
  setRulesSlot: (element: HTMLElement | null) => void
  grid: React.ReactNode
  dca: React.ReactNode
  manual: React.ReactNode
  alerts: React.ReactNode
  scanner: React.ReactNode
  folders: React.ReactNode
  /** The facts about the market on the chart, or null with no market picked. */
  marketInfo: React.ReactNode | null
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
function Frame({
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
      data-trade-block={name}
      data-note-block=""
      className="group/block relative [&_a]:text-inherit! [&_a:hover]:text-foreground!"
    >
      {children}
    </NodeViewWrapper>
  )
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
    collapseStorageKey.settingsCard(`trade-block-${kind}`)
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
            live reads, and the Rules box keeps the chart's figures. */}
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

/** What a block shows on a page that has no dashboard behind it, such as a preview. */
function NotHere() {
  return (
    <p className="p-3 text-xs text-muted-foreground">
      This block shows on the trading dashboard.
    </p>
  )
}

type BlockSpec = {
  kind: string
  title: string
  icon: React.ReactNode
  draw: (blocks: TradeBlocks) => React.ReactNode
}

function blockView({ kind, title, icon, draw }: BlockSpec) {
  return function TradeBlockView({ editor, selected, deleteNode }: NodeViewProps) {
    const blocks = useTradeBlocks()
    return (
      <Frame selected={selected} name={kind}>
        <BlockCard
          editable={editor.isEditable}
          onRemove={deleteNode}
          kind={kind}
          title={title}
          icon={icon}
          removeLabel={`Remove ${title.toLowerCase()}`}
        >
          {blocks ? draw(blocks) : <NotHere />}
        </BlockCard>
      </Frame>
    )
  }
}

/** The Rules box, drawn into by the chart. */
function RulesSlot({ setSlot }: { setSlot: TradeBlocks["setRulesSlot"] }) {
  const ref = React.useCallback(
    (element: HTMLDivElement | null) => setSlot(element),
    [setSlot]
  )
  return <div ref={ref} className="flex min-h-24 min-w-0 flex-1 flex-col" />
}

export const RulesBlockView = blockView({
  kind: "rules",
  title: "Rules",
  icon: <ShieldCheckIcon />,
  draw: (blocks) => <RulesSlot setSlot={blocks.setRulesSlot} />,
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

export const AlertsBlockView = blockView({
  kind: "alerts",
  title: "Alerts",
  icon: <SirenIcon />,
  draw: (blocks) => blocks.alerts,
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
})

export const MarketInfoBlockView = blockView({
  kind: "market-info",
  title: "Market info",
  icon: <InfoIcon />,
  draw: (blocks) =>
    blocks.marketInfo ?? (
      <p className="p-3 text-xs text-muted-foreground">
        Pick a market to see its facts.
      </p>
    ),
})
