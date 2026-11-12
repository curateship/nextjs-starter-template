import * as React from "react"

import { AdditionBoundary } from "@/components/shared/widgets/addition-boundary"
import { WidgetCard } from "@/components/shared/widgets/widget-card"
import { EmptySpot, WidgetMenu, type Spot } from "@/components/shared/widgets/widget-menus"
import { ScrollArea } from "@/components/ui/scroll-area"
import { pageGutter } from "@/lib/layout/shell-gutter"
import type { AdminAddition, AdminAdditionProps } from "@/lib/admin-dashboard/admin-additions"
import {
  appWidgetId,
  SHELL_WIDGET_IDS,
  type WidgetBoard,
  type WidgetLayout,
  type WidgetRowName,
  type WidgetSource,
} from "@/lib/admin-dashboard/overview-widgets"
import type { AnalyticsRange } from "@/lib/analytics/range"
import { appAdminWidgets, appCrmWidgets } from "@/lib/app-options"
import { cn } from "@/lib/utils"

/**
 * An Overview of widgets in up to two rows (Tyler, 8 Nov 2026: "I want top
 * row to have 2 col and bottom row to have 3 col (2 row max)"), straight on
 * the dashboard beside the left panel, with no panel or header of its own.
 * The Admin dashboard's Overview and the CRM's both draw this; each says
 * which it is (`board`), for its own layout and its own widgets. An app's own
 * dashboard passes `offer` instead, its own list of widgets, and draws every
 * one of them with `drawWidget`: it has no app widgets loaded by key.
 *
 * - **Wide:** the rows share the height, so the whole of Overview fits with
 *   no page scroll, and a long list scrolls inside its own card ("Fill the
 *   panel").
 * - **Narrow, or a phone:** one widget under another at its own height, and
 *   Overview scrolls.
 *
 * A spot holding a widget draws `drawWidget`'s card, or the app's widget of
 * that id; an empty one is pressed to add a widget there.
 */
export function WidgetGrid({
  layout,
  days,
  onChange,
  drawWidget,
  ...source
}: WidgetSource & {
  layout: WidgetLayout
  /** The range handed to the app's widgets; not used with `offer`. */
  days?: AnalyticsRange
  onChange: (layout: WidgetLayout) => void
  /** The dashboard's own widgets; null for an id that is not one, which is then the app's. */
  drawWidget?: (id: string, menu: WidgetMenuProps) => React.ReactNode | null
}) {
  const names: WidgetRowName[] = layout.bottom.columns > 0 ? ["top", "bottom"] : ["top"]
  const rows = names.map((name) => ({ name, ...layout[name] }))
  return (
    <div className="@container min-h-0 flex-1 overflow-y-auto @3xl:overflow-hidden">
      <div
        style={{ gap: pageGutter }}
        className={cn(
          // The site's gutter between the cards, from Settings → Styling, the
          // same gap the panels keep between themselves (Tyler, 8 Nov 2026:
          // "the widgets doesnt follow the gutter settings"), and none round
          // them: the cards' own edges line up with the left panel's.
          "grid grid-cols-[minmax(0,1fr)] @3xl:h-full",
          rows.length === 2 ? "@3xl:grid-rows-2" : "@3xl:grid-rows-1"
        )}
      >
        {rows.map((row) => (
          <div
            key={row.name}
            className="grid grid-cols-[minmax(0,1fr)] @3xl:min-h-0 @3xl:[grid-template-columns:repeat(var(--widget-columns),minmax(0,1fr))]"
            style={{ "--widget-columns": row.columns, gap: pageGutter } as React.CSSProperties}
          >
            {row.spots.map((id, index) => {
              const menu: WidgetMenuProps = { ...source, layout, spot: { row: row.name, index }, onChange }
              if (!id) return <EmptySpot key={`empty-${index}`} {...menu} />
              const drawn = drawWidget?.(id, menu)
              return (
                <React.Fragment key={id}>
                  {drawn ??
                    (source.board && days ? (
                      <AppWidget id={id} board={source.board} days={days} menu={menu} />
                    ) : (
                      <EmptySpot {...menu} />
                    ))}
                </React.Fragment>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

/** What a widget's ⋮ needs: where its widgets come from, the layout, its spot, and the change. */
export type WidgetMenuProps = WidgetSource & {
  layout: WidgetLayout
  spot: Spot
  onChange: (layout: WidgetLayout) => void
}

type MadeWidget = {
  label: string
  icon: React.ReactNode
  Lazy: React.LazyExoticComponent<React.ComponentType<AdminAdditionProps>>
}

const appWidgetsMade: Partial<Record<WidgetBoard, Map<string, MadeWidget>>> = {}

function appAdditions(board: WidgetBoard): readonly AdminAddition[] {
  return board === "admin" ? appAdminWidgets(SHELL_WIDGET_IDS) : appCrmWidgets()
}

/**
 * The app's widgets on a dashboard (`admin.widgets` or `crm.widgets` in its
 * `src/app/options.ts`), each loaded the first time it shows. A widget the
 * app took away is never in a layout: `cleanWidgetLayout` empties its spot.
 */
function appWidget(board: WidgetBoard, id: string) {
  let made = appWidgetsMade[board]
  if (!made) {
    made = new Map()
    for (const widget of appAdditions(board)) {
      const Icon = widget.icon
      made.set(appWidgetId(widget.key), { label: widget.label, icon: <Icon />, Lazy: React.lazy(widget.load) })
    }
    appWidgetsMade[board] = made
  }
  return made.get(id)
}

function AppWidget({
  id,
  board,
  days,
  menu,
}: {
  id: string
  board: WidgetBoard
  days: AnalyticsRange
  menu: WidgetMenuProps
}) {
  const made = appWidget(board, id)
  if (!made) return <EmptySpot {...menu} />
  const { Lazy } = made
  return (
    <WidgetCard title={made.label} icon={made.icon} menu={<WidgetMenu title={made.label} />}>
      <AdditionBoundary kind="widget">
        <React.Suspense fallback={<p className="p-3 text-sm text-muted-foreground">Reading…</p>}>
          <ScrollArea className="min-h-0 flex-1">
            <Lazy days={days} />
          </ScrollArea>
        </React.Suspense>
      </AdditionBoundary>
    </WidgetCard>
  )
}
