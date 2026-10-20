import { and, asc, desc, eq, gte, inArray, isNotNull, sql } from "drizzle-orm"

import { chatTrend, TREND_NEEDS_FROM_THEM, type TrendMessage, type TrendRead } from "@/lib/dating/chat-trend"
import { isLike, type CardFlag, type ChatTrend, type DraftKind, type MatchFlag, type MessageSender, type MessageStatus, type OpenerStyle, type SwipeDecision, type WalkKind, type WalkStatus } from "@/lib/dating/options"
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
  type MatchFact,
  type OwnProfileReview,
  type ProfileHandles,
  type ProfileSection,
} from "@/server/tinder/schema"

import { overruledCards } from "./ai"
import { DATING_MODEL } from "./model"
import { readDatingSettings } from "./settings"
import { monthMatchCost, type MatchCost } from "./spend"

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
  /** Who unmatched, when somebody did. */
  unmatchedBy: "member" | "them" | null
  /** The AI read the chat as over. */
  ended: boolean
  movedToText: boolean
  /** The member took the chat over. */
  aiOff: boolean
  dateAccepted: boolean
  trend: ChatTrend
  sample: boolean
}

/** A chat where they said yes to a drink or coffee: the Dates tab and the Calendar screen. */
export type DateListItem = {
  matchId: string
  theirName: string
  photoId: string | null
  acceptedAt: Date
  acceptedLine: string
  theirNumber: string
  dateAt: Date | null
  datePlace: string
  sample: boolean
}

/** How many openers of one kind went out, and how many got an answer within three days. */
export type OpenerTally = { style: OpenerStyle; sent: number; replied: number }

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

/** How liked cards of one band of scores turned out: matches, and matches that replied. */
export type ScoreBand = { from: number; to: number; likes: number; matches: number; replied: number }

/** Tinder's own distance and ages on the phone, as the last `set-discovery` walk left them. */
export type DiscoveryView =
  | { state: "never" | "owed" | "setting" }
  | { state: "set"; distance: string; ageMin: number; ageMax: number; at: Date | null }
  | { state: "failed"; error: string; at: Date | null }

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
    swipesPerDay: number
    scheduleStart: number | null
    scheduleEnd: number | null
    maxDistanceKm: number
    ageMin: number
    ageMax: number
  }
  hour: { swipes: number; messages: number; swipesToday: number }
  spendDollars: number
  /** This month's spend over this month's matches and agreed dates. */
  matchCost: MatchCost
  /** How many of the member's overruled cards the AI is shown when it scores, up to 10. */
  learningFrom: number
  /** Liked cards by band of 10 points, best first, with how they turned out. */
  bands: ScoreBand[]
  discovery: DiscoveryView
  /** The walk on the phone now, and the ones waiting. */
  walks: { current: WalkView | null; waiting: number; recent: WalkView[] }
  profiles: ProfileListItem[]
  matches: MatchListItem[]
  own: OwnProfileView | null
  tally: DayTally[]
  dates: DateListItem[]
  /** Of the member's last 20 sends that started as the AI's draft, how many went unchanged. */
  drafts: { unchanged: number; of: number }
  openers: OpenerTally[]
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
  const [phones, settings, matchCost] = await Promise.all([
    listPhones(userId, workspaceId, db, now),
    readDatingSettings(userId, workspaceId, db),
    monthMatchCost(userId, db, now),
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
    phone ? hourCounts(phone, db, now) : Promise.resolve({ swipes: 0, messages: 0, swipesToday: 0 }),
  ])

  // Each match's last line: the newest message kept, or what the chat list showed.
  const [newest, trends, drafts, openers, overruled, bands, discovery] = await Promise.all([
    newestMessages(matchRows.map((match) => match.id), db),
    // A chat with fewer messages from them than a trend needs is too early to tell, so its messages are not read.
    trendsFor(matchRows.filter((match) => !match.unmatchedAt && match.messagesFromThem >= TREND_NEEDS_FROM_THEM).map((match) => match.id), db),
    draftsSentUnchanged(userId, db),
    openerTally(userId, workspaceId, db),
    overruledCards(userId, workspaceId, settings, db),
    scoreBands(userId, workspaceId, db),
    phone ? discoveryView(phone.id, db) : Promise.resolve<DiscoveryView>({ state: "never" }),
  ])
  const lastLines = new Map(newest.map((message) => [message.matchId, message.text]))

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
      swipesPerDay: settings.swipesPerDay,
      scheduleStart: settings.scheduleStart,
      scheduleEnd: settings.scheduleEnd,
      maxDistanceKm: settings.maxDistanceKm,
      ageMin: settings.ageMin,
      ageMax: settings.ageMax,
    },
    hour,
    spendDollars: matchCost.dollars,
    matchCost,
    learningFrom: overruled.length,
    bands,
    discovery,
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
      unmatchedBy: row.unmatchedAt ? (row.unmatchedBy ?? "member") : null,
      ended: row.endedAt !== null,
      movedToText: row.movedToTextAt !== null,
      aiOff: row.aiOff,
      dateAccepted: row.dateAcceptedAt !== null,
      trend: trends.get(row.id)?.trend ?? "too_early",
      sample: row.sample,
    })),
    dates: matchRows
      .filter((row) => row.dateAcceptedAt && !row.unmatchedAt)
      .map((row) => dateListItem(row))
      .sort((a, b) => b.acceptedAt.getTime() - a.acceptedAt.getTime()),
    drafts,
    openers,
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
 * What's working (part 9 of "features/02-swiping-and-scoring"): every liked
 * card the AI scored, by band of 10 points, with how many became a match and
 * how many of those matches sent a message. Likes by the member and by the AI
 * both count. A match is tied to its card when the like came back "It's a
 * Match!", or later by name on the chat list. Sample cards are left out.
 */
