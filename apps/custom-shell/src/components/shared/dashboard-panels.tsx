import * as React from "react"

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import {
  panelLayoutKey,
  useRememberedPanelLayout,
} from "@/lib/panel-layout"
import { pageGutter } from "@/lib/shell-gutter"
import { useWideScreen } from "@/lib/wide-screen"

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
        <StackedColumn blocks={left} />
        <StackedColumn blocks={right} />
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1">
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
  // The number of blocks is part of the key: a card that only appears once
  // there is something to show would otherwise come back to a layout saved for
  // a column that had one more divider in it than this one has.
  const layout = useRememberedPanelLayout(
    panelLayoutKey.dashboardColumn(page, side, blocks.length)
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
