import { and, asc, desc, eq, gte, inArray, isNotNull } from "drizzle-orm"

import type { CardFlag, MatchFlag, MessageSender, MessageStatus, SwipeDecision, WalkKind, WalkStatus } from "@/lib/dating/options"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { listPhones, type PhoneView } from "@/server/phone/link"
import { datePhones } from "@/server/phone/schema"
import { hourCounts } from "@/server/tinder/limits"
import {
  dateMatches,
  dateMessages,
  dateOwnProfiles,
  dateProfiles,
  dateWalks,
  type OwnProfileReview,
  type ProfileHandles,
  type ProfileSection,
} from "@/server/tinder/schema"

import { readDatingSettings } from "./settings"
import { monthSpendDollars } from "./spend"

/**
 * What the Dating dashboard draws: the member's phone and its loop, the
 * cards read and the matches, one card or conversation in full, the member's
 * own profile, and the daily tally. Reads only.
 */

export type ProfileListItem = {
  id: string
  name: string
  age: number | null
  photoId: string | null
  score: number | null
  swipe: SwipeDecision
  swipedBy: "member" | "ai" | null
  readAt: Date
  flags: CardFlag[]
  sample: boolean
}

export type MatchListItem = {
  id: string
  theirName: string
  photoId: string | null
  lastLine: string
  lastMessageAt: Date | null
  matchedAt: Date
  unreadCount: number
  hasDraft: boolean
  flagged: MatchFlag | null
  unmatched: boolean
  sample: boolean
}

export type WalkView = {
  id: string
  kind: WalkKind
  status: WalkStatus
  error: string
  askedBy: "member" | "ai"
  createdAt: Date
  finishedAt: Date | null
  /** The card or match the walk is about, when it is about one. */
  profileId: string | null
  matchId: string | null
}

export type DayTally = { day: string; swipes: number; likes: number; matches: number; messages: number; datesProposed: number }

export type DatingDashboard = {
  phone: PhoneView | null
  settings: {
    likeAbove: number
    automate: boolean
    swipesPerHour: number
    messagesPerHour: number
    spendCapDollars: number
    quietStart: number
    quietEnd: number
    timeZone: string
  }
  hour: { swipes: number; messages: number }
  spendDollars: number
  /** The walk on the phone now, and the ones waiting. */
  walks: { current: WalkView | null; waiting: number; recent: WalkView[] }
  profiles: ProfileListItem[]
  matches: MatchListItem[]
  own: OwnProfileView | null
  tally: DayTally[]
  hasSamples: boolean
}

export type OwnProfileView = {
  name: string
  photoIds: string[]
  bio: string
  readAt: Date
  review: OwnProfileReview | null
  reviewMadeAt: Date | null
  aiError: string
}

/** The calendar day a moment falls on in a time zone, as "2099-01-01". */
function dayOf(at: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timeZone || "UTC", year: "numeric", month: "2-digit", day: "2-digit" }).format(at)
  } catch {
    return at.toISOString().slice(0, 10)
  }
}

function walkView(row: typeof dateWalks.$inferSelect): WalkView {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    error: row.error,
    askedBy: row.askedBy,
    createdAt: row.createdAt,
    finishedAt: row.finishedAt,
    profileId: typeof row.input.profileId === "string" ? row.input.profileId : null,
    matchId: typeof row.input.matchId === "string" ? row.input.matchId : null,
  }
}