export async function scoreBands(userId: string, workspaceId: string, db: CustomShellDb = defaultDb): Promise<ScoreBand[]> {
  // Counted in the database, because the dashboard asks every few seconds and the likes only grow. A score of 100 joins the 90s.
  const band = sql<number>`(least(${dateProfiles.aiScore}, 99) / 10) * 10`
  const rows = await db
    .select({
      from: band,
      likes: sql<number>`count(distinct ${dateProfiles.id})::int`,
      matches: sql<number>`count(distinct ${dateMatches.profileId})::int`,
      replied: sql<number>`(count(distinct ${dateMatches.profileId}) filter (where ${dateMatches.messagesFromThem} > 0))::int`,
    })
    .from(dateProfiles)
    .leftJoin(dateMatches, and(eq(dateMatches.profileId, dateProfiles.id), eq(dateMatches.sample, false)))
    .where(
      and(
        eq(dateProfiles.userId, userId),
        eq(dateProfiles.workspaceId, workspaceId),
        eq(dateProfiles.sample, false),
        inArray(dateProfiles.swipe, ["like", "super"]),
        isNotNull(dateProfiles.aiScore)
      )
    )
    .groupBy(band)
    .orderBy(desc(band))
  return rows.map((row) => ({ from: row.from, to: row.from === 90 ? 100 : row.from + 9, likes: row.likes, matches: row.matches, replied: row.replied }))
}

/** Where Tinder's own distance and ages stand on this phone. */
async function discoveryView(phoneId: string, db: CustomShellDb): Promise<DiscoveryView> {
  const [[phone], [last]] = await Promise.all([
    db.select({ owed: datePhones.discoveryOwed }).from(datePhones).where(eq(datePhones.id, phoneId)).limit(1),
    db.select().from(dateWalks).where(and(eq(dateWalks.phoneId, phoneId), eq(dateWalks.kind, "set-discovery"))).orderBy(desc(dateWalks.createdAt)).limit(1),
  ])
  if (last?.status === "waiting" || last?.status === "running") return { state: "setting" }
  if (phone?.owed) return { state: "owed" }
  if (!last || last.status === "cancelled") return { state: "never" }
  if (last.status === "failed") return { state: "failed", error: last.error, at: last.finishedAt }
  const result = last.result ?? {}
  return {
    state: "set",
    distance: typeof result.distance === "string" ? result.distance : "",
    ageMin: Number(result.ageMin ?? 0),
    ageMax: Number(result.ageMax ?? 0),
    at: last.finishedAt,
  }
}

