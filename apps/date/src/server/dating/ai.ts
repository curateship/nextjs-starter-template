import { and, asc, eq, isNull, lt, or } from "drizzle-orm"
import sharp from "sharp"

import type { CardFlag, MatchFlag, SwipeDecision } from "@/lib/dating/options"
import type { DatingSettings } from "@/lib/dating/settings"
import { getAiKey } from "@/server/ai/keys"
import { runAiCall } from "@/server/ai/usage"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { pictureBytes } from "@/server/phone/pictures"
import { dateMatches, dateMessages, dateOwnProfiles, dateProfiles } from "@/server/tinder/schema"

import { askClaude, type ClaudeAnswer, type ClaudeQuestion } from "./claude"
import { DATING_MODEL, PHOTO_LONG_EDGE } from "./model"
import { draftAnswer, draftJsonSchema, draftSystem, draftText, DRAFT_MAX_CHARS, usesEmoji, withoutEmoji, type DraftAnswer } from "./prompts/draft-reply"
import { readCardAnswer, readCardJsonSchema, readCardSystem, readCardText } from "./prompts/read-card"
import { reviewAnswer, reviewJsonSchema, REVIEW_SYSTEM, reviewText } from "./prompts/review-profile"
import { readDatingSettings } from "./settings"
import { DATING_FEATURE_PREFIX, spendCapReached } from "./spend"

/**
 * Date's AI jobs: reading a card, deciding the swipe, drafting a reply and
 * reviewing the member's own profile. Each is one call to Claude through the
 * shell's usage meter, checked against the member's monthly spend cap first.
 *
 * Each job claims its record before it calls, so two passes, or a pass and a
 * button press, never pay for the same card twice. A claim older than five
 * minutes belonged to a call that never finished, and can be taken again.
 */

/** Asks Claude one question. The real one uses the stored Anthropic key; tests pass their own. */
export type AiAsk = <T>(question: Omit<ClaudeQuestion<T>, "apiKey" | "model">) => Promise<ClaudeAnswer<T>>

export type AiDeps = { ask?: AiAsk }

const CLAIM_MS = 5 * 60_000

async function askWithStoredKey<T>(question: Omit<ClaudeQuestion<T>, "apiKey" | "model">): Promise<ClaudeAnswer<T>> {
  const apiKey = await getAiKey("anthropic")
  if (!apiKey) throw new Error("No Anthropic key is set. Add one in Settings → AI.")
  return askClaude({ ...question, apiKey, model: DATING_MODEL })
}

/** One call through the shell's meter, so it shows on the AI usage screen and counts toward the cap. */
async function metered<T>(
  userId: string,
  job: string,
  metadata: Record<string, unknown>,
  question: Omit<ClaudeQuestion<T>, "apiKey" | "model">,
  deps: AiDeps
): Promise<ClaudeAnswer<T>> {
  const ask = deps.ask ?? askWithStoredKey
  return runAiCall({ userId, provider: "anthropic", model: DATING_MODEL, feature: `${DATING_FEATURE_PREFIX}${job}`, metadata }, async () => {
    const answer = await ask(question)
    return { result: answer, usage: { inputTokens: answer.inputTokens, outputTokens: answer.outputTokens } }
  })
}

