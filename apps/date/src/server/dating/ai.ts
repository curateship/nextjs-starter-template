import { and, asc, desc, eq, isNotNull, isNull, lt, or } from "drizzle-orm"
import sharp from "sharp"

import { STOPPING_FLAGS, type CardFlag, type DraftTone, type MatchFlag, type SwipeDecision } from "@/lib/dating/options"
import type { DatingSettings } from "@/lib/dating/settings"
import { getAiKey } from "@/server/ai/keys"
import { uuid } from "@/server/auth/security"
import { runAiCall } from "@/server/ai/usage"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { pictureBytes } from "@/server/phone/pictures"
import { dateMatches, dateMessages, dateOwnProfiles, dateProfiles } from "@/server/tinder/schema"
import { NO_DRAFT } from "@/server/tinder/store"

import { askClaude, type ClaudeAnswer, type ClaudeQuestion } from "./claude"
import { DATING_MODEL, PHOTO_LONG_EDGE } from "./model"
import { askMatchesAnswer, askMatchesJsonSchema, ASK_MATCHES_SYSTEM, askMatchesText } from "./prompts/ask-matches"
import { chatNotesAnswer, chatNotesJsonSchema, CHAT_NOTES_SYSTEM, chatNotesText, numberTheySent } from "./prompts/chat-notes"
import { dateBriefAnswer, dateBriefJsonSchema, DATE_BRIEF_SYSTEM, dateBriefText } from "./prompts/date-brief"
import {
  draftAnswer,
  draftJsonSchema,
  draftSystem,
  draftText,
  DRAFT_MAX_CHARS,
  usesEmoji,
  withoutEmoji,
  type ConversationForAi,
  type DraftAnswer,
  type DraftMode,
} from "./prompts/draft-reply"
import { readCardAnswer, readCardJsonSchema, readCardSystem, readCardText } from "./prompts/read-card"
import { reviewAnswer, reviewJsonSchema, REVIEW_SYSTEM, reviewText } from "./prompts/review-profile"
import { readDatingSettings } from "./settings"
import { DATING_FEATURE_PREFIX, spendCapReached } from "./spend"

/**
 * Date's AI jobs: reading a card, deciding the swipe, drafting a reply, an
 * opener or a follow-up, tidying the member's own words, reading a chat for
 * notes, the brief before a date, answering a question about the matches, and
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

/** The member's own words learned from: their last sends in other chats that they wrote or changed. */
const LEARNED_SENDS = 10

/** A phone number in a message, which is never kept as an example of the member's voice. */
const PHONE_NUMBER = /\+?\d[\d\s().-]{6,}\d/

/**
 * The member's last messages that were their own words, from other chats:
 * typed on the dashboard with no draft, or a draft they changed before
 * sending. One-word messages and anything with a phone number are left out.
 * Tyler's choice, 18 Oct 2026, part 8 of "features/01-chats-and-replies".
 */
export async function learnedSends(userId: string, exceptMatchId: string | null, db: CustomShellDb): Promise<string[]> {
  const rows = await db
    .select({ text: dateMessages.text, draftText: dateMessages.draftText, matchId: dateMessages.matchId })
    .from(dateMessages)
    .innerJoin(dateMatches, eq(dateMatches.id, dateMessages.matchId))
    .where(
      and(
        eq(dateMessages.userId, userId),
        eq(dateMessages.direction, "out"),
        eq(dateMessages.sentBy, "member"),
        eq(dateMessages.status, "sent"),
        eq(dateMatches.sample, false)
      )
    )
    .orderBy(desc(dateMessages.sentAt))
    .limit(LEARNED_SENDS * 4)
  return rows
    .filter((row) => row.matchId !== exceptMatchId)
    .filter((row) => row.draftText === null || row.draftText.trim() !== row.text.trim())
    .map((row) => row.text.trim())
    .filter((text) => text.split(/\s+/).length > 1 && !PHONE_NUMBER.test(text))
    .slice(0, LEARNED_SENDS)
}

