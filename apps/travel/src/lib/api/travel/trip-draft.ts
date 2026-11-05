import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { TRAVEL_ERRORS } from "@/lib/travel/errors"
import { MAX_TRIP_DAYS, TIME_PATTERN, id } from "@/lib/travel/rules"
import { enforceRateLimit } from "@/server/auth/rate-limit"
import { userPost } from "@/server/guards"
import { createDraftActivities, DRAFT_DAYS_MAX, draftTripPlan, fillTripDay, IDEAS_MAX, suggestTripIdeas } from "@/server/travel/trip-draft"

import type { DraftItem } from "@/server/travel/trip-draft"

export type { DraftItem, IdeaItem, MadePlan, TripDraft } from "@/server/travel/trip-draft"

/** Each plan made can look up 70 places on Google, so one person can only make so many. */
async function limitPlans(userId: string) {
  try {
    await enforceRateLimit(`travel-trip-draft:${userId}`, { maxAttempts: 20, windowSeconds: 10 * 60 })
  } catch (error) {
    if (error instanceof Error && error.message.includes("RATE_LIMITED")) throw new Error(TRAVEL_ERRORS.tooManySearches)
    throw error
  }
}

// A POST because it spends AI allowance, even though nothing is saved.
const draftFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ tripId: id }))
  .handler(async ({ data, context }) => {
    await limitPlans(context.user.id)
    return draftTripPlan(context.user.id, data)
  })

// Fill this day (More Travel features part 6): the same allowance as drafting, and nothing saved either.
const fillDayFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ tripId: id, day: z.number().int().min(1).max(MAX_TRIP_DAYS) }))
  .handler(async ({ data, context }) => {
    await limitPlans(context.user.id)
    return fillTripDay(context.user.id, data)
  })

const createFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      tripId: id,
      items: z
        .array(
          z.object({
            day: z.number().int().min(1).max(MAX_TRIP_DAYS),
            title: z.string().trim().min(1, "Give every activity a name, or untick it.").max(200),
            typeId: id.nullable(),
            startTime: z.string().regex(TIME_PATTERN, "Pick a time.").nullable(),
            durationMinutes: z.number().int().min(5).max(24 * 60).nullable(),
          })
        )
        .min(1, "Tick at least one activity to add.")
        .max(DRAFT_DAYS_MAX * 5),
    })
  )
  .handler(async ({ data, context }) => {
    await limitPlans(context.user.id)
    return createDraftActivities(context.user.id, data)
  })

// Suggest Ideas (Travel features 3, part 9): the same allowance, and nothing saved either.
const ideasFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ tripId: id }))
  .handler(async ({ data, context }) => {
    await limitPlans(context.user.id)
    return suggestTripIdeas(context.user.id, data)
  })

const createIdeasFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      tripId: id,
      items: z
        .array(
          z.object({
            title: z.string().trim().min(1, "Give every place a name, or untick it.").max(200),
            typeId: id.nullable(),
          })
        )
        .min(1, "Tick at least one place to add.")
        .max(IDEAS_MAX),
    })
  )
  .handler(async ({ data, context }) => {
    await limitPlans(context.user.id)
    return createDraftActivities(context.user.id, {
      tripId: data.tripId,
      items: data.items.map((item) => ({ ...item, day: null, startTime: null, durationMinutes: null })),
    })
  })

/** Asks the AI for 10 places for the trip's Ideas (Travel features 3, part 9). Nothing is saved. */
export function suggestIdeas(tripId: string) {
  return ideasFn({ data: { tripId } })
}

/** Puts the ticked suggested places into Ideas, never onto a day. */
export function createIdeas(tripId: string, items: { title: string; typeId: string | null }[]) {
  return createIdeasFn({ data: { tripId, items } })
}

/** Asks the AI for a first plan for the trip's empty days (Travel features part 7). Nothing is saved. */
export function draftPlan(tripId: string) {
  return draftFn({ data: { tripId } })
}

/** Asks the AI for timed sights and meals in one day's free time (More Travel features part 6). Nothing is saved. */
export function fillDay(tripId: string, day: number) {
  return fillDayFn({ data: { tripId, day } })
}

/** Makes the ticked activities of a drafted plan. */
export function createPlan(tripId: string, items: DraftItem[]) {
  return createFn({ data: { tripId, items } })
}
