import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import type { WidgetLayout } from "@/lib/admin-dashboard/overview-widgets"
import { PAGE_MAX_LENGTH } from "@/lib/notes/page-body"
import { coverImagesSchema, coverSchema } from "@/lib/notes/page-cover"
import { userGet, userPost } from "@/server/guards"
import {
  countSavedPlaces,
  getTripsPageAndSections,
  getTripsWidgets,
  listTripPlaces,
  loadTripsOverview,
  saveTripsPageBody,
  saveTripsSections,
  saveTripsWidgets,
  setTripsPageCover,
  setTripsPageLock,
} from "@/server/travel/trips-dashboard"

export type { OverviewCard, TripMoney, TripPlace, TripsOverview, TripsSections } from "@/server/travel/trips-dashboard"

/**
 * The Trips dashboard's own records (Tyler, 12 Nov 2026): each person's left
 * page and Overview layout, Overview's figures, and the places from trips.
 * Every one is the signed-in person's own.
 */

const loadPageFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) => {
    const [{ page, sections }, savedCount] = await Promise.all([
      getTripsPageAndSections(context.user.id),
      countSavedPlaces(context.user.id),
    ])
    return { page, sections, savedCount }
  })

const sectionSchema = z.array(z.enum(["trips", "places"])).max(2)

const saveSectionsFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ hidden: sectionSchema, order: sectionSchema }))
  .handler(async ({ data, context }) => saveTripsSections(context.user.id, data))

const savePageFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ body: z.string().max(PAGE_MAX_LENGTH) }))
  .handler(async ({ data, context }) => saveTripsPageBody(context.user.id, data.body))

const lockPageFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ locked: z.boolean() }))
  .handler(async ({ data, context }) => setTripsPageLock(context.user.id, data.locked))

const coverFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ coverUrl: coverSchema, coverImages: coverImagesSchema }))
  .handler(async ({ data, context }) => setTripsPageCover(context.user.id, data))

const rowSchema = z.object({
  columns: z.number().int().min(0).max(4),
  spots: z.array(z.string().max(80).nullable()).max(4),
})

const loadWidgetsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }): Promise<WidgetLayout> => getTripsWidgets(context.user.id))

const saveWidgetsFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ top: rowSchema, bottom: rowSchema }))
  .handler(async ({ data, context }): Promise<WidgetLayout> => saveTripsWidgets(context.user.id, data))

const overviewFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) => loadTripsOverview(context.user.id))

const tripPlacesFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) => listTripPlaces(context.user.id))

/** The left page, the Dashboards block's hidden sections and order, and how many saved places there are. */
export function loadTripsPage() {
  return loadPageFn()
}
export function saveTripsPageSections(sections: { hidden: ("trips" | "places")[]; order: ("trips" | "places")[] }) {
  return saveSectionsFn({ data: sections })
}
export function saveTripsPage(body: string) {
  return savePageFn({ data: { body } })
}
export function lockTripsPage(locked: boolean) {
  return lockPageFn({ data: { locked } })
}
export function setTripsPageCoverPhoto(cover: { coverUrl: string | null; coverImages: string[] }) {
  return coverFn({ data: cover })
}
export function loadTripsWidgets() {
  return loadWidgetsFn()
}
export function saveTripsWidgetLayout(layout: WidgetLayout) {
  return saveWidgetsFn({ data: layout })
}
/** Must do, Ideas and each trip's money, for Overview's widgets. */
export function loadTripsOverviewFigures() {
  return overviewFn()
}
/** Cards marked Done or ticked Would go again, for the Places section's Go again and Been tabs. */
export function loadTripPlaces() {
  return tripPlacesFn()
}
