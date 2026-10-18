import { createServerFn } from "@tanstack/react-start"
import { and, eq } from "drizzle-orm"
import { z } from "zod"

import { draftReply, reviewOwnProfile, scoreCard } from "@/server/dating/ai"
import {
  dashboardPhone,
  loadDashboard,
  loadMatchDetail,
  loadProfileDetail,
  markMatchSeen,
  type DatingDashboard,
  type MatchDetail,
  type ProfileDetail,
} from "@/server/dating/dashboard"
import { addToAboutMe } from "@/server/dating/settings"
import { startLoop, stopLoopByHand } from "@/server/dating/worker"
import { inWords } from "@/server/dating/words"
import { db } from "@/server/db"
import { userGet, userPost } from "@/server/guards"
import { checkWalkAllowed, queueWalk } from "@/server/tinder/jobs"
import { dateMatches, dateProfiles } from "@/server/tinder/schema"
import { createOutgoingMessage, settleMessage } from "@/server/tinder/store"
import { workspaceIdForRequest } from "@/server/workspaces/for-request"

/**
 * The Dating dashboard's server functions. Every one is behind sign-in and
 * acts only on the member's own cards, matches and phone. Buttons on a sample
 * card or conversation are refused here, so nothing about a sample can ever
 * reach a phone or the AI.
 */

export type { DatingDashboard, MatchDetail, ProfileDetail }

const SAMPLE_WORDS = "This is a sample, so nothing was sent to a phone."

const loadDashboardFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }): Promise<DatingDashboard> =>
    inWords(async () => loadDashboard(context.user.id, await workspaceIdForRequest(context.user.id)))
  )

export function loadDatingDashboard() {
  return loadDashboardFn()
}

const loadProfileFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ profileId: z.string().min(1).max(40) }))
  .handler(async ({ data, context }): Promise<ProfileDetail> => inWords(() => loadProfileDetail(context.user.id, data.profileId)))

export function loadDatingProfile(profileId: string) {
  return loadProfileFn({ data: { profileId } })
}

const loadMatchFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ matchId: z.string().min(1).max(40) }))
  .handler(async ({ data, context }): Promise<MatchDetail> => inWords(() => loadMatchDetail(context.user.id, data.matchId)))

export function loadDatingMatch(matchId: string) {
  return loadMatchFn({ data: { matchId } })
}

const matchInput = z.object({ matchId: z.string().min(1).max(40) })

async function ownMatch(userId: string, matchId: string) {
  const [match] = await db.select().from(dateMatches).where(and(eq(dateMatches.id, matchId), eq(dateMatches.userId, userId))).limit(1)
  if (!match) throw new Error("That match is gone.")
  return match
}

async function ownCard(userId: string, profileId: string) {
  const [card] = await db.select().from(dateProfiles).where(and(eq(dateProfiles.id, profileId), eq(dateProfiles.userId, userId))).limit(1)
  if (!card) throw new Error("That card is gone.")
  return card
}

const markSeenFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(matchInput)
  .handler(async ({ data, context }) => inWords(() => markMatchSeen(context.user.id, data.matchId)))

export function markDatingMatchSeen(matchId: string) {
  return markSeenFn({ data: { matchId } })
}

const swipeFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ profileId: z.string().min(1).max(40), decision: z.enum(["like", "pass"]) }))
  .handler(async ({ data, context }) =>
    inWords(async () => {
      const card = await ownCard(context.user.id, data.profileId)
      if (card.sample) throw new Error(SAMPLE_WORDS)
      if (card.swipe !== "none") throw new Error(`${card.name} was already ${card.swipe === "like" ? "liked" : "passed"}.`)
      if (!card.phoneId) throw new Error("No phone read this card, so it cannot be swiped.")
      await queueWalk({ userId: context.user.id, phoneId: card.phoneId, kind: data.decision, input: { profileId: card.id }, askedBy: "member" })
    })
  )

/** Like or Pass on the dashboard: the phone swipes once it has checked the same card is in front. */
export function swipeCard(profileId: string, decision: "like" | "pass") {
  return swipeFn({ data: { profileId, decision } })
}

/** Puts one of the member's own walks on the phone's list. */
async function memberWalk(userId: string, kind: "read-card" | "read-matches" | "read-own-profile") {
  const workspaceId = await workspaceIdForRequest(userId)
  const phone = await dashboardPhone(userId, workspaceId)
  await queueWalk({ userId, phoneId: phone.id, kind, askedBy: "member" })
}

const readCardFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .handler(async ({ context }) => inWords(() => memberWalk(context.user.id, "read-card")))

/** Read the card in front: the phone reads it, and the AI scores it on the next pass. */
export function readCardInFront() {
  return readCardFn()
}

const readMatchesFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .handler(async ({ context }) => inWords(() => memberWalk(context.user.id, "read-matches")))

/** Reads the chat list now, and then every conversation with something new in it. */
export function readMatchesNow() {
  return readMatchesFn()
}

const readOwnFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .handler(async ({ context }) => inWords(() => memberWalk(context.user.id, "read-own-profile")))

/** Reads the member's own Tinder profile; the AI reviews it on the next pass. */
export function readMyProfile() {
  return readOwnFn()
}

const matchWalkFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(matchInput.extend({ kind: z.enum(["read-conversation", "unmatch"]) }))
  .handler(async ({ data, context }) =>
    inWords(async () => {
      const match = await ownMatch(context.user.id, data.matchId)
      if (match.sample) throw new Error(SAMPLE_WORDS)
      if (!match.phoneId) throw new Error("No phone read this match.")
      if (match.unmatchedAt) throw new Error(`You already unmatched ${match.theirName}.`)
      await queueWalk({ userId: context.user.id, phoneId: match.phoneId, kind: data.kind, input: { matchId: match.id }, askedBy: "member" })
    })
  )

