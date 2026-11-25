import * as React from "react"
import { ListIcon, MapIcon } from "lucide-react"

import {
  DashboardToolbarButton,
  dashboardToolbarButtonActiveClassName,
  dashboardToolbarButtonGroupClassName,
  dashboardToolbarButtonGroupItemClassName,
} from "@/components/shared/dashboard-toolbar"
import { GoogleMap, type MapPin } from "@/components/travel/google-map"
import { ActivityTypeIcon } from "@/components/travel/type-icon"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { ActivityType } from "@/lib/api/travel/types"
import { placeFacts, type PlaceRow } from "@/lib/travel/trips-lists"
import { PLACE_VIEWS, type PlaceView } from "@/lib/travel/trips-search"
import { cn } from "@/lib/utils"

/**
 * Places' List and Map switch (Travel features 5, part 2), drawn as the Admin
 * dashboard's Media tab draws its List and Gallery pair: one control with the
 * header's light grey line round it, the one showing solid.
 */
export function PlaceViewSwitch({ value, onChange }: { value: PlaceView; onChange: (next: PlaceView) => void }) {
  return (
    <div className={cn(dashboardToolbarButtonGroupClassName, "border-zinc-200/60 bg-background dark:border-zinc-700/60")}>
      {PLACE_VIEWS.map((view) => (
        <Tooltip key={view}>
          <TooltipTrigger asChild>
            <DashboardToolbarButton
              type="button"
              variant={value === view ? "default" : "ghost"}
              className={cn(dashboardToolbarButtonGroupItemClassName, value === view && dashboardToolbarButtonActiveClassName)}
              onClick={() => onChange(view)}
              aria-label={view === "list" ? "Show as a list" : "Show on a map"}
              aria-pressed={value === view}
            >
              {view === "list" ? <ListIcon className="size-4" /> : <MapIcon className="size-4" />}
            </DashboardToolbarButton>
          </TooltipTrigger>
          <TooltipContent>{view === "list" ? "List" : "Map"}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  )
}

/**
 * Places on a map (Travel features 5, part 2): the rows the list would show,
 * with the same tab, search and Type filter, as pins. Clicking a pin opens
 * the place on the right, as clicking its row does. Places with no map
 * position are listed under the map so none is lost, as on a trip's Map tab.
 * Google Maps loads only while this view is showing.
 */
export function PlacesMap({
  rows,
  types,
  openId,
  empty,
  onPick,
}: {
  rows: readonly PlaceRow[]
  types: readonly ActivityType[]
  openId: string | undefined
  /** The list's loading, failed or empty line, shown in place of the map. */
  empty: React.ReactNode
  onPick: (id: string) => void
}) {
  if (empty) return <div className="p-3 text-sm text-muted-foreground">{empty}</div>

  const pins: MapPin[] = []
  const unplaced: PlaceRow[] = []
  for (const row of rows) {
    const { title, place } = placeFacts(row)
    if (typeof place?.lat === "number" && typeof place.lng === "number") {
      pins.push({ id: row.id, lat: place.lat, lng: place.lng, title: place.address ? `${title}, ${place.address}` : title })
    } else {
      unplaced.push(row)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
      <GoogleMap
        className="min-h-64 flex-1"
        pins={pins}
        onPick={onPick}
        emptyText="None of these places has an address from Google yet."
      />
      {unplaced.length ? (
        <div className="grid shrink-0 gap-1">
          <p className="text-xs font-medium text-muted-foreground">Not on the map, with no address picked from Google</p>
          <ScrollArea viewportClassName="max-h-40">
            <ul className="grid gap-0.5">
              {unplaced.map((row) => {
                const { title, typeId } = placeFacts(row)
                const type = typeId ? (types.find((each) => each.id === typeId) ?? null) : null
                return (
                  <li key={row.id}>
                    <button
                      type="button"
                      onClick={() => onPick(row.id)}
                      className={cn(
                        "flex w-full min-w-0 items-center gap-2 rounded px-1 py-0.5 text-left text-sm hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                        row.id === openId && "bg-accent"
                      )}
                    >
                      <ActivityTypeIcon type={type} />
                      <span className="truncate">{title}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </ScrollArea>
        </div>
      ) : null}
    </div>
  )
}