export function dateListItem(row: typeof dateMatches.$inferSelect): DateListItem {
  return {
    matchId: row.id,
    theirName: row.theirName,
    photoId: row.photoId,
    acceptedAt: row.dateAcceptedAt ?? row.updatedAt,
    acceptedLine: row.dateAcceptedLine,
    theirNumber: row.theirNumber,
    dateAt: row.dateAt,
    datePlace: row.datePlace,
    sample: row.sample,
  }
}

/** Each chat's warming or cooling, from its messages. One query for all of them. */
async function trendsFor(matchIds: string[], db: CustomShellDb = defaultDb): Promise<Map<string, TrendRead>> {
  if (!matchIds.length) return new Map()
  const rows = await db
    .select({
      matchId: dateMessages.matchId,
      direction: dateMessages.direction,
      status: dateMessages.status,
      length: sql<number>`length(${dateMessages.text})`,
      at: dateMessages.createdAt,
    })
    .from(dateMessages)
    .where(inArray(dateMessages.matchId, matchIds))
    .orderBy(dateMessages.matchId, asc(dateMessages.position))
  const byMatch = new Map<string, TrendMessage[]>()
  for (const row of rows) {
    if (row.direction === "out" && row.status !== "sent") continue
    const list = byMatch.get(row.matchId) ?? []
    list.push({ direction: row.direction, length: Number(row.length), at: row.at })
    byMatch.set(row.matchId, list)
  }
  return new Map(matchIds.map((id) => [id, chatTrend(byMatch.get(id) ?? [])]))
}

/** How many of the member's last sends, of the ones that began as the AI's draft, went exactly as drafted. */
const READY_TO_AUTOMATE_OF = 20

export async function draftsSentUnchanged(userId: string, db: CustomShellDb = defaultDb): Promise<{ unchanged: number; of: number }> {
  const rows = await db
    .select({ text: dateMessages.text, draftText: dateMessages.draftText })
    .from(dateMessages)
    .innerJoin(dateMatches, eq(dateMatches.id, dateMessages.matchId))
    .where(
      and(
        eq(dateMessages.userId, userId),
        eq(dateMessages.direction, "out"),
        eq(dateMessages.sentBy, "member"),
        eq(dateMessages.status, "sent"),
        isNotNull(dateMessages.draftText),
        eq(dateMatches.sample, false)
      )
    )
    .orderBy(desc(dateMessages.sentAt))
    .limit(READY_TO_AUTOMATE_OF)
  return { unchanged: rows.filter((row) => row.text.trim() === row.draftText?.trim()).length, of: rows.length }
}

/** An opener counts as answered when a message of theirs came within this long. */
const OPENER_REPLY_WITHIN_MS = 3 * 86_400_000

/** Which kinds of first message got an answer within three days. Sample chats are left out. */
export async function openerTally(userId: string, workspaceId: string, db: CustomShellDb = defaultDb): Promise<OpenerTally[]> {
  const openers = await db
    .select({ matchId: dateMessages.matchId, style: dateMessages.openerStyle, position: dateMessages.position, sentAt: dateMessages.sentAt })
    .from(dateMessages)
    .innerJoin(dateMatches, eq(dateMatches.id, dateMessages.matchId))
    .where(
      and(
        eq(dateMatches.userId, userId),
        eq(dateMatches.workspaceId, workspaceId),
        eq(dateMatches.sample, false),
        eq(dateMessages.direction, "out"),
        eq(dateMessages.status, "sent"),
        isNotNull(dateMessages.openerStyle)
      )
    )
  if (!openers.length) return []
  const answers = await db
    .select({ matchId: dateMessages.matchId, position: dateMessages.position, at: dateMessages.createdAt })
    .from(dateMessages)
    .where(and(inArray(dateMessages.matchId, [...new Set(openers.map((row) => row.matchId))]), eq(dateMessages.direction, "in")))
  const tally = new Map<OpenerStyle, OpenerTally>()
  for (const opener of openers) {
    const style = opener.style as OpenerStyle
    const row = tally.get(style) ?? { style, sent: 0, replied: 0 }
    row.sent += 1
    const sent = opener.sentAt?.getTime() ?? 0
    if (answers.some((answer) => answer.matchId === opener.matchId && answer.position > opener.position && answer.at.getTime() - sent <= OPENER_REPLY_WITHIN_MS)) {
      row.replied += 1
    }
    tally.set(style, row)
  }
  return [...tally.values()].sort((a, b) => b.sent - a.sent)
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
    if (isLike(row.swipe)) day.likes += 1
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
  /** A like, Super Like or pass on this card waiting for the phone, or on it now. */
  pendingSwipe: "like" | "super" | "pass" | null
  /** This pass's photos were deleted 30 days after it. */
  photosForgotten: boolean
  /** Opus scored it again after Sonnet's first look, and its score counts. */
  checkedTwice: boolean
}

