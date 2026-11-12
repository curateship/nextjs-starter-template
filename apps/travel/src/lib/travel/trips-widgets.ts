import {
  CalendarDaysIcon,
  CalendarHeartIcon,
  CloudSunIcon,
  CoinsIcon,
  FlagIcon,
  Globe2Icon,
  LightbulbIcon,
  MapIcon,
  PiggyBankIcon,
  PlaneTakeoffIcon,
  StarIcon,
  type LucideIcon,
} from "lucide-react"

import type { WidgetLayout, WidgetOffer } from "@/lib/admin-dashboard/overview-widgets"

/**
 * The Trips dashboard's Overview widgets (Tyler, 12 Nov 2026). They sit in
 * the shell's grid of up to two rows, each widget shown once, and the layout
 * is each person's own, kept with their Trips page
 * (`travel_trips_pages.widgets`), as Trade keeps one per account.
 *
 * Next trip leads with the trip that's on today while one is: its day and
 * a way straight into today on the board.
 */
export const TRIPS_WIDGETS = [
  { id: "next-trip", label: "Next trip", icon: PlaneTakeoffIcon },
  { id: "map", label: "Map", icon: MapIcon },
  { id: "year", label: "Year", icon: CalendarDaysIcon },
  { id: "must-do", label: "Must do", icon: FlagIcon },
  { id: "weather", label: "Weather", icon: CloudSunIcon },
  { id: "holidays", label: "Holidays", icon: CalendarHeartIcon },
  { id: "best-rated", label: "Best rated", icon: StarIcon },
  { id: "countries", label: "Countries", icon: Globe2Icon },
  { id: "ideas", label: "Ideas", icon: LightbulbIcon },
  { id: "money", label: "Money this year", icon: CoinsIcon },
  { id: "next-money", label: "Next trip's money", icon: PiggyBankIcon },
] as const satisfies readonly { id: string; label: string; icon: LucideIcon }[]

export type TripsWidgetId = (typeof TRIPS_WIDGETS)[number]["id"]

export const TRIPS_WIDGET_IDS: readonly string[] = TRIPS_WIDGETS.map((widget) => widget.id)

export const TRIPS_WIDGET_OFFER: WidgetOffer = { choices: TRIPS_WIDGETS }

export function findTripsWidget(id: string) {
  return TRIPS_WIDGETS.find((widget) => widget.id === id)
}

/** What Overview starts with: the next trip, the map and the year on top; the next trip's plans under them. */
export const DEFAULT_TRIPS_WIDGETS: WidgetLayout = {
  top: { columns: 3, spots: ["next-trip", "map", "year"] },
  bottom: { columns: 4, spots: ["must-do", "weather", "holidays", "best-rated"] },
}