/** Reads one conversation again from the phone. */
export function refreshConversation(matchId: string) {
  return matchWalkFn({ data: { matchId, kind: "read-conversation" } })
}

/** Unmatches through Tinder's own menu, after the dashboard's confirm. */
export function unmatchOnPhone(matchId: string) {
  return matchWalkFn({ data: { matchId, kind: "unmatch" } })
}

const sendFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(matchInput.extend({ text: z.string().min(1).max(1_000) }))
  .handler(async ({ data, context }) =>
    inWords(async () => {
      const match = await ownMatch(context.user.id, data.matchId)
      if (match.sample) throw new Error(SAMPLE_WORDS)
      if (!match.phoneId) throw new Error("No phone read this match, so nothing can be sent to it.")
      const text = data.text.trim()
      // A send the phone may not take now is refused before anything is
      // written, so the draft stays and nothing "not sent" is left in the chat.
      await checkWalkAllowed({ userId: context.user.id, phoneId: match.phoneId, kind: "send-message" })
      // The AI's own words, sent as they are, carry its "suggests a date" mark.
      const proposesDate = match.draftProposesDate && text === match.draft.trim()
      const messageId = await createOutgoingMessage(match.id, text, "member", proposesDate)
      try {
        await queueWalk({ userId: context.user.id, phoneId: match.phoneId, kind: "send-message", input: { matchId: match.id, messageId }, askedBy: "member" })
      } catch (error) {
        const words = error instanceof Error ? error.message : "It could not be put on the phone's list."
        await settleMessage(messageId, "failed", words)
        throw error
      }
    })
  )

/** Send from phone: the message is written down first, so it is never sent twice, then the phone types it. */
export function sendFromPhone(matchId: string, text: string) {
  return sendFn({ data: { matchId, text } })
}

const regenerateFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(matchInput)
  .handler(async ({ data, context }) =>
    inWords(async () => {
      const match = await ownMatch(context.user.id, data.matchId)
      if (match.sample) throw new Error("This is a sample conversation, so the AI does not write for it.")
      const outcome = await draftReply(match.id, db, new Date(), {}, { notThis: match.draft, anyTurn: true })
      if (outcome.status !== "done") throw new Error(outcome.words)
    })
  )

/** Regenerate: the AI writes the reply again, told not to repeat the draft it is replacing. */
export function regenerateDraft(matchId: string) {
  return regenerateFn({ data: { matchId } })
}

const answerFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(matchInput.extend({ answer: z.string().min(1).max(1_000) }))
  .handler(async ({ data, context }) =>
    inWords(async () => {
      const match = await ownMatch(context.user.id, data.matchId)
      if (match.sample) throw new Error("This is a sample conversation, so the AI does not write for it.")
      await addToAboutMe(context.user.id, match.workspaceId, match.askQuestion, data.answer)
      await db.update(dateMatches).set({ flaggedReason: null, askQuestion: "", aiError: "" }).where(eq(dateMatches.id, match.id))
      const outcome = await draftReply(match.id, db, new Date(), {}, { anyTurn: true })
      if (outcome.status !== "done") throw new Error(outcome.words)
    })
  )

/** Answers the AI's question: the answer goes into About me, and the AI drafts again. */
export function answerAiQuestion(matchId: string, answer: string) {
  return answerFn({ data: { matchId, answer } })
}

const clearFlagFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(matchInput)
  .handler(async ({ data, context }) =>
    inWords(async () => {
      const match = await ownMatch(context.user.id, data.matchId)
      await db.update(dateMatches).set({ flaggedReason: null, askQuestion: "", aiError: "" }).where(eq(dateMatches.id, match.id))
    })
  )

/** Lets the AI draft again in a flagged conversation, from the next pass. */
export function letAiDraftAgain(matchId: string) {
  return clearFlagFn({ data: { matchId } })
}

const readAgainFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ profileId: z.string().min(1).max(40) }))
  .handler(async ({ data, context }) =>
    inWords(async () => {
      const card = await ownCard(context.user.id, data.profileId)
      if (card.sample) throw new Error("This is a sample card, so the AI does not read it.")
      const outcome = await scoreCard(card.id, db, new Date(), {}, true)
      if (outcome.status !== "done") throw new Error(outcome.words)
    })
  )

/** The AI reads this card again now. */
export function readCardAgain(profileId: string) {
  return readAgainFn({ data: { profileId } })
}

const reviewFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .handler(async ({ context }) =>
    inWords(async () => {
      const phone = await dashboardPhone(context.user.id, await workspaceIdForRequest(context.user.id))
      const outcome = await reviewOwnProfile(phone.id)
      if (outcome.status !== "done") throw new Error(outcome.words)
    })
  )

/** The AI reviews the member's profile again now. */
export function reviewMyProfile() {
  return reviewFn()
}

const loopFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ run: z.boolean() }))
  .handler(async ({ data, context }) =>
    inWords(async () => {
      const phone = await dashboardPhone(context.user.id, await workspaceIdForRequest(context.user.id))
      if (data.run) await startLoop(context.user.id, phone.id)
      else await stopLoopByHand(context.user.id, phone.id)
    })
  )

/** Start: the AI swipes and drafts with the phone in a pocket, until Stop or a limit. */
export function startSwiping() {
  return loopFn({ data: { run: true } })
}

export function stopSwiping() {
  return loopFn({ data: { run: false } })
}