/** What a card said, one line each, for a first message. */
function cardLines(card: typeof dateProfiles.$inferSelect): string[] {
  return [
    card.bio ? `Bio: ${card.bio}` : "",
    card.job ? `Job: ${card.job}` : "",
    card.school ? `School: ${card.school}` : "",
    card.livesIn ? `Lives in: ${card.livesIn}` : "",
    ...card.sections.map((section) => `${section.heading}: ${section.items.join("; ")}`),
    card.handles.anthem ? `Their anthem on Spotify: ${card.handles.anthem}` : "",
    card.handles.spotifyArtists?.length ? `Top Spotify artists: ${card.handles.spotifyArtists.join(", ")}` : "",
  ].filter(Boolean)
}

export type DraftOptions = {
  /** A draft the member asked to replace. */
  notThis?: string
  /** Write even when the newest message is the member's: Regenerate and Draft with AI. */
  anyTurn?: boolean
  /** What to write. Left out, a chat with no messages gets an opener and any other a reply. */
  mode?: Exclude<DraftMode, "tidy">
  tone?: DraftTone | null
  /** Three drafts: the message and two alternatives, for "Show 3". */
  three?: boolean
}

type MatchRow = typeof dateMatches.$inferSelect

/** Why the AI does not write in this chat at all, or null when it may. */
function draftBlockedWords(match: MatchRow): string | null {
  if (match.unmatchedAt) return `${match.theirName} is unmatched, so the AI does not write here.`
  if (match.aiOff) return "You took this chat over, so the AI does not write here. Switch AI drafts back on to let it."
  if (match.movedToTextAt) return "You moved this chat to text, so the AI does not write here."
  if (match.endedAt) return "The AI read this chat as over. Press Not over to let it write here again."
  if (match.flaggedReason && STOPPING_FLAGS.includes(match.flaggedReason)) {
    return "This conversation is flagged for you, so the AI does not draft in it."
  }
  return null
}

/** The chat as the AI is given it. Messages still on their way, or not sent, are left out. */
async function conversationFor(match: MatchRow, db: CustomShellDb) {
  const messages = (await db.select().from(dateMessages).where(eq(dateMessages.matchId, match.id)).orderBy(asc(dateMessages.position))).filter(
    (message) => message.direction === "in" || message.status === "sent"
  )
  const [card] = match.profileId ? await db.select().from(dateProfiles).where(eq(dateProfiles.id, match.profileId)).limit(1) : []
  return { messages, card: card ?? null }
}

function chatForAi(
  match: MatchRow,
  messages: Array<typeof dateMessages.$inferSelect>,
  card: typeof dateProfiles.$inferSelect | null,
  extra: Pick<ConversationForAi, "mode" | "notThis" | "tone" | "three" | "roughText">
): ConversationForAi {
  return {
    theirName: match.theirName,
    theirRead: card?.aiRead ?? [],
    theirCard: card ? cardLines(card) : [],
    facts: match.facts.filter((fact) => !fact.deleted).map((fact) => fact.text),
    memberNote: match.memberNote,
    messages: messages.map((message) => ({ from: message.direction === "in" ? ("them" as const) : ("me" as const), text: message.text })),
    fromThem: messages.filter((message) => message.direction === "in").length,
    fromMe: messages.filter((message) => message.direction === "out").length,
    dateProposed: match.dateProposedAt !== null,
    ...extra,
  }
}

/** A drafted line as it may go out: emoji taken out when the member's examples use none, and empty when too long. */
function cleanDraft(text: string, emojiAllowed: boolean): string {
  const clean = emojiAllowed ? text.trim() : withoutEmoji(text)
  return clean.length <= DRAFT_MAX_CHARS ? clean : ""
}

