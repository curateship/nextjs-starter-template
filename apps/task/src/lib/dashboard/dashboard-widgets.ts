import {
  GaugeIcon,
  GlobeIcon,
  BellIcon,
  UsersIcon,
  WorkflowIcon,
  type LucideIcon,
} from "lucide-react"

/**
 * The Overview dashboard's cards, and where each one sits.
 *
 * Every card on `/admin/dashboard` is a widget an admin can move: a full-width
 * strip across the top, then two columns. What is not in any of the three is
 * simply not on the dashboard — that is how a card is switched off — and the
 * Widgets settings tab lists those so they can be dragged back.
 *
 * The arrangement is saved per workspace, next to the sidebar and the styling,
 * so two admins can keep different dashboards.
 */

export const DASHBOARD_WIDGET_SLOTS = ["top", "left", "right"] as const

export type DashboardWidgetSlot = (typeof DASHBOARD_WIDGET_SLOTS)[number]

export type DashboardWidgetId =
  | "figures"
  | "inbox"
  | "people"
  | "traffic"
  | "automations"

/**
 * Widgets that no longer exist, and what took their place. "Needs you" and
 * "Activity" were two cards; they are now one activity feed. A workspace that
 * saved the old ids keeps its dashboard — the first becomes the current card
 * and the second is dropped as a repeat.
 */
const RETIRED_WIDGET_IDS: Record<string, DashboardWidgetId> = {
  "needs-you": "inbox",
  activity: "inbox",
}

export type DashboardWidgetLayout = Record<
  DashboardWidgetSlot,
  DashboardWidgetId[]
>

export type DashboardWidget = {
  id: DashboardWidgetId
  label: string
  /** One line, in the Widgets settings tab, saying what the card holds. */
  description: string
  icon: LucideIcon
  /**
   * Its share of the column it is in, and how far a divider may squeeze it —
   * the same weights the fixed layout used, so the default arrangement opens
   * exactly as the page always did.
   */
  size: number
  minSize: string
}

/** Every widget there is, in the order the settings tab lists them. */
const DASHBOARD_WIDGETS: DashboardWidget[] = [
  {
    id: "figures",
    label: "Headline figures",
    description:
      "The row of numbers across the top: members, money, and feedback this week.",
    icon: GaugeIcon,
    size: 3,
    minSize: "16%",
  },
  {
    id: "inbox",
    label: "Activity",
    description:
      "Notifications from today, the last 7 or 30 days, or everything still unread.",
    icon: BellIcon,
    size: 10,
    minSize: "20%",
  },
  {
    id: "people",
    label: "People",
    description:
      "Who is joining, the newest accounts, and who sits on which plan.",
    icon: UsersIcon,
    size: 4,
    minSize: "20%",
  },
  {
    id: "traffic",
    label: "Visitors over time",
    description: "Views per day, for today, a week, a month or a year.",
    icon: GlobeIcon,
    size: 4,
    minSize: "18%",
  },
  {
    id: "automations",
    label: "Automations",
    description: "Your automations, the ones needing attention first.",
    icon: WorkflowIcon,
    size: 3,
    minSize: "18%",
  },
]

const widgetsById = new Map(
  DASHBOARD_WIDGETS.map((widget) => [widget.id, widget])
)

export function findDashboardWidget(id: string): DashboardWidget | undefined {
  return widgetsById.get(id as DashboardWidgetId)
}

/** The arrangement the page has always had, and what Reset puts back. */
export function createDefaultDashboardWidgets(): DashboardWidgetLayout {
  return {
    top: ["figures"],
    left: ["inbox"],
    right: ["people", "traffic", "automations"],
  }
}

/**
 * A saved arrangement, made safe to render.
 *
 * A workspace saved before widgets existed has nothing here, so it gets the
 * default — the layout it was already looking at. Anything else is taken as
 * written, minus what cannot be drawn: ids no widget answers to (a card that
 * has since been retired, or a hand-edited row) and any repeat of a widget
 * already placed, because one card cannot be in two places.
 *
 * An arrangement that leaves every slot empty is kept empty. An admin who
 * cleared the board meant it, and handing the cards back on read would make
 * that impossible to save.
 */
export function normalizeDashboardWidgets(value: unknown): DashboardWidgetLayout {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return createDefaultDashboardWidgets()
  }

  const saved = value as Partial<Record<DashboardWidgetSlot, unknown>>
  // Nothing recognisable in the row at all is a row that predates this, not a
  // board somebody emptied.
  if (!DASHBOARD_WIDGET_SLOTS.some((slot) => Array.isArray(saved[slot]))) {
    return createDefaultDashboardWidgets()
  }

  const seen = new Set<DashboardWidgetId>()
  const layout = {} as DashboardWidgetLayout
  for (const slot of DASHBOARD_WIDGET_SLOTS) {
    const ids = Array.isArray(saved[slot]) ? (saved[slot] as unknown[]) : []
    layout[slot] = ids.flatMap((raw) => {
      if (typeof raw !== "string") return []
      const id = (RETIRED_WIDGET_IDS[raw] ?? raw) as DashboardWidgetId
      if (!widgetsById.has(id)) return []
      if (seen.has(id)) return []
      seen.add(id)
      return [id]
    })
  }

  return layout
}

/** Which slot a widget is in, or null when it is off the dashboard. */
export function findWidgetSlot(
  layout: DashboardWidgetLayout,
  id: DashboardWidgetId
): DashboardWidgetSlot | null {
  return (
    DASHBOARD_WIDGET_SLOTS.find((slot) => layout[slot].includes(id)) ?? null
  )
}

/** The widgets nowhere on the dashboard, in the catalogue's own order. */
export function unplacedDashboardWidgets(
  layout: DashboardWidgetLayout
): DashboardWidget[] {
  const placed = new Set(DASHBOARD_WIDGET_SLOTS.flatMap((slot) => layout[slot]))
  return DASHBOARD_WIDGETS.filter((widget) => !placed.has(widget.id))
}

export function isDashboardBoardEmpty(layout: DashboardWidgetLayout) {
  return DASHBOARD_WIDGET_SLOTS.every((slot) => layout[slot].length === 0)
}