export async function loadDashboard(
  userId: string,
  workspaceId: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<DatingDashboard> {
  const [phones, settings, spendDollars] = await Promise.all([
    listPhones(userId, workspaceId, db, now),
    readDatingSettings(userId, workspaceId, db),
    monthSpendDollars(userId, db, now),
  ])
  const phone = phones.find((item) => item.paired) ?? phones[0] ?? null
  const mine = and(eq(dateProfiles.userId, userId), eq(dateProfiles.workspaceId, workspaceId))

  const [profileRows, matchRows, ownRow, walkRows, hour] = await Promise.all([
    db.select().from(dateProfiles).where(mine).orderBy(desc(dateProfiles.readAt)).limit(300),
    db
      .select()
      .from(dateMatches)
      .where(and(eq(dateMatches.userId, userId), eq(dateMatches.workspaceId, workspaceId)))
      .orderBy(desc(dateMatches.lastMessageAt), desc(dateMatches.matchedAt))
      .limit(300),
    phone ? db.select().from(dateOwnProfiles).where(eq(dateOwnProfiles.phoneId, phone.id)).limit(1) : Promise.resolve([]),
    phone
      ? db.select().from(dateWalks).where(eq(dateWalks.phoneId, phone.id)).orderBy(desc(dateWalks.createdAt)).limit(20)
      : Promise.resolve([]),
    phone ? hourCounts(phone.id, db, now) : Promise.resolve({ swipes: 0, messages: 0 }),
  ])

  // Each match's last line: the newest message kept, or what the chat list showed.
  const lastLines = new Map(
    (await newestMessages(matchRows.map((match) => match.id), db)).map((message) => [message.matchId, message.text])
  )

  const timeZone = phone?.timeZone ?? ""
  return {
    phone,
    settings: {
      likeAbove: settings.likeAbove,
      automate: settings.automate,
      swipesPerHour: settings.swipesPerHour,
      messagesPerHour: settings.messagesPerHour,
      spendCapDollars: settings.spendCapDollars,
      quietStart: settings.quietStart,
      quietEnd: settings.quietEnd,
      timeZone,
    },
    hour,
    spendDollars,
    walks: {
      current: walkRows.find((walk) => walk.status === "running") ? walkView(walkRows.find((walk) => walk.status === "running")!) : null,
      waiting: walkRows.filter((walk) => walk.status === "waiting").length,
      recent: walkRows.slice(0, 8).map(walkView),
    },
    profiles: profileRows.map((row) => ({
      id: row.id,
      name: row.name,
      age: row.age,
      photoId: row.photoIds[0] ?? null,
      score: row.aiScore,
      swipe: row.swipe,
      swipedBy: row.swipedBy ?? null,
      readAt: row.readAt,
      flags: row.aiFlags,
      sample: row.sample,
    })),
    matches: matchRows.map((row) => ({
      id: row.id,
      theirName: row.theirName,
      photoId: row.photoId,
      lastLine: lastLines.get(row.id) ?? row.lastPreview,
      lastMessageAt: row.lastMessageAt,
      matchedAt: row.matchedAt,
      unreadCount: row.unreadCount,
      hasDraft: row.draft !== "",
      flagged: row.flaggedReason,
      unmatched: row.unmatchedAt !== null,
      sample: row.sample,
    })),
    own: ownRow[0]
      ? {
          name: ownRow[0].name,
          photoIds: ownRow[0].photoIds,
          bio: ownRow[0].bio,
          readAt: ownRow[0].readAt,
          review: ownRow[0].review,
          reviewMadeAt: ownRow[0].reviewMadeAt,
          aiError: ownRow[0].aiError,
        }
      : null,
    tally: await dailyTally(userId, workspaceId, timeZone, db, now),
    hasSamples: profileRows.some((row) => row.sample) || matchRows.some((row) => row.sample),
  }
}

/**
 * Today and the six days before it, on the phone's own calendar: swipes,
 * likes, matches, messages sent and dates proposed. Sample records are left out.
 */
export async function dailyTally(
  userId: string,
  workspaceId: string,
  timeZone: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<DayTally[]> {
  const since = new Date(now.getTime() - 8 * 86_400_000)
  const days: DayTally[] = []
  for (let back = 0; back < 7; back += 1) {
    days.push({ day: dayOf(new Date(now.getTime() - back * 86_400_000), timeZone), swipes: 0, likes: 0, matches: 0, messages: 0, datesProposed: 0 })
  }
  const byDay = new Map(days.map((day) => [day.day, day]))
  const mine = (column: typeof dateProfiles.userId | typeof dateMatches.userId) => eq(column, userId)

  const [swipes, matches, sent] = await Promise.all([
    db
      .select({ at: dateProfiles.swipedAt, swipe: dateProfiles.swipe })
      .from(dateProfiles)
      .where(and(mine(dateProfiles.userId), eq(dateProfiles.workspaceId, workspaceId), eq(dateProfiles.sample, false), gte(dateProfiles.swipedAt, since))),
    db
      .select({ matchedAt: dateMatches.matchedAt, proposedAt: dateMatches.dateProposedAt })
      .from(dateMatches)
      .where(and(mine(dateMatches.userId), eq(dateMatches.workspaceId, workspaceId), eq(dateMatches.sample, false))),
    db
      .select({ at: dateMessages.sentAt })
      .from(dateMessages)
      .innerJoin(dateMatches, eq(dateMatches.id, dateMessages.matchId))
      .where(
        and(
          eq(dateMatches.userId, userId),
          eq(dateMatches.workspaceId, workspaceId),
          eq(dateMatches.sample, false),
          eq(dateMessages.direction, "out"),
          eq(dateMessages.status, "sent"),
          isNotNull(dateMessages.sentAt),
          gte(dateMessages.sentAt, since)
        )
      ),
  ])
  for (const row of swipes) {
    const day = row.at ? byDay.get(dayOf(row.at, timeZone)) : undefined
    if (!day) continue
    day.swipes += 1
    if (row.swipe === "like") day.likes += 1
  }
  for (const row of matches) {
    const matched = byDay.get(dayOf(row.matchedAt, timeZone))
    if (matched) matched.matches += 1
    const proposed = row.proposedAt ? byDay.get(dayOf(row.proposedAt, timeZone)) : undefined
    if (proposed) proposed.datesProposed += 1
  }
  for (const row of sent) {
    const day = row.at ? byDay.get(dayOf(row.at, timeZone)) : undefined
    if (day) day.messages += 1
  }
  return days
}

export type ProfileDetail = {
  id: string
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
  photoIds: string[]
  readAt: Date
  swipe: SwipeDecision
  swipedBy: "member" | "ai" | null
  swipedAt: Date | null
  score: number | null
  read: string[]
  flags: CardFlag[]
  dealbreakers: string[]
  aiError: string
  aiBusy: boolean
  sample: boolean
  /** A like or pass on this card waiting for the phone, or on it now. */
  pendingSwipe: "like" | "pass" | null
}

export async function loadProfileDetail(userId: string, profileId: string, db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<ProfileDetail> {
  const [row] = await db.select().from(dateProfiles).where(and(eq(dateProfiles.id, profileId), eq(dateProfiles.userId, userId))).limit(1)
  if (!row) throw new Error("That card is gone.")
  const pending = row.phoneId
    ? await db
        .select({ kind: dateWalks.kind, input: dateWalks.input })
        .from(dateWalks)
        .where(and(eq(dateWalks.phoneId, row.phoneId), inArray(dateWalks.status, ["waiting", "running"]), inArray(dateWalks.kind, ["like", "pass"])))
    : []
  const swipeWalk = pending.find((walk) => walk.input.profileId === row.id)
  return {
    id: row.id,
    name: row.name,
    age: row.age,
    distance: row.distance,
    verified: row.verified,
    bio: row.bio,
    job: row.job,
    school: row.school,
    livesIn: row.livesIn,
    sections: row.sections,
    handles: row.handles,
    photoIds: row.photoIds,
    readAt: row.readAt,
    swipe: row.swipe,
    swipedBy: row.swipedBy ?? null,
    swipedAt: row.swipedAt,
    score: row.aiScore,
    read: row.aiRead,
    flags: row.aiFlags,
    dealbreakers: row.aiDealbreakers,
    aiError: row.aiError,
    aiBusy: Boolean(row.aiStartedAt && !row.aiReadAt && now.getTime() - row.aiStartedAt.getTime() < 5 * 60_000),
    sample: row.sample,
    pendingSwipe: swipeWalk ? (swipeWalk.kind as "like" | "pass") : null,
  }
}

export type MessageView = {
  id: string
  direction: "in" | "out"
  sentBy: MessageSender
  text: string
  status: MessageStatus
  error: string
  sentAt: Date | null
  createdAt: Date
}

export type MatchDetail = {
  id: string
  theirName: string
  photoId: string | null
  matchedAt: Date
  messages: MessageView[]
  draft: string
  draftMadeAt: Date | null
  draftSendAt: Date | null
  draftProposesDate: boolean
  flagged: MatchFlag | null
  askQuestion: string
  aiError: string
  aiBusy: boolean
  dateProposedAt: Date | null
  unmatchedAt: Date | null
  messagesFromThem: number
  messagesFromUs: number
  sample: boolean
  /** The card this match came from, when Date read it. */
  profile: { id: string; age: number | null; score: number | null; read: string[]; flags: CardFlag[] } | null
  /** Walks for this match waiting for the phone, or on it now. */
  pending: WalkKind[]
}

export async function loadMatchDetail(userId: string, matchId: string, db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<MatchDetail> {
  const [row] = await db.select().from(dateMatches).where(and(eq(dateMatches.id, matchId), eq(dateMatches.userId, userId))).limit(1)
  if (!row) throw new Error("That match is gone.")
  const [messages, profile, pending] = await Promise.all([
    db.select().from(dateMessages).where(eq(dateMessages.matchId, row.id)).orderBy(asc(dateMessages.position)),
    row.profileId ? db.select().from(dateProfiles).where(eq(dateProfiles.id, row.profileId)).limit(1) : Promise.resolve([]),
    row.phoneId
      ? db
          .select({ kind: dateWalks.kind, input: dateWalks.input })
          .from(dateWalks)
          .where(and(eq(dateWalks.phoneId, row.phoneId), inArray(dateWalks.status, ["waiting", "running"])))
      : Promise.resolve([]),
  ])
  const card = profile[0]
  return {
    id: row.id,
    theirName: row.theirName,
    photoId: row.photoId,
    matchedAt: row.matchedAt,
    messages: messages.map((message) => ({
      id: message.id,
      direction: message.direction,
      sentBy: message.sentBy,
      text: message.text,
      status: message.status,
      error: message.error,
      sentAt: message.sentAt,
      createdAt: message.createdAt,
    })),
    draft: row.draft,
    draftMadeAt: row.draftMadeAt,
    draftSendAt: row.draftSendAt,
    draftProposesDate: row.draftProposesDate,
    flagged: row.flaggedReason,
    askQuestion: row.askQuestion,
    aiError: row.aiError,
    aiBusy: Boolean(row.aiStartedAt && now.getTime() - row.aiStartedAt.getTime() < 5 * 60_000 && !row.aiError),
    dateProposedAt: row.dateProposedAt,
    unmatchedAt: row.unmatchedAt,
    messagesFromThem: row.messagesFromThem,
    messagesFromUs: row.messagesFromUs,
    sample: row.sample,
    profile: card ? { id: card.id, age: card.age, score: card.aiScore, read: card.aiRead, flags: card.aiFlags } : null,
    pending: pending.filter((walk) => walk.input.matchId === row.id).map((walk) => walk.kind),
  }
}

/** The newest message of each of these matches, one query for all of them. */
export async function newestMessages(matchIds: string[], db: CustomShellDb = defaultDb) {
  if (!matchIds.length) return []
  return db
    .selectDistinctOn([dateMessages.matchId], {
      matchId: dateMessages.matchId,
      id: dateMessages.id,
      direction: dateMessages.direction,
      status: dateMessages.status,
      text: dateMessages.text,
    })
    .from(dateMessages)
    .where(inArray(dateMessages.matchId, matchIds))
    .orderBy(dateMessages.matchId, desc(dateMessages.position))
}

/** Opening a conversation on the dashboard is reading it: its unread count goes back to none. */
export async function markMatchSeen(userId: string, matchId: string, db: CustomShellDb = defaultDb): Promise<void> {
  await db.update(dateMatches).set({ unreadCount: 0 }).where(and(eq(dateMatches.id, matchId), eq(dateMatches.userId, userId)))
}

/** The member's phone on this site that the dashboard acts on, or a refusal saying how to get one. */
export async function dashboardPhone(userId: string, workspaceId: string, db: CustomShellDb = defaultDb) {
  const [phone] = await db
    .select()
    .from(datePhones)
    .where(and(eq(datePhones.userId, userId), eq(datePhones.workspaceId, workspaceId), isNotNull(datePhones.keyEncrypted)))
    .orderBy(desc(datePhones.pairedAt))
    .limit(1)
  if (!phone) throw new Error("No phone is paired yet. Pair one on the Phone screen first.")
  return phone
}