/** A photo, shrunk for the AI. A photo no longer kept is left out. */
async function photosForAi(userId: string, ids: string[], db: CustomShellDb): Promise<Buffer[]> {
  const photos: Buffer[] = []
  for (const id of ids) {
    const bytes = await pictureBytes(userId, id, db)
    if (!bytes) continue
    photos.push(
      await sharp(bytes)
        .resize(PHOTO_LONG_EDGE, PHOTO_LONG_EDGE, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer()
    )
  }
  return photos
}

export type AiOutcome = { status: "done" | "busy" | "cap" | "failed" | "skipped"; words: string }

function wordsOf(error: unknown): string {
  return error instanceof Error ? error.message : "The AI could not be reached."
}

/** The flags a card shows by itself, without the AI. */
export function cardOwnFlags(
  card: { bio: string; photoIds: string[]; age: number | null },
  settings: Pick<DatingSettings, "ageMin" | "ageMax">
): CardFlag[] {
  const flags: CardFlag[] = []
  if (!card.bio.trim()) flags.push("no_bio")
  if (card.photoIds.length === 1) flags.push("one_photo")
  if (card.age !== null && (card.age < settings.ageMin || card.age > settings.ageMax)) flags.push("outside_age_range")
  return flags
}

/**
 * The AI reads one card: score, three lines and flags, saved on the card.
 * `force` reads a card again that was already read, for Read again.
 */
export async function scoreCard(
  profileId: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date(),
  deps: AiDeps = {},
  force = false
): Promise<AiOutcome> {
  const [card] = await db
    .update(dateProfiles)
    .set({ aiStartedAt: now })
    .where(
      and(
        eq(dateProfiles.id, profileId),
        eq(dateProfiles.sample, false),
        or(isNull(dateProfiles.aiStartedAt), lt(dateProfiles.aiStartedAt, new Date(now.getTime() - CLAIM_MS))),
        ...(force ? [] : [isNull(dateProfiles.aiReadAt)])
      )
    )
    .returning()
  if (!card) return { status: "busy", words: "The AI is already reading this card, or has." }

  const settings = await readDatingSettings(card.userId, card.workspaceId, db)
  const release = (words: string, retryAfterClaim: boolean) =>
    db
      .update(dateProfiles)
      .set({ aiError: words, aiStartedAt: retryAfterClaim ? now : null })
      .where(eq(dateProfiles.id, card.id))

  // The cap is a pause, not a failure of this card: it is released without an
  // error, so it is read once the month turns over or the cap is raised.
  const cap = await spendCapReached(card.userId, settings.spendCapDollars, db, now)
  if (cap) {
    await release("", false)
    return { status: "cap", words: cap }
  }

  try {
    const photos = await photosForAi(card.userId, card.photoIds, db)
    const answer = await metered(
      card.userId,
      "read-card",
      { profileId: card.id },
      {
        system: readCardSystem(settings),
        text: readCardText({ ...card, photos: photos.length }),
        images: photos.map((jpeg) => ({ jpeg })),
        jsonSchema: readCardJsonSchema,
        schema: readCardAnswer,
        effort: "low",
        label: `Reading ${card.name}'s card`,
      },
      deps
    )
    const own = cardOwnFlags(card, settings)
    if (answer.refused) {
      await db
        .update(dateProfiles)
        .set({
          aiScore: 0,
          aiRead: ["The AI would not read this card."],
          aiFlags: [...own, "ai_declined"],
          aiDealbreakers: [],
          aiReadAt: now,
          aiError: "",
          aiStartedAt: null,
        })
        .where(eq(dateProfiles.id, card.id))
      return { status: "done", words: "The AI would not read this card." }
    }
    const dealbreakers = answer.value.dealbreakers.map((line) => line.trim()).filter(Boolean)
    await db
      .update(dateProfiles)
      .set({
        aiScore: answer.value.score,
        aiRead: answer.value.read.slice(0, 3),
        aiFlags: [...own, ...answer.value.flags, ...(dealbreakers.length ? (["dealbreaker"] as const) : [])],
        aiDealbreakers: dealbreakers,
        aiReadAt: now,
        aiError: "",
        aiStartedAt: null,
      })
      .where(eq(dateProfiles.id, card.id))
    return { status: "done", words: "" }
  } catch (error) {
    const words = wordsOf(error)
    await release(words, true)
    return { status: "failed", words }
  }
}

/**
 * Like or pass, from the score and the member's rule. No AI call: a score at
 * or above the member's number is a like, below is a pass, and a card that
 * hits a dealbreaker is always a pass. A card the AI has not read has no
 * decision yet.
 */
export function decideSwipe(
  card: { aiScore: number | null; aiFlags: CardFlag[] },
  settings: Pick<DatingSettings, "likeAbove">
): Exclude<SwipeDecision, "none"> | null {
  if (card.aiFlags.includes("dealbreaker")) return "pass"
  if (card.aiScore === null) return null
  return card.aiScore >= settings.likeAbove ? "like" : "pass"
}

/** A random number of minutes between the two, for when an automated reply goes out. */
function replyDelayMs(settings: Pick<DatingSettings, "replyDelayMin" | "replyDelayMax">): number {
  const minutes = settings.replyDelayMin + Math.random() * (settings.replyDelayMax - settings.replyDelayMin)
  return Math.round(minutes * 60_000)
}

/**
 * The AI drafts the next message in one conversation. A chat it must not
 * answer is flagged instead, and a fact it does not have becomes a question
 * for the member. With the automate switch on, the draft is given a time to
 * go out, 10 to 90 minutes after their message.
 *
 * Regenerate passes the draft it replaces as `notThis`, and asks for a
 * message even when the newest one is the member's (`anyTurn`).
 */
export async function draftReply(
  matchId: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date(),
  deps: AiDeps = {},
  options: { notThis?: string; anyTurn?: boolean } = {}
): Promise<AiOutcome> {
  const notThis = options.notThis?.trim() ?? ""
  const [match] = await db
    .update(dateMatches)
    .set({ aiStartedAt: now })
    .where(
      and(
        eq(dateMatches.id, matchId),
        eq(dateMatches.sample, false),
        isNull(dateMatches.unmatchedAt),
        or(isNull(dateMatches.aiStartedAt), lt(dateMatches.aiStartedAt, new Date(now.getTime() - CLAIM_MS)))
      )
    )
    .returning()
  if (!match) return { status: "busy", words: "The AI is already writing for this conversation." }
  const release = (values: Partial<typeof dateMatches.$inferInsert>) =>
    db.update(dateMatches).set({ aiStartedAt: null, ...values }).where(eq(dateMatches.id, match.id))

  if (match.flaggedReason === "asked_if_bot" || match.flaggedReason === "sexual") {
    await release({})
    return { status: "skipped", words: "This conversation is flagged for you, so the AI does not draft in it." }
  }
  const messages = (await db.select().from(dateMessages).where(eq(dateMessages.matchId, match.id)).orderBy(asc(dateMessages.position))).filter(
    (message) => message.direction === "in" || message.status === "sent"
  )
  const newest = messages[messages.length - 1]
  if (!options.anyTurn && (!newest || newest.direction !== "in")) {
    await release({})
    return { status: "skipped", words: "Their move: the newest message is yours." }
  }

  const settings = await readDatingSettings(match.userId, match.workspaceId, db)
  const cap = await spendCapReached(match.userId, settings.spendCapDollars, db, now)
  if (cap) {
    await release({})
    return { status: "cap", words: cap }
  }
  const [card] = match.profileId
    ? await db.select({ aiRead: dateProfiles.aiRead }).from(dateProfiles).where(eq(dateProfiles.id, match.profileId)).limit(1)
    : []

  const chat = {
    theirName: match.theirName,
    theirRead: card?.aiRead ?? [],
    messages: messages.map((message) => ({ from: message.direction === "in" ? ("them" as const) : ("me" as const), text: message.text })),
    fromThem: messages.filter((message) => message.direction === "in").length,
    fromMe: messages.filter((message) => message.direction === "out").length,
    dateProposed: match.dateProposedAt !== null,
    notThis,
  }
  const emojiAllowed = settings.examples.some(usesEmoji)

  try {
    let answer: DraftAnswer | null = null
    for (let tries = 0; tries < 2 && !answer; tries += 1) {
      const asked = await metered(
        match.userId,
        "draft-reply",
        { matchId: match.id },
        {
          system: draftSystem(settings),
          text: draftText(chat),
          jsonSchema: draftJsonSchema,
          schema: draftAnswer,
          effort: "medium",
          label: `Drafting a reply to ${match.theirName}`,
        },
        deps
      )
      if (asked.refused) {
        await release({ aiError: "The AI would not write a reply to this conversation. Write it yourself." })
        return { status: "failed", words: "The AI would not write a reply to this conversation." }
      }
      const value = asked.value
      if (value.kind === "draft") {
        const text = emojiAllowed ? value.text.trim() : withoutEmoji(value.text)
        if (text.length <= DRAFT_MAX_CHARS && text) {
          answer = { ...value, text }
        } else {
          chat.notThis = `${text} (That was ${text.length} characters. Keep it under ${DRAFT_MAX_CHARS}.)`
        }
      } else {
        answer = value
      }
    }
    if (!answer) throw new Error(`The AI's draft for ${match.theirName} was longer than ${DRAFT_MAX_CHARS} characters twice.`)

    if (answer.kind === "flag") {
      const flag: MatchFlag = answer.flag === "sexual" ? "sexual" : "asked_if_bot"
      await release({ flaggedReason: flag, askQuestion: "", draft: "", draftMadeAt: null, draftSendAt: null, aiError: "", updatedAt: now })
      return { status: "done", words: "" }
    }
    if (answer.kind === "ask") {
      await release({
        flaggedReason: "missing_fact",
        askQuestion: answer.question.trim(),
        draft: "",
        draftMadeAt: null,
        draftSendAt: null,
        aiError: "",
        updatedAt: now,
      })
      return { status: "done", words: "" }
    }
    const after = newest?.sentAt ?? newest?.createdAt ?? now
    const sendAt = new Date(Math.max(now.getTime(), after.getTime() + replyDelayMs(settings)))
    await release({
      draft: answer.text,
      draftMadeAt: now,
      draftForMessageId: newest?.id ?? null,
      draftProposesDate: answer.proposesDate,
      draftSendAt: settings.automate ? sendAt : null,
      flaggedReason: null,
      askQuestion: "",
      aiError: "",
      updatedAt: now,
    })
    return { status: "done", words: "" }
  } catch (error) {
    const words = wordsOf(error)
    await db.update(dateMatches).set({ aiError: words, aiStartedAt: now }).where(eq(dateMatches.id, match.id))
    return { status: "failed", words }
  }
}

/** The AI's suggestions for the member's own profile, saved with it. Suggestions only. */
export async function reviewOwnProfile(
  phoneId: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date(),
  deps: AiDeps = {}
): Promise<AiOutcome> {
  const [own] = await db
    .update(dateOwnProfiles)
    .set({ aiStartedAt: now })
    .where(
      and(
        eq(dateOwnProfiles.phoneId, phoneId),
        or(isNull(dateOwnProfiles.aiStartedAt), lt(dateOwnProfiles.aiStartedAt, new Date(now.getTime() - CLAIM_MS)))
      )
    )
    .returning()
  if (!own) return { status: "busy", words: "The AI is already looking at your profile." }
  const settings = await readDatingSettings(own.userId, own.workspaceId, db)
  const cap = await spendCapReached(own.userId, settings.spendCapDollars, db, now)
  if (cap) {
    await db.update(dateOwnProfiles).set({ aiStartedAt: null }).where(eq(dateOwnProfiles.phoneId, phoneId))
    return { status: "cap", words: cap }
  }
  try {
    const photos = await photosForAi(own.userId, own.photoIds, db)
    const answer = await metered(
      own.userId,
      "review-profile",
      { phoneId },
      {
        system: REVIEW_SYSTEM,
        text: reviewText({ ...own, photos: photos.length }),
        images: photos.map((jpeg) => ({ jpeg })),
        jsonSchema: reviewJsonSchema,
        schema: reviewAnswer,
        effort: "medium",
        label: "Reviewing your profile",
      },
      deps
    )
    if (answer.refused) throw new Error("The AI would not review this profile.")
    await db
      .update(dateOwnProfiles)
      .set({ review: answer.value, reviewMadeAt: now, aiError: "", aiStartedAt: null })
      .where(eq(dateOwnProfiles.phoneId, phoneId))
    return { status: "done", words: "" }
  } catch (error) {
    const words = wordsOf(error)
    await db.update(dateOwnProfiles).set({ aiError: words, aiStartedAt: now }).where(eq(dateOwnProfiles.phoneId, phoneId))
    return { status: "failed", words }
  }
}
