import { and, asc, desc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm"

import type { CardSource, MessageSender, OpenerStyle, SwipeDecision } from "@/lib/dating/options"
import { uuid } from "@/server/auth/security"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { hashDistance } from "@/server/phone/pictures"
import { sha256Hex } from "@/server/phone/signing"

import {
  dateMatches,
  dateMessages,
  dateOwnProfiles,
  datePhotoTests,
  dateProfiles,
  type OwnProfileChange,
  type ProfileHandles,
  type ProfileSection,
  type SeenOutcome,
} from "./schema"
import type { Bubble } from "./walks/parse"

/**
 * Writing what the walks read into Date's own records, and the one rule that
 * keeps a message from going out twice.
 */

export type CardRecord = {
  name: string
  age: number | null
  distance: string
  verified: boolean
  bio: string
  job: string
  school: string
  livesIn: string
  sections: ProfileSection[]
  handles: ProfileHandles
  texts: string[]
  photoIds: string[]
  /** The first photo's hash, part of telling the same person read twice apart from somebody new. */
  firstPhotoSha: string
  /** The first photo's look (`averageHash`), to find the same person on the member's other profiles. Empty when no photo was kept. */
  faceHash: string
  /** Facebook Dating's extras (task "facebook/01"). Left out on Tinder. */
  source?: CardSource
  theirComment?: string
  theirCommentOn?: string
  mutualFriends?: number | null
  mutualNames?: string[]
  sharedGroups?: string[]
  instagramPhotoIds?: string[]
}

/** How many of 64 bits two pictures of one person may differ by: a chat picture, or a first photo on two profiles. */
const SAME_FACE_BITS = 12

/** A name as it is compared: no accents, no capitals, no spaces round it. */
export function plainName(name: string): string {
  return name.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase()
}

/**
 * The same person on another of the member's profiles (part 15 of
 * "facebook/01", Tyler's "Mark and follow"): a card of the same name whose
 * first photo looks the same, and what happened there. A chat with messages
 * outranks a match, a match a like, a like a pass. Null when nobody matches.
 */
async function seenElsewhere(
  owner: Pick<RecordOwner, "userId" | "workspaceId" | "accountId">,
  card: { name: string; faceHash: string },
  db: CustomShellDb = defaultDb
): Promise<{ accountId: string; outcome: SeenOutcome } | null> {
  if (!card.faceHash) return null
  const name = plainName(card.name)
  const others = await db
    .select({ id: dateProfiles.id, accountId: dateProfiles.accountId, name: dateProfiles.name, faceHash: dateProfiles.faceHash, swipe: dateProfiles.swipe })
    .from(dateProfiles)
    .where(
      and(
        eq(dateProfiles.userId, owner.userId),
        eq(dateProfiles.workspaceId, owner.workspaceId),
        sql`${dateProfiles.accountId} <> ${owner.accountId}`,
        sql`${dateProfiles.faceHash} <> ''`,
        // Narrowed by name in the database; accents and spacing are compared below.
        sql`lower(trim(${dateProfiles.name})) = ${card.name.trim().toLowerCase()}`,
        eq(dateProfiles.sample, false)
      )
    )
  const same = others.filter((other) => plainName(other.name) === name && hashDistance(other.faceHash, card.faceHash) <= SAME_FACE_BITS)
  if (!same.length) return null
  const chats = await db
    .select({ profileId: dateMatches.profileId, messages: sql<number>`(${dateMatches.messagesFromThem} + ${dateMatches.messagesFromUs})::int` })
    .from(dateMatches)
    .where(inArray(dateMatches.profileId, same.map((other) => other.id)))
  const rank: Record<SeenOutcome, number> = { passed: 1, liked: 2, matched: 3, chatted: 4 }
  let best: { accountId: string; outcome: SeenOutcome } | null = null
  for (const other of same) {
    const chat = chats.find((row) => row.profileId === other.id)
    const outcome: SeenOutcome | null = chat ? (chat.messages > 0 ? "chatted" : "matched") : other.swipe === "pass" ? "passed" : other.swipe === "none" ? null : "liked"
    if (outcome && (!best || rank[outcome] > rank[best.outcome])) best = { accountId: other.accountId, outcome }
  }
  return best
}

/** Whose a record read off the phone is: the member, the site, the phone that read it and the profile it belongs to. */
export type RecordOwner = { userId: string; workspaceId: string; phoneId: string; accountId: string }

/**
 * Saves a card that was read. The same person read again before anyone
 * swiped is the same card, updated; once a card has been swiped, the person
 * coming round again is a new card.
 */
export async function saveCard(
  owner: RecordOwner,
  card: CardRecord,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<string> {
  const fingerprint = sha256Hex(`${card.name.toLowerCase()}|${card.age ?? ""}|${card.firstPhotoSha}`)
  const seen = await seenElsewhere(owner, card, db)
  const values = {
    name: card.name.slice(0, 120),
    age: card.age,
    distance: card.distance.slice(0, 60),
    verified: card.verified,
    bio: card.bio,
    job: card.job,
    school: card.school,
    livesIn: card.livesIn,
    sections: card.sections,
    handles: card.handles,
    texts: card.texts,
    photoIds: card.photoIds,
    fingerprint,
    faceHash: card.faceHash,
    ...(card.source ? { source: card.source } : {}),
    ...(card.theirComment !== undefined ? { theirComment: card.theirComment, theirCommentOn: card.theirCommentOn ?? "" } : {}),
    ...(card.mutualFriends !== undefined ? { mutualFriends: card.mutualFriends } : {}),
    ...(card.mutualNames ? { mutualNames: card.mutualNames } : {}),
    ...(card.sharedGroups ? { sharedGroups: card.sharedGroups } : {}),
    ...(card.instagramPhotoIds ? { instagramPhotoIds: card.instagramPhotoIds } : {}),
    seenOnAccountId: seen?.accountId ?? null,
    seenOnOutcome: seen?.outcome ?? null,
    readAt: now,
    updatedAt: now,
  }
  const [unswiped] = await db
    .select({ id: dateProfiles.id })
    .from(dateProfiles)
    .where(
      and(
        eq(dateProfiles.accountId, owner.accountId),
        eq(dateProfiles.fingerprint, fingerprint),
        eq(dateProfiles.swipe, "none")
      )
    )
    .orderBy(desc(dateProfiles.readAt))
    .limit(1)
  if (unswiped) {
    await db.update(dateProfiles).set(values).where(eq(dateProfiles.id, unswiped.id))
    return unswiped.id
  }
  const id = uuid()
  await db.insert(dateProfiles).values({ id, ...owner, ...values, createdAt: now })
  return id
}

/** Writes a like or a pass on a card, and who made it. */
export async function recordSwipe(
  profileId: string,
  swipe: Exclude<SwipeDecision, "none">,
  by: "member" | "ai",
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  await db.update(dateProfiles).set({ swipe, swipedBy: by, swipedAt: now, updatedAt: now }).where(eq(dateProfiles.id, profileId))
}

/** A like that came back "It's a Match!" becomes a match at once, tied to its card. */
export async function recordMatchFromCard(
  profileId: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<string> {
  const [profile] = await db.select().from(dateProfiles).where(eq(dateProfiles.id, profileId)).limit(1)
  if (!profile) throw new Error("That card is gone.")
  const [existing] = await db.select({ id: dateMatches.id }).from(dateMatches).where(eq(dateMatches.profileId, profileId)).limit(1)
  if (existing) return existing.id
  const id = uuid()
  await db.insert(dateMatches).values({
    id,
    userId: profile.userId,
    workspaceId: profile.workspaceId,
    phoneId: profile.phoneId,
    accountId: profile.accountId,
    profileId,
    theirName: profile.name,
    photoId: profile.photoIds[0] ?? null,
    matchedAt: now,
    createdAt: now,
    updatedAt: now,
  })
  return id
}

export type ListedChat = { name: string; preview: string; avatarHash: string; photoId: string | null; isNew: boolean }

/**
 * The chat list as read: each person is matched to the match already kept by
 * name and picture, or becomes a new match. A last line that changed marks
 * the match to have its conversation read. Returns the matches that need it.
 */
export async function saveChatList(
  owner: RecordOwner,
  chats: ListedChat[],
  db: CustomShellDb = defaultDb,
  now: Date = new Date(),
  /** The read reached the bottom of the list, so a chat not in it is not on Tinder any more. */
  complete = false
): Promise<{ added: number; toRead: string[]; theyUnmatched: string[] }> {
  // A chat marked "they unmatched" is looked for too: one that shows up again
  // was read wrong, and is put back rather than becoming a second match.
  const kept = await db
    .select()
    .from(dateMatches)
    .where(
      and(
        eq(dateMatches.accountId, owner.accountId),
        or(isNull(dateMatches.unmatchedAt), eq(dateMatches.unmatchedBy, "them"))
      )
    )
  let added = 0
  const toRead: string[] = []
  const claimed = new Set<string>()
  for (const chat of chats) {
    const sameName = kept.filter((match) => !claimed.has(match.id) && match.theirName.toLowerCase() === chat.name.toLowerCase())
    const known =
      sameName.find((match) => match.avatarHash && chat.avatarHash && hashDistance(match.avatarHash, chat.avatarHash) <= SAME_FACE_BITS) ??
      // A match made by a like carries no chat picture yet; the first one listed under its name is it.
      sameName.find((match) => !match.avatarHash) ??
      (sameName.length === 1 && !chat.avatarHash ? sameName[0] : undefined)
    if (known) {
      claimed.add(known.id)
      const changed = chat.preview !== "" && chat.preview !== known.lastPreview
      await db
        .update(dateMatches)
        .set({
          ...(known.avatarHash ? {} : { avatarHash: chat.avatarHash }),
          ...(known.photoId || !chat.photoId ? {} : { photoId: chat.photoId }),
          ...(changed ? { lastPreview: chat.preview, needsRead: true } : {}),
          ...(known.missingReads ? { missingReads: 0 } : {}),
          ...(known.unmatchedAt ? { unmatchedAt: null, unmatchedBy: null } : {}),
          updatedAt: now,
        })
        .where(eq(dateMatches.id, known.id))
      if (changed) toRead.push(known.id)
      continue
    }
    const id = uuid()
    // A match that came back later, after a like or a Super Like. Its card is
    // the latest of that name not already tied to a match, if Date read it.
    const [liked] = await db
      .select({ id: dateProfiles.id })
      .from(dateProfiles)
      .where(
        and(
          eq(dateProfiles.accountId, owner.accountId),
          eq(dateProfiles.name, chat.name),
          inArray(dateProfiles.swipe, ["like", "super"]),
          sql`not exists (select 1 from "date_matches" where "date_matches"."profile_id" = ${dateProfiles.id})`
        )
      )
      .orderBy(desc(dateProfiles.swipedAt))
      .limit(1)
    await db.insert(dateMatches).values({
      id,
      ...owner,
      profileId: liked?.id ?? null,
      theirName: chat.name.slice(0, 120),
      photoId: chat.photoId,
      avatarHash: chat.avatarHash,
      matchedAt: now,
      lastPreview: chat.preview,
      needsRead: chat.preview !== "",
      createdAt: now,
      updatedAt: now,
    })
    added += 1
    claimed.add(id)
    if (chat.preview) toRead.push(id)
  }
  const theyUnmatched = complete ? await countMissing(kept.filter((match) => !claimed.has(match.id) && !match.unmatchedAt), db, now) : []
  return { added, toRead, theyUnmatched }
}

/**
 * The app said in the chat that they have gone, such as Facebook Dating's
 * "no longer available" (part 18 of "facebook/01"): they unmatched, marked
 * at once. The two-read rule below stays as the backup.
 */
export async function markTheyLeft(matchId: string, db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<void> {
  await db
    .update(dateMatches)
    .set({ ...NO_DRAFT, unmatchedAt: now, unmatchedBy: "them", updatedAt: now })
    .where(and(eq(dateMatches.id, matchId), isNull(dateMatches.unmatchedAt)))
}

/** Complete reads of the chat list in a row that must miss a chat before it counts as unmatched by them. */
const MISSING_READS_TO_UNMATCH = 2

/**
 * Chats a complete read of the list did not show. Only a chat with messages
 * counts: it sits in the list of conversations, which is read to the bottom,
 * while a new match with none sits in the row across the top, which is not
 * read to its end. Two complete reads in a row without a chat mean they
 * unmatched; one can be a screen read badly. Returns the matches marked.
 */
async function countMissing(missing: Array<typeof dateMatches.$inferSelect>, db: CustomShellDb, now: Date): Promise<string[]> {
  const marked: string[] = []
  for (const match of missing) {
    if (match.sample || match.messagesFromThem + match.messagesFromUs === 0) continue
    const reads = match.missingReads + 1
    const gone = reads >= MISSING_READS_TO_UNMATCH
    await db
      .update(dateMatches)
      .set({
        missingReads: reads,
        ...(gone
          ? { unmatchedAt: now, unmatchedBy: "them" as const, draft: "", draftMadeAt: null, draftSendAt: null, draftForMessageId: null, draftChoices: [] }
          : {}),
        updatedAt: now,
      })
      .where(eq(dateMatches.id, match.id))
    if (gone) marked.push(match.id)
  }
  return marked
}

/** The words' fingerprint for the never-twice rule: the same words, whatever their capitals and spacing. */
export function messageHash(text: string): string {
  return sha256Hex(text.trim().replace(/\s+/g, " ").toLowerCase())
}

/**
 * Lays a conversation as read over the messages kept. Each message read is
 * found among the kept ones in order, or added: theirs as from them, ours as
 * typed by the member on the phone. One of ours waiting to be confirmed is
 * settled here: found means it went, not found means it did not.
 *
 * Returns how many of their messages were new.
 */
export async function saveConversation(
  matchId: string,
  bubbles: Bubble[],
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<{ newFromThem: number }> {
  const [match] = await db.select().from(dateMatches).where(eq(dateMatches.id, matchId)).limit(1)
  if (!match) throw new Error("That match is gone.")
  const kept = await db.select().from(dateMessages).where(eq(dateMessages.matchId, matchId)).orderBy(asc(dateMessages.position))

  const settled = new Map<string, { status: "sent" | "failed"; error?: string }>()
  const order: Array<{ id: string; isNew?: Bubble }> = []
  let pointer = 0
  let firstFound = -1
  for (const bubble of bubbles) {
    let found = -1
    for (let index = pointer; index < kept.length; index += 1) {
      const message = kept[index]
      if (message.direction === bubble.direction && message.text.trim() === bubble.text.trim() && message.status !== "failed") {
        found = index
        break
      }
    }
    if (found >= 0) {
      if (firstFound < 0) firstFound = found
      order.push({ id: kept[found].id })
      if (kept[found].status === "sending" || kept[found].status === "unsure") settled.set(kept[found].id, { status: "sent" })
      pointer = found + 1
    } else {
      order.push({ id: uuid(), isNew: bubble })
    }
  }

  // Kept messages older than the oldest one the phone scrolled back to stay first.
  const placed = new Set(order.map((entry) => entry.id))
  const before = firstFound > 0 ? kept.slice(0, firstFound).filter((message) => !placed.has(message.id)) : []
  // Ours that never showed up after the first one found did not go out. A
  // read that found no messages at all settles nothing: an empty screen is
  // more likely a screen Date could not read, and calling a message that did
  // go out "not sent" would let it be sent again. A message still waiting for
  // its send walk was never typed, so a read that comes first leaves it alone.
  const after = kept.filter((message, index) => !placed.has(message.id) && !before.includes(message) && index >= Math.max(firstFound, 0))
  for (const message of after) {
    if (bubbles.length && message.status === "unsure") {
      settled.set(message.id, { status: "failed", error: "It is not in the conversation on the app, so it was not sent." })
    }
  }
  const final: Array<{ id: string; isNew?: Bubble }> = [
    ...before.map((message) => ({ id: message.id })),
    ...order,
    ...after.map((message) => ({ id: message.id })),
  ]

  let newFromThem = 0
  for (let index = 0; index < final.length; index += 1) {
    const entry = final[index]
    const position = index + 1
    if (entry.isNew) {
      if (entry.isNew.direction === "in") newFromThem += 1
      await db.insert(dateMessages).values({
        id: entry.id,
        userId: match.userId,
        matchId,
        direction: entry.isNew.direction,
        sentBy: entry.isNew.direction === "in" ? "them" : "member",
        kind: entry.isNew.kind ?? "text",
        text: entry.isNew.text,
        hash: messageHash(entry.isNew.text),
        status: "sent",
        position,
        sentAt: now,
        createdAt: now,
      })
      continue
    }
    const change = settled.get(entry.id)
    await db
      .update(dateMessages)
      .set({
        position,
        ...(change ? { status: change.status, error: change.error ?? "", ...(change.status === "sent" ? { sentAt: now } : {}) } : {}),
      })
      .where(eq(dateMessages.id, entry.id))
  }
  await refreshMatchCounts(matchId, { newFromThem }, db, now)
  return { newFromThem }
}

/**
 * Brings a match's counts up to date from its messages: how many each side
 * sent, when the last one was, and whether the draft still answers the newest
 * message. A newer message from them, or a reply already sent, clears it.
 */
export async function refreshMatchCounts(
  matchId: string,
  change: { newFromThem: number },
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  const [match] = await db.select().from(dateMatches).where(eq(dateMatches.id, matchId)).limit(1)
  if (!match) return
  const messages = await db.select().from(dateMessages).where(eq(dateMessages.matchId, matchId)).orderBy(asc(dateMessages.position))
  const counted = messages.filter((message) => message.direction === "in" || message.status === "sent")
  const newest = counted[counted.length - 1]
  // An answer goes stale when anything newer arrives or ours went; a first
  // message once the chat has started; a follow-up once our last message is
  // no longer the newest.
  const draftStale =
    match.draftKind === "opener"
      ? counted.length > 0
      : match.draftKind === "nudge"
        ? !newest || newest.direction !== "out" || match.draftForMessageId !== newest.id
        : !newest || newest.direction === "out" || match.draftForMessageId !== newest.id
  await db
    .update(dateMatches)
    .set({
      messagesFromThem: counted.filter((message) => message.direction === "in").length,
      messagesFromUs: counted.filter((message) => message.direction === "out").length,
      unreadCount: match.unreadCount + change.newFromThem,
      ...(change.newFromThem > 0 ? { lastMessageAt: now } : {}),
      needsRead: false,
      ...(draftStale && match.draft ? NO_DRAFT : {}),
      updatedAt: now,
    })
    .where(eq(dateMatches.id, matchId))
}

/** A match with no draft waiting. */
export const NO_DRAFT = {
  draft: "",
  draftMadeAt: null,
  draftForMessageId: null,
  draftSendAt: null,
  draftProposesDate: false,
  draftChoices: [],
  draftKind: "reply",
  draftOpenerStyle: null,
} satisfies Partial<typeof dateMatches.$inferInsert>

/** What a message of ours carries from the draft it came from. */
export type OutgoingDetails = {
  /** The AI's words suggest meeting up or offer the member's number. */
  proposesDate: boolean
  /** The AI's draft as it stood when Send was pressed, or null when there was none. */
  draftText?: string | null
  /** The kind of first message it is, when it was the AI's opener. */
  openerStyle?: OpenerStyle | null
}

/** How long the same words in the same match are refused after they were sent. */
const NEVER_TWICE_MS = 24 * 60 * 60_000

/**
 * Writes a message of ours, about to go out, before anything is typed on the
 * phone. Refused when the same words went to the same person in the last day,
 * or are on their way now: a message is never tried twice.
 */
export async function createOutgoingMessage(
  matchId: string,
  text: string,
  sentBy: Exclude<MessageSender, "them">,
  details: OutgoingDetails,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<string> {
  const words = text.trim()
  if (!words) throw new Error("Write something to send first.")
  if (words.length > 1_000) throw new Error("That is too long for one message.")
  const [match] = await db.select().from(dateMatches).where(eq(dateMatches.id, matchId)).limit(1)
  if (!match) throw new Error("That match is gone.")
  if (match.unmatchedAt) throw new Error(`You unmatched ${match.theirName}, so nothing can be sent.`)
  const hash = messageHash(words)
  const [twice] = await db
    .select({ status: dateMessages.status })
    .from(dateMessages)
    .where(
      and(
        eq(dateMessages.matchId, matchId),
        eq(dateMessages.hash, hash),
        eq(dateMessages.direction, "out"),
        inArray(dateMessages.status, ["sending", "sent", "unsure"]),
        gt(dateMessages.createdAt, new Date(now.getTime() - NEVER_TWICE_MS))
      )
    )
    .limit(1)
  if (twice) {
    throw new Error(
      twice.status === "sent"
        ? `You already sent ${match.theirName} these exact words today. A message is never sent twice.`
        : `These exact words are already on their way to ${match.theirName}. A message is never sent twice.`
    )
  }
  const [last] = await db
    .select({ position: dateMessages.position })
    .from(dateMessages)
    .where(eq(dateMessages.matchId, matchId))
    .orderBy(desc(dateMessages.position))
    .limit(1)
  const id = uuid()
  await db.insert(dateMessages).values({
    id,
    userId: match.userId,
    matchId,
    direction: "out",
    sentBy,
    text: words,
    hash,
    status: "sending",
    proposesDate: details.proposesDate,
    draftText: details.draftText?.trim() || null,
    openerStyle: details.openerStyle ?? null,
    position: (last?.position ?? 0) + 1,
    createdAt: now,
  })
  // A call they asked for is the member's to answer; once the member writes, the AI may draft again (part 19 of "facebook/01").
  const answeredCall = sentBy === "member" && match.flaggedReason === "asked_for_call"
  await db
    .update(dateMatches)
    .set({ ...NO_DRAFT, ...(answeredCall ? { flaggedReason: null } : {}), updatedAt: now })
    .where(eq(dateMatches.id, matchId))
  return id
}

/** Settles one message of ours after a send walk. */
export async function settleMessage(
  messageId: string,
  status: "sent" | "unsure" | "failed",
  error: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  const [message] = await db
    .update(dateMessages)
    .set({ status, error, ...(status === "sent" ? { sentAt: now } : {}) })
    .where(eq(dateMessages.id, messageId))
    .returning({ matchId: dateMessages.matchId, proposesDate: dateMessages.proposesDate })
  if (!message) return
  if (status === "sent") {
    if (message.proposesDate) {
      await db.update(dateMatches).set({ dateProposedAt: now }).where(and(eq(dateMatches.id, message.matchId), isNull(dateMatches.dateProposedAt)))
    }
    await db.update(dateMatches).set({ lastMessageAt: now }).where(eq(dateMatches.id, message.matchId))
    await refreshMatchCounts(message.matchId, { newFromThem: 0 }, db, now)
  }
}

export type OwnProfileRecord = { name: string; photoIds: string[]; bio: string; sections: ProfileSection[]; texts: string[] }

/**
 * The member's own profile as last read, one per profile. A read the member
 * asked for drops the AI's review of the old one, so the AI looks again. A
 * read that checks a change the phone just made keeps it (`keepReview`), so
 * the card can say the suggestion was applied.
 */
export async function saveOwnProfile(
  owner: RecordOwner,
  profile: OwnProfileRecord,
  db: CustomShellDb = defaultDb,
  now: Date = new Date(),
  keepReview = false
): Promise<void> {
  const values = { ...profile, readAt: now, ...(keepReview ? {} : { review: null, reviewMadeAt: null, aiStartedAt: null }) }
  await db
    .insert(dateOwnProfiles)
    .values({ ...owner, ...values })
    .onConflictDoUpdate({ target: dateOwnProfiles.accountId, set: { ...values, phoneId: owner.phoneId } })
}

export async function readOwnRow(accountId: string, db: CustomShellDb = defaultDb) {
  const [own] = await db.select().from(dateOwnProfiles).where(eq(dateOwnProfiles.accountId, accountId)).limit(1)
  return own ?? null
}

/**
 * What an Apply is about to replace, kept just before the phone saves on
 * Tinder, so Undo is there even when something fails after the save.
 */
export async function keepReplaced(accountId: string, replaced: OwnProfileChange, db: CustomShellDb = defaultDb): Promise<void> {
  await db.update(dateOwnProfiles).set({ before: replaced }).where(eq(dateOwnProfiles.accountId, accountId))
}

/**
 * The phone made a change and read it back. An Apply records the day; an
 * Undo forgets it and what the Apply replaced, so Apply is offered again.
 */
export async function markApplied(accountId: string, key: string, undo: boolean, db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<void> {
  await db
    .update(dateOwnProfiles)
    .set(
      undo
        ? { before: null, appliedAt: sql`${dateOwnProfiles.appliedAt} - ${key}::text` }
        : { appliedAt: sql`${dateOwnProfiles.appliedAt} || jsonb_build_object(${key}::text, ${now.toISOString()}::text)` }
    )
    .where(eq(dateOwnProfiles.accountId, accountId))
}

/** What a first-photo test asked the phone to do with the photo order. */
export type PhotoTestStep = "week" | "winner" | "restore"

/**
 * The phone read a first-photo test's move back: a week's photo is first and
 * its week begins, the winner is first, or the order from before the test is
 * back after Stop.
 */
export async function photoTestMoved(
  accountId: string,
  rowId: string,
  step: PhotoTestStep,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  const mine = and(eq(datePhotoTests.id, rowId), eq(datePhotoTests.accountId, accountId))
  if (step === "week") {
    await db.update(datePhotoTests).set({ startedAt: now, moveError: "" }).where(and(mine, isNull(datePhotoTests.startedAt), isNull(datePhotoTests.stoppedAt)))
  } else if (step === "winner") {
    await db.update(datePhotoTests).set({ putFirstAt: now, moveError: "" }).where(and(mine, isNull(datePhotoTests.stoppedAt)))
  } else {
    const [row] = await db.select({ testId: datePhotoTests.testId }).from(datePhotoTests).where(mine).limit(1)
    if (row) await db.update(datePhotoTests).set({ restoredAt: now, moveError: "" }).where(eq(datePhotoTests.testId, row.testId))
  }
}
