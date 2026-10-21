import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { describeBulkResult } from "@/lib/format/bulk-result"
import { DRAFT_TONES } from "@/lib/dating/options"
import { askAboutMatches, draftReply, tidyReply, type MatchAnswer } from "@/server/dating/ai"
import {
  clearDeadMatches,
  deleteFact,
  dismissDraft,
  ownMatch,
  saveFact,
  saveNote,
  setAiDrafts,
  setDatePlan,
  setManyMovedToText,
  setMovedToText,
  setNotOver,
} from "@/server/dating/chats"
import { calendarConnection, disconnectCalendar, syncDateEvent, type CalendarConnection } from "@/server/dating/google-calendar"
import { inWords } from "@/server/dating/words"
import { db } from "@/server/db"
import { userGet, userPost } from "@/server/guards"
import { workspaceIdForRequest } from "@/server/workspaces/for-request"

/**
 * The server functions for working on one chat (task
 * "features/01-chats-and-replies"): three drafts, tone, tidy, the facts,
 * the note, taking a chat over, moving it to text, "Not over", the date's
 * time and place with Google Calendar, Ask Date, clearing dead matches, and
 * moving several chats to text at once.
 * Every one is behind sign-in and acts only on the member's own matches; a
 * sample never reaches the AI or a phone.
 */

export type { CalendarConnection, MatchAnswer }

const SAMPLE_AI_WORDS = "This is a sample conversation, so the AI does not write for it."
const id = z.string().min(1).max(40)
const matchInput = z.object({ matchId: id })

async function realMatch(userId: string, matchId: string) {
  const match = await ownMatch(userId, matchId)
  if (match.sample) throw new Error(SAMPLE_AI_WORDS)
  return match
}

const redraftFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(matchInput.extend({ tone: z.enum(DRAFT_TONES).nullable(), three: z.boolean() }))
  .handler(async ({ data, context }) =>
    inWords(async () => {
      const match = await realMatch(context.user.id, data.matchId)
      const mode = match.draft && match.draftKind !== "reply" ? match.draftKind : undefined
      const outcome = await draftReply(match.id, db, new Date(), {}, { notThis: match.draft, anyTurn: true, mode, tone: data.tone, three: data.three })
      if (outcome.status !== "done") throw new Error(outcome.words)
    })
  )

/** Shorter, Funnier or Warmer: the AI writes the draft again in that direction. */
export function redraftWithTone(matchId: string, tone: (typeof DRAFT_TONES)[number]) {
  return redraftFn({ data: { matchId, tone, three: false } })
}

/** Show 3: three drafts at once. The first is the draft; the other two are choices to pick from. */
export function showThreeDrafts(matchId: string) {
  return redraftFn({ data: { matchId, tone: null, three: true } })
}

const tidyFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(matchInput.extend({ text: z.string().min(1).max(1_000) }))
  .handler(async ({ data, context }) =>
    inWords(async () => {
      const match = await realMatch(context.user.id, data.matchId)
      const outcome = await tidyReply(match.id, data.text)
      if (outcome.status !== "done") throw new Error(outcome.words)
      return { text: outcome.text }
    })
  )

/** Tidy: the member's own words back in their voice, for the reply box. Nothing is saved or sent. */
export function tidyMyReply(matchId: string, text: string) {
  return tidyFn({ data: { matchId, text } })
}

const factFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(matchInput.extend({ factId: id.nullable(), text: z.string().max(1_000), remove: z.boolean() }))
  .handler(async ({ data, context }) =>
    inWords(async () => {
      if (data.remove) {
        if (!data.factId) throw new Error("That fact is gone.")
        await deleteFact(context.user.id, data.matchId, data.factId)
      } else {
        await saveFact(context.user.id, data.matchId, data.factId, data.text)
      }
    })
  )

/** Adds a fact, or changes one (`factId`). The AI never overwrites a fact the member wrote. */
export function saveMatchFact(matchId: string, factId: string | null, text: string) {
  return factFn({ data: { matchId, factId, text, remove: false } })
}

export function deleteMatchFact(matchId: string, factId: string) {
  return factFn({ data: { matchId, factId, text: "", remove: true } })
}

const noteFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(matchInput.extend({ note: z.string().max(2_000) }))
  .handler(async ({ data, context }) => inWords(() => saveNote(context.user.id, data.matchId, data.note)))

/** The member's note to the AI about this chat only, saved as it is typed. */
export function saveMatchNote(matchId: string, note: string) {
  return noteFn({ data: { matchId, note } })
}

const chatStateFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(matchInput.extend({ change: z.enum(["ai-on", "ai-off", "moved", "not-moved", "not-over"]) }))
  .handler(async ({ data, context }) =>
    inWords(async () => {
      if (data.change === "ai-on" || data.change === "ai-off") await setAiDrafts(context.user.id, data.matchId, data.change === "ai-on")
      else if (data.change === "moved" || data.change === "not-moved") await setMovedToText(context.user.id, data.matchId, data.change === "moved")
      else await setNotOver(context.user.id, data.matchId)
    })
  )

/** The "AI drafts here" switch. */
export function setAiDraftsHere(matchId: string, on: boolean) {
  return chatStateFn({ data: { matchId, change: on ? "ai-on" : "ai-off" } })
}

/** Moved to text, or its Undo. */
export function markMovedToText(matchId: string, moved: boolean) {
  return chatStateFn({ data: { matchId, change: moved ? "moved" : "not-moved" } })
}

const dismissFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(matchInput)
  .handler(async ({ data, context }) => inWords(() => dismissDraft(context.user.id, data.matchId)))

/** Dismiss on the AI's draft: it goes, and no new one is written for the same message. */
export function dismissAiDraft(matchId: string) {
  return dismissFn({ data: { matchId } })
}

const manyMovedFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ matchIds: z.array(id).min(1).max(300) }))
  .handler(async ({ data, context }): Promise<{ moved: string[]; words: string }> =>
    inWords(async () => {
      const result = await setManyMovedToText(context.user.id, data.matchIds)
      const words = describeBulkResult({
        done: result.moved.length,
        kept: result.skipped.length,
        one: "chat",
        many: "chats",
        verb: "moved to text",
        keptReason: "already moved or unmatched",
      })
      return { moved: result.moved, words }
    })
  )

/** Moved to text for the ticked chats, in one request. */
export function markManyMovedToText(matchIds: string[]) {
  return manyMovedFn({ data: { matchIds } })
}

/** "Not over": the AI drafts in this chat again. */
export function markNotOver(matchId: string) {
  return chatStateFn({ data: { matchId, change: "not-over" } })
}

const planFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(matchInput.extend({ dateAt: z.string().datetime({ offset: true }).nullable(), place: z.string().max(300) }))
  .handler(async ({ data, context }): Promise<{ googleWords: string }> =>
    inWords(async () => {
      const workspaceId = await workspaceIdForRequest(context.user.id)
      await setDatePlan(context.user.id, data.matchId, { dateAt: data.dateAt ? new Date(data.dateAt) : null, place: data.place })
      // The date is saved in Date whatever Google says; a Google failure is said, not thrown.
      try {
        const done = await syncDateEvent(context.user.id, workspaceId, data.matchId)
        return { googleWords: done === "written" ? "It is in your Google Calendar too." : done === "deleted" ? "It is out of your Google Calendar too." : "" }
      } catch (error) {
        return { googleWords: `Saved in Date, but not in Google Calendar: ${error instanceof Error ? error.message : "Google could not be reached."}` }
      }
    })
  )

/** Sets or clears the date's time and place, and brings its Google Calendar event into line. */
export function saveDatePlan(matchId: string, dateAt: Date | null, place: string) {
  return planFn({ data: { matchId, dateAt: dateAt ? dateAt.toISOString() : null, place } })
}

const googleFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }): Promise<CalendarConnection> =>
    inWords(async () => calendarConnection(context.user.id, await workspaceIdForRequest(context.user.id)))
  )

export function loadGoogleCalendar() {
  return googleFn()
}

const disconnectFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .handler(async ({ context }) => inWords(async () => disconnectCalendar(context.user.id, await workspaceIdForRequest(context.user.id))))

/** Forgets the Google Calendar. Events already written stay in it. */
export function disconnectGoogleCalendar() {
  return disconnectFn()
}

const askFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ question: z.string().min(1).max(300) }))
  .handler(async ({ data, context }): Promise<MatchAnswer[]> =>
    inWords(async () => askAboutMatches(context.user.id, await workspaceIdForRequest(context.user.id), data.question))
  )

/** Ask Date: who said they like hiking, and the like, from what each match told the member. */
export function askDate(question: string) {
  return askFn({ data: { question } })
}

const clearFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ matchIds: z.array(id).min(1).max(300) }))
  .handler(async ({ data, context }): Promise<{ queued: string[]; skipped: string[]; words: string }> =>
    inWords(async () => {
      const result = await clearDeadMatches(context.user.id, await workspaceIdForRequest(context.user.id), data.matchIds)
      const words = describeBulkResult({
        done: result.queued.length,
        kept: result.skipped.length,
        one: "unmatch",
        many: "unmatches",
        verb: "put on the phone's list",
        keptReason: "no longer dead, or already gone",
      })
      return { ...result, words }
    })
  )

/** One unmatch on the phone for each dead match, in one request. */
export function clearDeadMatchesNow(matchIds: string[]) {
  return clearFn({ data: { matchIds } })
}
