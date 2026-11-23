import { and, desc, eq, ne } from "drizzle-orm"

import type { WalkKind } from "@/lib/dating/options"
import { findNode } from "@/server/tinder/screen"
import { dateMatches, dateWalks } from "@/server/tinder/schema"
import { NO_DRAFT } from "@/server/tinder/store"
import { confirmUnmatch, matchFor, openConversation, readConversation, readMatches, sendMessage, unmatch } from "@/server/tinder/walks/chat"
import { labelChecker } from "@/server/tinder/walks/check"
import { StopScreenError, WalkError, type WalkContext, type WalkKit, type WalkRunner } from "@/server/tinder/walks/kit"
import { readChatList } from "@/server/tinder/walks/parse"

import { FACEBOOK_WORDS, onSuggested, outOfSuggestions } from "../screen-words"
import { facebookSwipe, openDating, readFacebookCard } from "./card"
import { setFacebookBreak, setFacebookDiscovery } from "./settings"

/**
 * Facebook Dating's walks (task "facebook/01-facebook-dating"). The chat
 * walks are Tinder's, run with Facebook's words (`kit.app`); each starts by
 * opening Dating, which takes the weekly surprise match first when Facebook
 * shows one. Facebook Dating has no Super Like, and Date does not change
 * your own Facebook Dating profile (left out on 22 Oct 2026), so those walks
 * are not here and are refused for a Facebook profile.
 */

/** Opens Dating first, so the weekly match is taken before a chat walk opens the Matches tab. */
function inDating(walk: WalkRunner): WalkRunner {
  return async (ctx, kit, input, askedBy) => {
    await openDating(ctx, kit)
    return walk(ctx, kit, input, askedBy)
  }
}

/**
 * Whose Facebook is signed in (part 1): Facebook is closed and opened again,
 * so it starts on its feed and the way into Dating passes its menu, where the
 * member's own name is. A different name from the last time this profile
 * read one stops the profile, because the phone is signed in to someone
 * else's Facebook. Run on Resume too.
 */
async function whoIsSignedIn(ctx: WalkContext, kit: WalkKit): Promise<Record<string, unknown>> {
  await kit.closeApp()
  await openDating(ctx, kit)
  const name = kit.noticed("signedInAs") ?? ""
  const [last] = await ctx.db
    .select({ result: dateWalks.result })
    .from(dateWalks)
    .where(and(eq(dateWalks.accountId, ctx.phone.accountId), eq(dateWalks.kind, "who-is-signed-in"), eq(dateWalks.status, "done"), ne(dateWalks.id, ctx.walkId)))
    .orderBy(desc(dateWalks.finishedAt))
    .limit(1)
  const before = typeof last?.result?.name === "string" ? last.result.name : ""
  if (name && before && name.toLowerCase() !== before.toLowerCase()) {
    throw new StopScreenError("not_signed_in", `Facebook is signed in as ${name} now, not ${before}.`, kit.lastSeen?.shot ?? null)
  }
  return { signedIn: true, name }
}

/**
 * Reports a match to Facebook as a scam, then unmatches (part 20, Tyler's
 * "Report and unmatch"). Only ever asked for by the member's press, after a
 * confirm, on a chat Date flagged as a scam.
 */