export async function loadProfileDetail(userId: string, profileId: string, db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<ProfileDetail> {
  const [row] = await db.select().from(dateProfiles).where(and(eq(dateProfiles.id, profileId), eq(dateProfiles.userId, userId))).limit(1)
  if (!row) throw new Error("That card is gone.")
  const pending = row.phoneId
    ? await db
        .select({ kind: dateWalks.kind, input: dateWalks.input })
        .from(dateWalks)
        .where(and(eq(dateWalks.phoneId, row.phoneId), inArray(dateWalks.status, ["waiting", "running"]), inArray(dateWalks.kind, ["like", "super-like", "pass"])))
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
    pendingSwipe: swipeWalk ? (swipeWalk.kind === "super-like" ? "super" : (swipeWalk.kind as "like" | "pass")) : null,
    photosForgotten: row.photosForgottenAt !== null,
    checkedTwice: row.aiModel === DATING_MODEL && row.aiScore !== null && !row.aiFlags.includes("ai_declined"),
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
  draftKind: DraftKind
  /** Two more drafts from "Show 3", to pick from. */
  draftChoices: string[]
  /** What they told the member. Deleted ones are left out. */
  facts: MatchFact[]
  memberNote: string
  aiOff: boolean
  endedAt: Date | null
  endedLine: string
  movedToTextAt: Date | null
  unmatchedBy: "member" | "them" | null
  nudgedAt: Date | null
  dateAcceptedAt: Date | null
  dateAcceptedLine: string
  theirNumber: string
  dateAt: Date | null
  datePlace: string
  briefLines: string[]
  briefMadeAt: Date | null
  trend: TrendRead
  sample: boolean
  /** The card this match came from, when Date read it. */
  profile: { id: string; age: number | null; score: number | null; read: string[]; flags: CardFlag[]; photoIds: string[] } | null
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
    draftKind: row.draftKind,
    draftChoices: row.draftChoices,
    facts: row.facts.filter((fact) => !fact.deleted),
    memberNote: row.memberNote,
    aiOff: row.aiOff,
    endedAt: row.endedAt,
    endedLine: row.endedLine,
    movedToTextAt: row.movedToTextAt,
    unmatchedBy: row.unmatchedAt ? (row.unmatchedBy ?? "member") : null,
    nudgedAt: row.nudgedAt,
    dateAcceptedAt: row.dateAcceptedAt,
    dateAcceptedLine: row.dateAcceptedLine,
    theirNumber: row.theirNumber,
    dateAt: row.dateAt,
    datePlace: row.datePlace,
    briefLines: row.briefLines,
    briefMadeAt: row.briefMadeAt,
    trend: chatTrend(
      messages
        .filter((message) => message.direction === "in" || message.status === "sent")
        .map((message) => ({ direction: message.direction, length: message.text.length, at: message.createdAt }))
    ),
    sample: row.sample,
    profile: card ? { id: card.id, age: card.age, score: card.aiScore, read: card.aiRead, flags: card.aiFlags, photoIds: card.photoIds } : null,
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
      position: dateMessages.position,
      sentAt: dateMessages.sentAt,
      createdAt: dateMessages.createdAt,
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
