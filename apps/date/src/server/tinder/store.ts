import { and, asc, desc, eq, gt, inArray, isNull } from "drizzle-orm"

import type { MessageSender, SwipeDecision } from "@/lib/dating/options"
import { uuid } from "@/server/auth/security"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { hashDistance } from "@/server/phone/pictures"
import { sha256Hex } from "@/server/phone/signing"

import { dateMatches, dateMessages, dateOwnProfiles, dateProfiles, type ProfileHandles, type ProfileSection } from "./schema"
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
}

/**
 * Saves a card that was read. The same person read again before anyone
 * swiped is the same card, updated; once a card has been swiped, the person
 * coming round again is a new card.
 */
export async function saveCard(
  owner: { userId: string; workspaceId: string; phoneId: string },
  card: CardRecord,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<string> {
  const fingerprint = sha256Hex(`${card.name.toLowerCase()}|${card.age ?? ""}|${card.firstPhotoSha}`)
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
    readAt: now,
    updatedAt: now,
  }
  const [unswiped] = await db
    .select({ id: dateProfiles.id })
    .from(dateProfiles)
    .where(
      and(
        eq(dateProfiles.userId, owner.userId),
        eq(dateProfiles.phoneId, owner.phoneId),
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

/** How many of 64 bits two of one person's chat pictures may differ by. */
const SAME_FACE_BITS = 12

/**
 * The chat list as read: each person is matched to the match already kept by
 * name and picture, or becomes a new match. A last line that changed marks
 * the match to have its conversation read. Returns the matches that need it.
 */
export async function saveChatList(
  owner: { userId: string; workspaceId: string; phoneId: string },
  chats: ListedChat[],
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<{ added: number; toRead: string[] }> {
  const kept = await db
    .select()
    .from(dateMatches)
    .where(and(eq(dateMatches.userId, owner.userId), eq(dateMatches.phoneId, owner.phoneId), isNull(dateMatches.unmatchedAt)))
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
          updatedAt: now,
        })
        .where(eq(dateMatches.id, known.id))
      if (changed) toRead.push(known.id)
      continue
    }
    const id = uuid()
    // A match that came back later, after a like. Its card is the latest like of that name, if Date read it.
    const [liked] = await db
      .select({ id: dateProfiles.id })
      .from(dateProfiles)
      .where(
        and(
          eq(dateProfiles.userId, owner.userId),
          eq(dateProfiles.phoneId, owner.phoneId),
          eq(dateProfiles.name, chat.name),
          eq(dateProfiles.swipe, "like")
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
  return { added, toRead }
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
  // go out "not sent" would let it be sent again.
  const after = kept.filter((message, index) => !placed.has(message.id) && !before.includes(message) && index >= Math.max(firstFound, 0))
  for (const message of after) {
    if (bubbles.length && (message.status === "sending" || message.status === "unsure")) {
      settled.set(message.id, { status: "failed", error: "It is not in the conversation on Tinder, so it was not sent." })
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
  const draftStale = !newest || newest.direction === "out" || match.draftForMessageId !== newest.id
  await db
    .update(dateMatches)
    .set({
      messagesFromThem: counted.filter((message) => message.direction === "in").length,
      messagesFromUs: counted.filter((message) => message.direction === "out").length,
      unreadCount: match.unreadCount + change.newFromThem,
      ...(change.newFromThem > 0 ? { lastMessageAt: now } : {}),
      needsRead: false,
      ...(draftStale && match.draft ? { draft: "", draftMadeAt: null, draftForMessageId: null, draftSendAt: null, draftProposesDate: false } : {}),
      updatedAt: now,
    })
    .where(eq(dateMatches.id, matchId))
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
  proposesDate: boolean,
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
    proposesDate,
    position: (last?.position ?? 0) + 1,
    createdAt: now,
  })
  await db
    .update(dateMatches)
    .set({ draft: "", draftMadeAt: null, draftForMessageId: null, draftSendAt: null, draftProposesDate: false, updatedAt: now })
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

/** The member's own profile as last read, one per phone. The AI's review of the old one goes with it. */
export async function saveOwnProfile(
  owner: { userId: string; workspaceId: string; phoneId: string },
  profile: OwnProfileRecord,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  const values = { ...profile, readAt: now, review: null, reviewMadeAt: null, aiStartedAt: null }
  await db
    .insert(dateOwnProfiles)
    .values({ ...owner, ...values })
    .onConflictDoUpdate({ target: dateOwnProfiles.phoneId, set: values })
}