/**
 * Asks for a draft, and asks once more when the message came back over the
 * length. A refusal, a flag, a question or "the chat is over" comes back as
 * it is.
 */
async function askForDraft(
  match: MatchRow,
  chat: ConversationForAi,
  settings: DatingSettings,
  learned: string[],
  deps: AiDeps
): Promise<{ refused: true } | { refused: false; answer: DraftAnswer }> {
  const emojiAllowed = settings.examples.some(usesEmoji)
  for (let tries = 0; tries < 2; tries += 1) {
    const asked = await metered(
      match.userId,
      "draft-reply",
      { matchId: match.id, mode: chat.mode },
      {
        system: draftSystem(settings, learned),
        text: draftText(chat),
        jsonSchema: draftJsonSchema,
        schema: draftAnswer,
        effort: "medium",
        label: chat.mode === "tidy" ? `Tidying your reply to ${match.theirName}` : `Drafting a reply to ${match.theirName}`,
      },
      deps
    )
    if (asked.refused) return { refused: true }
    const value = asked.value
    if (value.kind !== "draft") return { refused: false, answer: value }
    const text = cleanDraft(value.text, emojiAllowed)
    if (text) {
      const alternatives = value.alternatives.map((line) => cleanDraft(line, emojiAllowed)).filter((line) => line && line !== text)
      return { refused: false, answer: { ...value, text, alternatives } }
    }
    const long = emojiAllowed ? value.text.trim() : withoutEmoji(value.text)
    chat.notThis = `${long} (That was ${long.length} characters. Keep it under ${DRAFT_MAX_CHARS}.)`
  }
  throw new Error(`The AI's draft for ${match.theirName} was longer than ${DRAFT_MAX_CHARS} characters twice.`)
}

/**
 * The AI drafts the next message in one conversation. A chat it must not
 * answer is flagged instead, a fact it does not have becomes a question for
 * the member, and a chat the other person ended is marked over. With the
 * automate switch on, the draft is given a time to go out, 10 to 90 minutes
 * after their message, or after the match for a first message.
 *
 * Regenerate passes the draft it replaces as `notThis`, and asks for a
 * message even when the newest one is the member's (`anyTurn`).
 */
