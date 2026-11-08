import {
  CpuIcon,
  FileTextIcon,
  GaugeIcon,
  Globe2Icon,
  MonitorSmartphoneIcon,
  SparklesIcon,
  TrendingUpIcon,
  UsersIcon,
  WorkflowIcon,
  type LucideIcon,
} from "lucide-react"

import { appAdminWidgets } from "@/lib/app-options"

/**
 * Overview's widgets and where each sits (Tyler, 8 Nov 2026: "I want to make
 * it widget based ... I want ability to customize col. For example I want top
 * row to have 2 col and bottom row to have 3 col (2 row max)").
 *
 * - Two rows at most. The top row has 1 to 4 columns; the bottom row has
 *   none (one row) or 1 to 4.
 * - Each column is a spot holding one widget, or nothing (Empty). A widget
 *   shows once: placing it in a second spot takes it out of the first.
 * - The layout is the site's, one for every admin, saved in
 *   `admin_widget_layouts`.
 *
 * The shell's nine are below; an app adds its own through `admin.widgets` in
 * its `src/app/options.ts`, keyed `app:<key>` so they never meet the shell's.
 */

export const SHELL_WIDGETS = [
  { id: "views", label: "Views per day", icon: TrendingUpIcon },
  { id: "ai-spend", label: "Daily AI spend", icon: SparklesIcon },
  { id: "by-person", label: "By person", icon: UsersIcon },
  { id: "top-pages", label: "Top pages", icon: FileTextIcon },
  { id: "devices", label: "Devices", icon: MonitorSmartphoneIcon },
  { id: "referrers", label: "Top referrers", icon: Globe2Icon },
  { id: "ai-features", label: "By feature", icon: WorkflowIcon },
  { id: "ai-models", label: "By model", icon: CpuIcon },
  { id: "meters", label: "By meter", icon: GaugeIcon },
] as const satisfies readonly { id: string; label: string; icon: LucideIcon }[]

export type ShellWidgetId = (typeof SHELL_WIDGETS)[number]["id"]

export const SHELL_WIDGET_IDS: readonly string[] = SHELL_WIDGETS.map((widget) => widget.id)

/** An app's widget as the layout stores it. */
export function appWidgetId(key: string) {
  return `app:${key}`
}

/** One widget the Widgets tab offers: the shell's nine, then the app's. */
export type WidgetChoice = { id: string; label: string; icon: LucideIcon }

export function widgetChoices(): WidgetChoice[] {
  return [
    ...SHELL_WIDGETS,
    ...appAdminWidgets(SHELL_WIDGET_IDS).map((widget) => ({
      id: appWidgetId(widget.key),
      label: widget.label,
      icon: widget.icon,
    })),
  ]
}

export const TOP_ROW_COLUMNS = [1, 2, 3, 4] as const
/** 0 is None: one row only. */
export const BOTTOM_ROW_COLUMNS = [0, 1, 2, 3, 4] as const

export type WidgetRow = { columns: number; spots: (string | null)[] }
export type WidgetLayout = { top: WidgetRow; bottom: WidgetRow }
export type WidgetRowName = keyof WidgetLayout

/** What a site starts with: two charts on top, three lists under them. */
export const DEFAULT_WIDGET_LAYOUT: WidgetLayout = {
  top: { columns: 2, spots: ["views", "ai-spend"] },
  bottom: { columns: 3, spots: ["top-pages", "ai-features", "by-person"] },
}

function readColumns(value: unknown, allowed: readonly number[], fallback: number) {
  return typeof value === "number" && allowed.includes(value) ? value : fallback
}

/**
 * A stored or sent layout made safe: columns within their range, exactly one
 * spot per column, widgets nobody knows (an app's that was taken away)
 * emptied, and a widget shown twice kept only in its first spot.
 * `known` is every widget id there is; the server passes the same list.
 */
export function cleanWidgetLayout(value: unknown, known: readonly string[]): WidgetLayout {
  const raw = (typeof value === "object" && value !== null ? value : {}) as Record<string, unknown>
  const seen = new Set<string>()
  const row = (name: WidgetRowName, allowed: readonly number[]): WidgetRow => {
    // A row never saved reads as the default row, widgets and all.
    const stored = (typeof raw[name] === "object" && raw[name] !== null ? raw[name] : DEFAULT_WIDGET_LAYOUT[name]) as Record<
      string,
      unknown
    >
    const columns = readColumns(stored.columns, allowed, DEFAULT_WIDGET_LAYOUT[name].columns)
    const given = Array.isArray(stored.spots) ? stored.spots : []
    const spots = Array.from({ length: columns }, (_, index) => {
      const id = given[index]
      if (typeof id !== "string" || !known.includes(id) || seen.has(id)) return null
      seen.add(id)
      return id
    })
    return { columns, spots }
  }
  return { top: row("top", TOP_ROW_COLUMNS), bottom: row("bottom", BOTTOM_ROW_COLUMNS) }
}

/**
 * A row given a new number of columns. Spots that stay keep their widget;
 * new ones start Empty, and the ones taken away go with their widgets.
 */
export function setRowColumns(layout: WidgetLayout, name: WidgetRowName, columns: number): WidgetLayout {
  const current = layout[name]
  const spots = Array.from({ length: columns }, (_, index) => current.spots[index] ?? null)
  return { ...layout, [name]: { columns, spots } }
}

/**
 * A widget (or Empty, null) put in one spot. The widget leaves any other
 * spot it was in, so it still shows once.
 */
export function placeWidget(
  layout: WidgetLayout,
  name: WidgetRowName,
  index: number,
  id: string | null
): WidgetLayout {
  const clear = (row: WidgetRow): WidgetRow => ({
    ...row,
    spots: row.spots.map((spot) => (id !== null && spot === id ? null : spot)),
  })
  const next = { top: clear(layout.top), bottom: clear(layout.bottom) }
  next[name] = { ...next[name], spots: next[name].spots.map((spot, at) => (at === index ? id : spot)) }
  return next
}

/**
 * How many widgets Overview shows: the filled spots in the rows that show.
 * The Dashboards block's count beside Overview (Tyler, 8 Nov 2026: "the
 * overview should have a number too (number of widgets)").
 */
export function widgetsShown(layout: WidgetLayout): number {
  const rows = layout.bottom.columns > 0 ? [layout.top, layout.bottom] : [layout.top]
  return rows.reduce((total, row) => total + row.spots.filter((id) => id !== null).length, 0)
}
