import type { ShellSection } from "@/lib/custom-shell"

/**
 * Travel's screens in the left menu. The members' and admins' menus get the
 * section from a background job (`src/server/travel/navigation.ts`), once.
 */

export const TRAVEL_NAV_SECTION_ID = "section-travel"
export const TRIPS_ITEM_ID = "item-travel-trips"

export function travelNavSection(): ShellSection {
  return {
    id: TRAVEL_NAV_SECTION_ID,
    title: "Travel",
    entries: [
      {
        type: "item",
        id: TRIPS_ITEM_ID,
        label: "Trips",
        href: "/trips",
        icon: "plane-takeoff",
        visible: true,
      },
    ],
  }
}