export async function draftReply(
  matchId: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date(),
  deps: AiDeps = {},
  options: DraftOptions = {}
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

  const blocked = draftBlockedWords(match)
  if (blocked) {
    await release({})
    return { status: "skipped", words: blocked }
  }
  const { messages, card } = await conversationFor(match, db)
  const newest = messages[messages.length - 1]
  const mode = options.mode ?? (messages.length ? "reply" : "opener")
  if (mode === "reply" && !options.anyTurn && (!newest || newest.direction !== "in")) {
    await release({})
    return { status: "skipped", words: "Their move: the newest message is yours." }
  }
  if (mode === "opener" && messages.length) {
    await release({})
    return { status: "skipped", words: "This chat has started, so it needs a reply, not a first message." }
  }
  // Regenerate on a follow-up rewrites the one there is; it is never a second.
  if (mode === "nudge" && ((match.nudgedAt && !options.anyTurn) || !newest || newest.direction !== "out")) {
    await release({})
    return { status: "skipped", words: match.nudgedAt ? "This chat already had its one follow-up." : "Their move is not waiting on yours." }
  }

  const settings = await readDatingSettings(match.userId, match.workspaceId, db)
  const cap = await spendCapReached(match.userId, settings.spendCapDollars, db, now)
  if (cap) {
    await release({})
    return { status: "cap", words: cap }
  }
  const learned = settings.learnFromSends ? await learnedSends(match.userId, match.id, db) : []
  const chat = chatForAi(match, messages, card, { mode, notThis, tone: options.tone ?? null, three: Boolean(options.three), roughText: "" })

  try {
    const asked = await askForDraft(match, chat, settings, learned, deps)
    if (asked.refused) {
      await release({ aiError: "The AI would not write a reply to this conversation. Write it yourself." })
      return { status: "failed", words: "The AI would not write a reply to this conversation." }
    }
    const answer = asked.answer

    if (answer.kind === "flag") {
      const flag: MatchFlag = answer.flag === "sexual" ? "sexual" : answer.flag === "scam" ? "scam" : "asked_if_bot"
      await release({ ...NO_DRAFT, flaggedReason: flag, askQuestion: "", aiError: "", updatedAt: now })
      return { status: "done", words: "" }
    }
    if (answer.kind === "ended") {
      const line = answer.endedLine.trim() || [...messages].reverse().find((message) => message.direction === "in")?.text || ""
      await release({ ...NO_DRAFT, endedAt: now, endedLine: line.slice(0, 1_000), askQuestion: "", aiError: "", updatedAt: now })
      return { status: "done", words: "" }
    }
    if (answer.kind === "ask") {
      await release({ ...NO_DRAFT, flaggedReason: "missing_fact", askQuestion: answer.question.trim(), aiError: "", updatedAt: now })
      return { status: "done", words: "" }
    }
    const after = mode === "opener" ? match.matchedAt : mode === "nudge" ? now : (newest?.sentAt ?? newest?.createdAt ?? now)
    const sendAt = new Date(Math.max(now.getTime(), after.getTime() + replyDelayMs(settings)))
    await release({
      draft: answer.text,
      draftChoices: options.three ? answer.alternatives.slice(0, 2) : [],
      draftKind: mode,
      draftOpenerStyle: mode === "opener" ? (answer.openerStyle === "none" ? "other" : answer.openerStyle) : null,
      draftMadeAt: now,
      draftForMessageId: newest?.id ?? null,
      draftProposesDate: answer.proposesDate,
      draftSendAt: settings.automate ? sendAt : null,
      ...(mode === "nudge" ? { nudgedAt: now } : {}),
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

/**
 * Tidy: the member's own rough words, put in their voice with the meaning
 * kept. Nothing is saved; the tidied words go back into the reply box for the
 * member to read before Send.
 */
export async function tidyReply(
  matchId: string,
  rough: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date(),
  deps: AiDeps = {}
): Promise<{ status: AiOutcome["status"]; words: string; text: string }> {
  const words = rough.trim()
  if (!words) return { status: "skipped", words: "Write something first, then Tidy puts it in your voice.", text: "" }
  const [match] = await db.select().from(dateMatches).where(eq(dateMatches.id, matchId)).limit(1)
  if (!match || match.sample) return { status: "skipped", words: "This is a sample conversation, so the AI does not write for it.", text: "" }
  const settings = await readDatingSettings(match.userId, match.workspaceId, db)
  const cap = await spendCapReached(match.userId, settings.spendCapDollars, db, now)
  if (cap) return { status: "cap", words: cap, text: "" }
  const { messages, card } = await conversationFor(match, db)
  const learned = settings.learnFromSends ? await learnedSends(match.userId, match.id, db) : []
  const chat = chatForAi(match, messages, card, { mode: "tidy", notThis: "", tone: null, three: false, roughText: words })
  try {
    const asked = await askForDraft(match, chat, settings, learned, deps)
    if (asked.refused || asked.answer.kind !== "draft") return { status: "failed", words: "The AI would not tidy this. Send it as you wrote it, or change it yourself.", text: "" }
    return { status: "done", words: "", text: asked.answer.text }
  } catch (error) {
    return { status: "failed", words: wordsOf(error), text: "" }
  }
}

/**
 * After new messages from them, the AI reads the chat for what they told the
 * member and, once a date was offered, whether they said yes and sent a
 * number. A fact the member edited is never touched; a deleted one is gone.
 */
export async function readChatNotes(
  matchId: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date(),
  deps: AiDeps = {}
): Promise<AiOutcome> {
  const [match] = await db
    .update(dateMatches)
    .set({ notesStartedAt: now })
    .where(
      and(
        eq(dateMatches.id, matchId),
        eq(dateMatches.sample, false),
        or(isNull(dateMatches.notesStartedAt), lt(dateMatches.notesStartedAt, new Date(now.getTime() - CLAIM_MS)))
      )
    )
    .returning()
  if (!match) return { status: "busy", words: "The AI is already reading this chat." }
  const release = (values: Partial<typeof dateMatches.$inferInsert>) =>
    db.update(dateMatches).set({ notesStartedAt: null, ...values }).where(eq(dateMatches.id, match.id))

  const { messages } = await conversationFor(match, db)
  // Through the newest message kept, sent or not, so one that never went does not bring the chat back every pass.
  const [newest] = await db
    .select({ position: dateMessages.position })
    .from(dateMessages)
    .where(eq(dateMessages.matchId, match.id))
    .orderBy(desc(dateMessages.position))
    .limit(1)
  const through = newest?.position ?? 0
  if (!messages.some((message) => message.direction === "in" && message.position > match.notesReadThrough)) {
    await release({ notesReadThrough: through })
    return { status: "skipped", words: "Nothing new from them to read." }
  }
  const settings = await readDatingSettings(match.userId, match.workspaceId, db)
  const cap = await spendCapReached(match.userId, settings.spendCapDollars, db, now)
  if (cap) {
    await release({})
    return { status: "cap", words: cap }
  }
  try {
    const asked = await metered(
      match.userId,
      "chat-notes",
      { matchId: match.id },
      {
        system: CHAT_NOTES_SYSTEM,
        text: chatNotesText({
          theirName: match.theirName,
          facts: match.facts.map((fact) => fact.text),
          messages: messages.map((message) => ({ from: message.direction === "in" ? ("them" as const) : ("me" as const), text: message.text })),
          dateProposed: match.dateProposedAt !== null,
        }),
        jsonSchema: chatNotesJsonSchema,
        schema: chatNotesAnswer,
        effort: "low",
        label: `Reading ${match.theirName}'s chat for notes`,
      },
      deps
    )
    if (asked.refused) {
      // Nothing to note is not a failure of the chat: it is marked read so it is not asked again.
      await release({ notesReadThrough: through })
      return { status: "done", words: "" }
    }
    const value = asked.value
    const known = new Set(match.facts.map((fact) => fact.text.trim().toLowerCase()))
    const added = value.newFacts
      .map((text) => text.trim())
      .filter((text) => text && !known.has(text.toLowerCase()))
      .map((text) => ({ id: uuid(), text: text.slice(0, 200), edited: false }))
    const theirs = messages.filter((message) => message.direction === "in").map((message) => message.text)
    const number = match.theirNumber || numberTheySent(value.phoneNumber, theirs)
    // A date the member offered in their own words counts too, not only the AI's.
    const offered = match.dateProposedAt !== null || value.memberOffered
    const accepted = !match.dateAcceptedAt && offered && value.dateAccepted
    await release({
      facts: [...match.facts, ...added].slice(0, 40),
      notesReadThrough: through,
      theirNumber: number,
      ...(value.memberOffered && !match.dateProposedAt ? { dateProposedAt: now } : {}),
      ...(accepted ? { dateAcceptedAt: now, dateAcceptedLine: value.acceptedLine.trim().slice(0, 1_000) } : {}),
      updatedAt: now,
    })
    return { status: "done", words: "" }
  } catch (error) {
    // Given up for these messages: the next message from them tries again. A
    // call that failed, perhaps after it was paid for, is never repeated on a loop.
    await release({ notesReadThrough: through })
    return { status: "failed", words: wordsOf(error) }
  }
}

/** The brief before a date: three lines from the chat, picked once the date is agreed. */
export async function makeDateBrief(
  matchId: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date(),
  deps: AiDeps = {}
): Promise<AiOutcome> {
  const [match] = await db
    .update(dateMatches)
    .set({ briefMadeAt: now })
    .where(and(eq(dateMatches.id, matchId), eq(dateMatches.sample, false), isNotNull(dateMatches.dateAcceptedAt), isNull(dateMatches.briefMadeAt)))
    .returning()
  if (!match) return { status: "busy", words: "The brief is already made." }
  const settings = await readDatingSettings(match.userId, match.workspaceId, db)
  const cap = await spendCapReached(match.userId, settings.spendCapDollars, db, now)
  if (cap) {
    await db.update(dateMatches).set({ briefMadeAt: null }).where(eq(dateMatches.id, match.id))
    return { status: "cap", words: cap }
  }
  const { messages } = await conversationFor(match, db)
  try {
    const asked = await metered(
      match.userId,
      "date-brief",
      { matchId: match.id },
      {
        system: DATE_BRIEF_SYSTEM,
        text: dateBriefText({
          theirName: match.theirName,
          messages: messages.map((message) => ({ from: message.direction === "in" ? ("them" as const) : ("me" as const), text: message.text })),
        }),
        jsonSchema: dateBriefJsonSchema,
        schema: dateBriefAnswer,
        effort: "low",
        label: `Making the brief for your date with ${match.theirName}`,
      },
      deps
    )
    const lines = asked.refused ? [] : asked.value.lines.map((line) => line.trim()).filter(Boolean).slice(0, 3)
    await db.update(dateMatches).set({ briefLines: lines, updatedAt: now }).where(eq(dateMatches.id, match.id))
    return { status: "done", words: "" }
  } catch (error) {
    // Left made, with no lines: one try per date, never one per pass. The card still shows the rest.
    return { status: "failed", words: wordsOf(error) }
  }
}

export type MatchAnswer = { matchId: string; theirName: string; why: string }

/** Ask Date: a question about the member's matches, answered from the facts each told them. */
export async function askAboutMatches(
  userId: string,
  workspaceId: string,
  question: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date(),
  deps: AiDeps = {}
): Promise<MatchAnswer[]> {
  const words = question.trim()
  if (!words) throw new Error("Ask something first, such as who said they like hiking.")
  const settings = await readDatingSettings(userId, workspaceId, db)
  const cap = await spendCapReached(userId, settings.spendCapDollars, db, now)
  if (cap) throw new Error(cap)
  const matches = (
    await db
      .select({ id: dateMatches.id, theirName: dateMatches.theirName, facts: dateMatches.facts })
      .from(dateMatches)
      .where(and(eq(dateMatches.userId, userId), eq(dateMatches.workspaceId, workspaceId), eq(dateMatches.sample, false), isNull(dateMatches.unmatchedAt)))
      .orderBy(desc(dateMatches.lastMessageAt))
      .limit(200)
  )
    .map((match) => ({ ...match, facts: match.facts.filter((fact) => !fact.deleted) }))
    .filter((match) => match.facts.length)
  if (!matches.length) throw new Error("None of your matches has told you anything Date has noted yet, so there is nothing to search.")
  const asked = await metered(
    userId,
    "ask-matches",
    { matches: matches.length },
    {
      system: ASK_MATCHES_SYSTEM,
      text: askMatchesText(words, matches.map((match) => ({ name: match.theirName, facts: match.facts.map((fact) => fact.text) }))),
      jsonSchema: askMatchesJsonSchema,
      schema: askMatchesAnswer,
      effort: "low",
      label: "Asking about your matches",
    },
    deps
  )
  if (asked.refused) throw new Error("The AI would not answer that question.")
  const seen = new Set<string>()
  const answers: MatchAnswer[] = []
  for (const answer of asked.value.answers) {
    const match = matches[answer.match - 1]
    if (!match || seen.has(match.id)) continue
    seen.add(match.id)
    answers.push({ matchId: match.id, theirName: match.theirName, why: answer.why.trim() })
  }
  return answers
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
