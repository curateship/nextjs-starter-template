import {
  BarChart3Icon,
  CpuIcon,
  FileTextIcon,
  GaugeIcon,
  Globe2Icon,
  HourglassIcon,
  MailIcon,
  MonitorSmartphoneIcon,
  SparklesIcon,
  TimerIcon,
  TrendingUpIcon,
  UsersIcon,
  WorkflowIcon,
  type LucideIcon,
} from "lucide-react"

import { appAdminWidgets, appCrmWidgets } from "@/lib/app-options"

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
 *   `admin_widget_layouts`, one per dashboard (`WidgetBoard`).
 *
 * Two dashboards have an Overview of widgets: the Admin dashboard's, with the
 * shell's nine below, and the CRM's, with the shell's four Inbox widgets.
 * An app adds its own through `admin.widgets` and `crm.widgets` in its
 * `src/app/options.ts`, keyed `app:<key>` so they never meet the shell's.
 */

/** The dashboards with an Overview of widgets, each with a layout of its own. */
export const WIDGET_BOARDS = ["admin", "crm"] as const
export type WidgetBoard = (typeof WIDGET_BOARDS)[number]

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

/**
 * The shell's own widgets on the CRM's Overview, all about the Inbox (CRM
 * task 38, part 2; Tyler picked "Inbox widgets on Overview" on 25 Nov 2026).
 * Their ids are the CRM board's alone, so they never meet Admin's.
 */
export const CRM_SHELL_WIDGETS = [
  { id: "unread", label: "Unread", icon: MailIcon },
  { id: "waiting", label: "Waiting on you", icon: HourglassIcon },
  { id: "mail-per-day", label: "Mail per day", icon: BarChart3Icon },
  { id: "first-answer", label: "Time to first answer", icon: TimerIcon },
] as const satisfies readonly { id: string; label: string; icon: LucideIcon }[]

export type CrmShellWidgetId = (typeof CRM_SHELL_WIDGETS)[number]["id"]

/** Whether a CRM Overview spot holds one of the shell's own widgets rather than the app's. */
export function isCrmShellWidgetId(id: string): id is CrmShellWidgetId {
  return CRM_SHELL_WIDGETS.some((widget) => widget.id === id)
}

/** An app's widget as the layout stores it. */
export function appWidgetId(key: string) {
  return `app:${key}`
}

/** One widget the Widgets tab offers. */
export type WidgetChoice = { id: string; label: string; icon: LucideIcon }

/**
 * Every widget a dashboard offers: the shell's own first (Admin's nine, the
 * CRM's four Inbox widgets), then the app's.
 */
export function widgetChoices(board: WidgetBoard): WidgetChoice[] {
  const shell: readonly WidgetChoice[] = board === "admin" ? SHELL_WIDGETS : CRM_SHELL_WIDGETS
  const app = board === "admin" ? appAdminWidgets(SHELL_WIDGET_IDS) : appCrmWidgets()
  return [
    ...shell,
    ...app.map((widget) => ({ id: appWidgetId(widget.key), label: widget.label, icon: widget.icon })),
  ]
}

/**
 * An app's own grid of widgets, on a dashboard that is neither Admin's nor
 * the CRM's: the widgets it offers, and what an empty list says. Trade's
 * dashboard is one (8 Nov 2026), with its six trading widgets and a layout
 * saved per account (`WidgetStore` in `use-widget-layout.ts`).
 */
export type WidgetOffer = { choices: readonly WidgetChoice[]; none?: string }

/**
 * Where a grid's widgets come from: a board, whose list the shell builds, or
 * an app's own offer. Exactly one is given.
 */
export type WidgetSource = { board: WidgetBoard; offer?: undefined } | { board?: undefined; offer: WidgetOffer }

/** The widgets a grid offers, from its board or its own offer. */
export function offeredWidgets(source: WidgetSource): readonly WidgetChoice[] {
  return source.offer ? source.offer.choices : widgetChoices(source.board)
}

/**
 * What a grid with nothing to offer says. Both boards have the shell's own
 * widgets, so only an app's own offer can be empty, and it may say so in its
 * own words.
 */
export function noWidgetsText(source: WidgetSource): string {
  return source.offer?.none ?? "No widgets yet."
}

export const TOP_ROW_COLUMNS = [1, 2, 3, 4] as const
/** 0 is None: one row only. */
export const BOTTOM_ROW_COLUMNS = [0, 1, 2, 3, 4] as const

export type WidgetRow = { columns: number; spots: (string | null)[] }
export type WidgetLayout = { top: WidgetRow; bottom: WidgetRow }
export type WidgetRowName = keyof WidgetLayout

/** What a site's Admin Overview starts with: two charts on top, three lists under them. */
export const DEFAULT_WIDGET_LAYOUT: WidgetLayout = {
  top: { columns: 2, spots: ["views", "ai-spend"] },
  bottom: { columns: 3, spots: ["top-pages", "ai-features", "by-person"] },
}

/**
 * What the CRM's Overview starts with: Unread and Waiting on you on top, Mail
 * per day and Time to first answer under them. A site that saved a layout
 * keeps it; the new widgets are offered there, never pushed in.
 */
export const DEFAULT_CRM_WIDGET_LAYOUT: WidgetLayout = {
  top: { columns: 2, spots: ["unread", "waiting"] },
  bottom: { columns: 2, spots: ["mail-per-day", "first-answer"] },
}

export function defaultWidgetLayout(board: WidgetBoard): WidgetLayout {
  return board === "admin" ? DEFAULT_WIDGET_LAYOUT : DEFAULT_CRM_WIDGET_LAYOUT
}

function readColumns(value: unknown, allowed: readonly number[], fallback: number) {
  return typeof value === "number" && allowed.includes(value) ? value : fallback
}

/**
 * A stored or sent layout made safe: columns within their range, exactly one
 * spot per column, widgets nobody knows (an app's that was taken away)
 * emptied, and a widget shown twice kept only in its first spot.
 * `known` is every widget id there is; the server passes the same list.
 * `defaults` is the dashboard's starting layout, which a row never saved
 * reads as.
 */
export function cleanWidgetLayout(
  value: unknown,
  known: readonly string[],
  defaults: WidgetLayout = DEFAULT_WIDGET_LAYOUT
): WidgetLayout {
  const raw = (typeof value === "object" && value !== null ? value : {}) as Record<string, unknown>
  const seen = new Set<string>()
  const row = (name: WidgetRowName, allowed: readonly number[]): WidgetRow => {
    // A row never saved reads as the default row, widgets and all.
    const stored = (typeof raw[name] === "object" && raw[name] !== null ? raw[name] : defaults[name]) as Record<
      string,
      unknown
    >
    const columns = readColumns(stored.columns, allowed, defaults[name].columns)
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
