import * as React from "react"

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import {
  panelLayoutKey,
  useRememberedPanelLayout,
} from "@/lib/layout/panel-layout"
import { pageGutter } from "@/lib/layout/shell-gutter"
import { useWideScreen } from "@/lib/layout/wide-screen"

/**
 * The two-column body of an admin dashboard, with every divider draggable.
 *
 * On a wide screen the columns and the cards down each column are panels: drag
 * the gap between any two and one grows as the other shrinks. Where the
 * dividers are left is remembered in this browser and nowhere else, so a
 * different computer opens on the proportions written here.
 *
 * Below 1280px there is nothing to divide — the columns stack into one and the
 * page scrolls, which is the right answer on a narrow screen — so the panels
 * are dropped entirely and each block falls back to its stacked classes.
 *
 * Whatever sits above this, the stat strip on both pages, is outside it and
 * never moves.
 */

export type DashboardBlock = {
  /** Kept out of the saved layout's way: changing it forgets that column. */
  id: string
  /**
   * This block's share of its column — the same weights the fixed layout used,
   * so 4 against 3 against 3 is the old 40 / 30 / 30. They are turned into
   * percentages here rather than restated as them.
   */
  size: number
  /** How far it can be squeezed before the divider stops, as a percentage. */
  minSize?: string
  /** What the block gets on a narrow screen, where it is a plain flex child. */
  stackedClassName?: string
  render: (className: string) => React.ReactNode
}

/** A panel owns its height, so the card inside simply fills it. */
const FILL = "h-full min-h-0"

const DEFAULT_MIN_SIZE = "12%"

/**
 * The columns take the height the page has left, down to a floor. Whatever sits
 * above them is normally one short strip, but the Overview lets an admin put a
 * card up there — and without the floor a tall one squeezes the columns to a
 * couple of unreadable rows. Past the floor the page scrolls instead.
 */
const COLUMNS_CLASS = "flex min-h-96 flex-1"

/** The proportions both admin dashboards open on: roughly 55 / 45. */
const LEFT_WIDTH = "55%"
const RIGHT_WIDTH = "45%"
const MIN_COLUMN_WIDTH = "28%"

export function DashboardPanels({
  page,
  left,
  right,
}: {
  /** Names this page in the remembered-layout keys. */
  page: string
  left: DashboardBlock[]
  right: DashboardBlock[]
}) {
  // Known before the first render on the server as well, so the page opens in
  // the layout it is going to keep instead of painting one and rebuilding.
  const wide = useWideScreen()
  const columns = useRememberedPanelLayout(panelLayoutKey.dashboardColumns(page))

  if (!wide) {
    return (
      <div className="grid shrink-0 items-start" style={{ gap: pageGutter }}>
        {left.length ? <StackedColumn blocks={left} /> : null}
        {right.length ? <StackedColumn blocks={right} /> : null}
      </div>
    )
  }

  // One column with nothing in it is not a column: on the Overview an admin can
  // put every widget down one side, and a panel group with an empty half would
  // leave a draggable divider against a blank space.
  if (!left.length || !right.length) {
    const blocks = left.length ? left : right
    if (!blocks.length) return null

    return (
      <div className={COLUMNS_CLASS}>
        <PanelColumn
          page={page}
          side={left.length ? "left" : "right"}
          blocks={blocks}
        />
      </div>
    )
  }

  return (
    <div className={COLUMNS_CLASS}>
      <ResizablePanelGroup
        key={columns.layoutKey}
        orientation="horizontal"
        className="min-h-0 flex-1"
        defaultLayout={columns.defaultLayout}
        onLayoutChanged={columns.onLayoutChanged}
      >
        <ResizablePanel
          id="left"
          defaultSize={LEFT_WIDTH}
          minSize={MIN_COLUMN_WIDTH}
        >
          <PanelColumn page={page} side="left" blocks={left} />
        </ResizablePanel>
        <ResizableHandle gap />
        <ResizablePanel
          id="right"
          defaultSize={RIGHT_WIDTH}
          minSize={MIN_COLUMN_WIDTH}
        >
          <PanelColumn page={page} side="right" blocks={right} />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}

function StackedColumn({ blocks }: { blocks: DashboardBlock[] }) {
  return (
    <div className="flex min-w-0 flex-col" style={{ gap: pageGutter }}>
      {blocks.map((block) => (
        <React.Fragment key={block.id}>
          {block.render(block.stackedClassName ?? "")}
        </React.Fragment>
      ))}
    </div>
  )
}

function PanelColumn({
  page,
  side,
  blocks,
}: {
  page: string
  side: "left" | "right"
  blocks: DashboardBlock[]
}) {
  // Which cards are in the column is part of the key: a layout saved for three
  // cards cannot be applied to two, and on a page whose cards an admin arranges
  // it must not be applied to three different ones either.
  const layout = useRememberedPanelLayout(
    panelLayoutKey.dashboardColumn(
      page,
      side,
      blocks.map((block) => block.id).join("-")
    )
  )
  const total = blocks.reduce((sum, block) => sum + block.size, 0) || 1

  return (
    <ResizablePanelGroup
      key={layout.layoutKey}
      orientation="vertical"
      className="min-h-0 flex-1"
      defaultLayout={layout.defaultLayout}
      onLayoutChanged={layout.onLayoutChanged}
    >
      {blocks.map((block, index) => (
        <React.Fragment key={block.id}>
          {index > 0 ? <ResizableHandle gap /> : null}
          <ResizablePanel
            id={block.id}
            defaultSize={`${(block.size / total) * 100}%`}
            minSize={block.minSize ?? DEFAULT_MIN_SIZE}
          >
            {/* A panel clips anything drawn outside its box, and a card's
                border is drawn outside it — so inside this marker the border
                becomes a real one instead. The rule is in `theme.css`, which
                is where the card border's width and colour are set from the
                Styling settings and would otherwise win anyway. */}
            <div data-dashboard-panel="" className="h-full min-h-0">
              {block.render(FILL)}
            </div>
          </ResizablePanel>
        </React.Fragment>
      ))}
    </ResizablePanelGroup>
  )
}