async function reportScam(ctx: WalkContext, kit: WalkKit, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const match = await matchFor(ctx, input)
  if (match.flaggedReason !== "scam") throw new WalkError(`${match.theirName}'s chat is not flagged as a scam, so nothing was reported.`)
  await openDating(ctx, kit)
  const opened = await openConversation(kit, match)
  const menu = await kit.tap(kit.need(opened, FACEBOOK_WORDS.chatMenu, "the conversation's menu"), 900)
  let seen = await kit.tap(kit.need(menu, FACEBOOK_WORDS.report, "Report in the menu"), 1_000)
  const reason = kit.need(seen, FACEBOOK_WORDS.reportScam, "the scam reason")
  // Written before anything that may send the report, so a report that went is never offered or sent again.
  const now = ctx.now()
  await ctx.db.update(dateMatches).set({ reportedAt: now, updatedAt: now }).where(eq(dateMatches.id, match.id))
  seen = await kit.commit(reason, 1_000)
  for (let steps = 0; steps < 3 && !kit.has(seen, FACEBOOK_WORDS.reportDone); steps += 1) {
    const send = kit.find(seen, FACEBOOK_WORDS.reportSend)
    if (!send) break
    seen = await kit.commit(send, 1_200)
  }
  if (!kit.has(seen, FACEBOOK_WORDS.reportDone)) {
    throw new WalkError(`Facebook did not say the report on ${match.theirName} went through. It may have; check the chat on the phone. Nothing was unmatched.`, seen.shot)
  }
  // Facebook offers to unmatch after a report; otherwise the conversation's own menu does it.
  if (!kit.has(seen, FACEBOOK_WORDS.unmatch)) {
    const again = await openConversation(kit, match)
    seen = await kit.tap(kit.need(again, FACEBOOK_WORDS.chatMenu, "the conversation's menu"), 900)
  }
  await confirmUnmatch(kit, seen, match.theirName)
  await ctx.db
    .update(dateMatches)
    .set({ ...NO_DRAFT, unmatchedAt: now, unmatchedBy: "member", updatedAt: now })
    .where(eq(dateMatches.id, match.id))
  return { matchId: match.id, reported: true, unmatched: true }
}

/**
 * The check after Facebook updates (part 7): Suggested's Like and Pass and
 * Dating's tabs, the Matches tab's headings, and a conversation's message
 * box, Send and menu, only looked at.
 */
async function checkFacebookLabels(ctx: WalkContext, kit: WalkKit, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const checker = labelChecker(typeof input.version === "string" ? input.version : "")
  const checked: string[] = []
  let seen = await openDating(ctx, kit)
  const suggested = kit.find(seen, FACEBOOK_WORDS.tabSuggested)
  if (suggested && !onSuggested(seen.screen)) seen = await kit.tap(suggested, 1_000)
  checker.look({ seen, needs: [["Suggested tab", FACEBOOK_WORDS.tabSuggested], ["Likes tab", FACEBOOK_WORDS.tabLikes], ["Matches tab", FACEBOOK_WORDS.tabChat]] })
  if (!outOfSuggestions(seen.screen)) {
    checker.look({ seen, needs: [["Like button", FACEBOOK_WORDS.like], ["Pass button", FACEBOOK_WORDS.pass]] })
    checked.push("suggested")
  }
  const tab = kit.find(seen, FACEBOOK_WORDS.tabChat)
  if (tab) {
    const list = await kit.tap(tab, 1_000)
    if (!findNode(list.screen, FACEBOOK_WORDS.messagesHeading) && !findNode(list.screen, FACEBOOK_WORDS.newMatchesHeading)) checker.unreached("Matches headings", list)
    checked.push("matches")
    const row = readChatList(list.screen, kit.app).find((item) => !item.isNew)
    if (row) {
      const chat = await kit.tap(row.node, 1_000)
      checker.look({ seen: chat, needs: [["Message box", FACEBOOK_WORDS.messageInput], ["Send button", FACEBOOK_WORDS.send], ["Conversation menu", FACEBOOK_WORDS.chatMenu]] })
      checked.push("a conversation")
      await kit.back(700)
    }
  }
  return checker.finish(checked)
}

export const FACEBOOK_WALKS: Partial<Record<WalkKind, WalkRunner>> = {
  "who-is-signed-in": whoIsSignedIn,
  "read-card": (ctx, kit, input) => readFacebookCard(ctx, kit, input),
  like: (ctx, kit, input, askedBy) => facebookSwipe(ctx, kit, "like", input, askedBy),
  pass: (ctx, kit, input, askedBy) => facebookSwipe(ctx, kit, "pass", input, askedBy),
  "read-matches": inDating((ctx, kit) => readMatches(ctx, kit)),
  "read-conversation": inDating((ctx, kit, input) => readConversation(ctx, kit, input)),
  "send-message": inDating((ctx, kit, input) => sendMessage(ctx, kit, input)),
  unmatch: inDating((ctx, kit, input) => unmatch(ctx, kit, input)),
  "set-discovery": (ctx, kit, input) => setFacebookDiscovery(ctx, kit, input),
  "check-labels": (ctx, kit, input) => checkFacebookLabels(ctx, kit, input),
  report: (ctx, kit, input) => reportScam(ctx, kit, input),
  "set-break": (ctx, kit, input) => setFacebookBreak(ctx, kit, input),
}
