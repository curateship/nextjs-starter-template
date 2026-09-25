import { randomUUID } from "node:crypto"
import { and, count, desc, eq, gt, isNull, max, ne } from "drizzle-orm"

import {
  HANDLE_HOLD_DAYS,
  LEADERBOARD_MIN_DAYS,
  LEADERBOARD_MIN_TRADES,
  normalizeHandle,
  readProfileInput,
  REPORT_REASON_MAX,
  type LeaderboardRow,
  type MyPublicProfile,
  type PublicProfileInput,
  type PublicProfileView,
} from "@/lib/trade/public-profile/profile"
import { bucketDays } from "@/lib/trade/pnl/day-buckets"
import { enforceRateLimit } from "@/server/auth/rate-limit"
import { db } from "@/server/db"
import { customShellUsers } from "@/server/schema"
import {
  tradePublicHandleHolds,
  tradePublicProfiles,
  tradePublicReports,
} from "@/server/trade/schema"
import {
  checkRecordWallets,
  loadPricedRecord,
  type OwnershipCheck,
  type PricedRecord,
} from "@/server/trade/trade-record"

/**
 * Public trader profiles: the member's own settings, the page at
 * `/t/<handle>`, the leaderboard at `/traders`, reports and the admin's
 * hide switch. Every figure comes from `loadPricedRecord`, so the profile,
 * the leaderboard and the share picture never disagree.
 */

type ProfileRow = typeof tradePublicProfiles.$inferSelect

const DAY_MS = 86_400_000
const PUBLIC_FAILED_NOTE =
  "Trade could not confirm this wallet still belongs to its key."

/**
 * Worked-out profiles, kept briefly so a link shared on X that a thousand
 * people open is one read of the record, not a thousand. Any profile write
 * empties it, so a member never waits a minute to see their own change.
 */
const VIEW_TTL_MS = 60_000
const LEADERBOARD_TTL_MS = 5 * 60_000
const MAX_CACHED_VIEWS = 500

const views = new Map<string, { at: number; view: PublicProfileView | null }>()
let leaderboard: { at: number; rows: LeaderboardRow[] } | null = null

function forgetViews(): void {
  views.clear()
  leaderboard = null
}

/** A profile the public may see: switched on and not hidden by an admin. */
function isPublic(row: ProfileRow): boolean {
  return row.enabled && row.hiddenAt === null
}

/** Old enough and busy enough that one lucky trade cannot top the list. */
function qualifiesForLeaderboard(record: PricedRecord, now: number): boolean {
  return (
    record.recordStart !== null &&
    record.recordStart <= now - LEADERBOARD_MIN_DAYS * DAY_MS &&
    record.figures.closedTrades >= LEADERBOARD_MIN_TRADES
  )
}

export async function loadMyPublicProfile(
  userId: string
): Promise<MyPublicProfile> {
  const [[row], [user], record] = await Promise.all([
    db
      .select()
      .from(tradePublicProfiles)
      .where(eq(tradePublicProfiles.userId, userId)),
    db
      .select({
        name: customShellUsers.name,
        avatarUrl: customShellUsers.avatarUrl,
      })
      .from(customShellUsers)
      .where(eq(customShellUsers.id, userId)),
    loadPricedRecord(userId),
  ])
  return {
    profile: row
      ? {
          handle: row.handle,
          displayName: row.displayName,
          picture: row.picture,
          bio: row.bio,
          links: row.links,
          searchable: row.searchable,
          enabled: row.enabled,
          hiddenAt: row.hiddenAt?.getTime() ?? null,
          hiddenReason: row.hiddenReason,
        }
      : null,
    suggested: {
      displayName: user?.name ?? "",
      picture: user?.avatarUrl ?? null,
    },
    wallets: record.wallets,
  }
}

/**
 * Saves what the member typed. A handle held by somebody else, in use or
 * given up in the last 90 days, is refused. A handle this member gives up is
 * held from everybody else from now.
 */
export async function saveMyPublicProfile(
  userId: string,
  input: PublicProfileInput
): Promise<void> {
  const clean = readProfileInput(input)
  const heldSince = new Date(Date.now() - HANDLE_HOLD_DAYS * DAY_MS)
  const [[existing], [taken], [held]] = await Promise.all([
    db
      .select()
      .from(tradePublicProfiles)
      .where(eq(tradePublicProfiles.userId, userId)),
    db
      .select({ userId: tradePublicProfiles.userId })
      .from(tradePublicProfiles)
      .where(
        and(
          eq(tradePublicProfiles.handle, clean.handle),
          ne(tradePublicProfiles.userId, userId)
        )
      ),
    db
      .select({ userId: tradePublicHandleHolds.userId })
      .from(tradePublicHandleHolds)
      .where(
        and(
          eq(tradePublicHandleHolds.handle, clean.handle),
          ne(tradePublicHandleHolds.userId, userId),
          gt(tradePublicHandleHolds.releasedAt, heldSince)
        )
      ),
  ])
  if (taken) throw new Error("PROFILE_HANDLE_TAKEN")
  if (held) throw new Error("PROFILE_HANDLE_HELD")

  const values = {
    handle: clean.handle,
    displayName: clean.displayName,
    picture: clean.picture,
    bio: clean.bio,
    links: clean.links,
    searchable: clean.searchable,
    updatedAt: new Date(),
  }
  try {
    await db.transaction(async (tx) => {
      if (existing && existing.handle !== clean.handle) {
        await tx
          .insert(tradePublicHandleHolds)
          .values({ handle: existing.handle, userId, releasedAt: new Date() })
          .onConflictDoUpdate({
            target: tradePublicHandleHolds.handle,
            set: { userId, releasedAt: new Date() },
          })
      }
      // Taking one's own old handle back ends its hold.
      await tx
        .delete(tradePublicHandleHolds)
        .where(eq(tradePublicHandleHolds.handle, clean.handle))
      await tx
        .insert(tradePublicProfiles)
        .values({ userId, ...values })
        .onConflictDoUpdate({ target: tradePublicProfiles.userId, set: values })
    })
  } catch (error) {
    // Two people pressing Save on the same handle at once: the unique index
    // lets one through and this is the other.
    const code =
      error && typeof error === "object" && "cause" in error
        ? (error.cause as { code?: string } | undefined)?.code
        : undefined
    if (code === "23505") throw new Error("PROFILE_HANDLE_TAKEN")
    throw error
  }
  forgetViews()
}

/**
 * Switches the page on or off. Switching on checks every wallet's ownership
 * first, so the page never goes public on an unproven wallet. Switching off
 * hides the page and nothing else: the record keeps growing, and switching on
 * again shows the same history.
 */
export async function switchMyPublicProfile(
  userId: string,
  on: boolean,
  describe: (error: unknown) => string
): Promise<OwnershipCheck[]> {
  const [row] = await db
    .select({ userId: tradePublicProfiles.userId })
    .from(tradePublicProfiles)
    .where(eq(tradePublicProfiles.userId, userId))
  if (!row) throw new Error("PROFILE_NOT_SAVED")
  const checks = on ? await checkRecordWallets(userId, describe) : []
  await db
    .update(tradePublicProfiles)
    .set({ enabled: on, updatedAt: new Date() })
    .where(eq(tradePublicProfiles.userId, userId))
  forgetViews()
  return checks
}

export async function checkMyWallets(
  userId: string,
  describe: (error: unknown) => string
): Promise<OwnershipCheck[]> {
  const checks = await checkRecordWallets(userId, describe)
  forgetViews()
  return checks
}

async function buildView(
  row: ProfileRow,
  now: number
): Promise<PublicProfileView> {
  const [[user], record] = await Promise.all([
    db
      .select({ createdAt: customShellUsers.createdAt })
      .from(customShellUsers)
      .where(eq(customShellUsers.id, row.userId)),
    loadPricedRecord(row.userId, now),
  ])
  return {
    handle: row.handle,
    displayName: row.displayName,
    picture: row.picture,
    bio: row.bio,
    links: row.links,
    joinedAt: user?.createdAt.getTime() ?? row.createdAt.getTime(),
    recordStart: record.recordStart,
    // The detailed refusal is for the member. It can name the address a key
    // really opens, which a visitor has no need to see.
    wallets: record.wallets.map((wallet) =>
      wallet.check === "failed"
        ? { ...wallet, checkNote: PUBLIC_FAILED_NOTE }
        : wallet
    ),
    figures: record.figures,
    days: [
      ...bucketDays(
        record.days,
        record.closedAt.map((closedAt) => ({ closedAt })),
        -Infinity
      ).values(),
    ],
    openPositions: record.openPositions,
    onLeaderboard: qualifiesForLeaderboard(record, now),
    searchable: row.searchable,
    readAt: now,
  }
}

/** The page at `/t/<handle>`, or null for no such public profile. */
export async function loadPublicProfileView(
  handle: string,
  now = Date.now()
): Promise<PublicProfileView | null> {
  const key = normalizeHandle(handle)
  const cached = views.get(key)
  if (cached && now - cached.at < VIEW_TTL_MS) return cached.view

  const [row] = await db
    .select()
    .from(tradePublicProfiles)
    .where(eq(tradePublicProfiles.handle, key))
  const view = row && isPublic(row) ? await buildView(row, now) : null
  if (views.size >= MAX_CACHED_VIEWS) views.clear()
  views.set(key, { at: now, view })
  return view
}

/**
 * Every public profile past the minimums, with all three periods' dollars,
 * so the page sorts and filters without asking again.
 */
export async function loadLeaderboard(
  now = Date.now()
): Promise<LeaderboardRow[]> {
  if (leaderboard && now - leaderboard.at < LEADERBOARD_TTL_MS) {
    return leaderboard.rows
  }
  const rows = await db
    .select()
    .from(tradePublicProfiles)
    .where(
      and(
        eq(tradePublicProfiles.enabled, true),
        isNull(tradePublicProfiles.hiddenAt)
      )
    )
  const ranked: LeaderboardRow[] = []
  for (const row of rows) {
    const record = await loadPricedRecord(row.userId, now)
    if (!qualifiesForLeaderboard(record, now)) continue
    const counted = record.wallets.filter((one) => one.check !== "failed")
    ranked.push({
      handle: row.handle,
      displayName: row.displayName,
      picture: row.picture,
      made: {
        "7d": record.figures.made["7d"].money,
        "30d": record.figures.made["30d"].money,
        all: record.figures.made.all.money,
      },
      wonPer100: record.figures.wonPer100,
      closedTrades: record.figures.closedTrades,
      venues: [...new Set(counted.map((one) => one.venue))],
      protocols: [...new Set(counted.map((one) => one.protocol))],
    })
  }
  ranked.sort((left, right) => right.made["30d"] - left.made["30d"])
  leaderboard = { at: now, rows: ranked }
  return ranked
}

/** The addresses the sitemap lists: public profiles that asked to be. */
export async function listSearchableProfilePaths(): Promise<
  { path: string; updatedAt: Date }[]
> {
  const rows = await db
    .select({
      handle: tradePublicProfiles.handle,
      updatedAt: tradePublicProfiles.updatedAt,
    })
    .from(tradePublicProfiles)
    .where(
      and(
        eq(tradePublicProfiles.enabled, true),
        eq(tradePublicProfiles.searchable, true),
        isNull(tradePublicProfiles.hiddenAt)
      )
    )
  return rows.map((row) => ({
    path: `/t/${row.handle}`,
    updatedAt: row.updatedAt,
  }))
}

/**
 * Files a report about a public profile. Counted before the profile is looked
 * up, so the form is not a free way to ask whether a handle exists.
 */
export async function reportPublicProfile(
  handle: string,
  reason: string,
  requestAddress: string
): Promise<void> {
  const text = reason.trim()
  if (!text) throw new Error("REPORT_REASON_REQUIRED")
  if (text.length > REPORT_REASON_MAX) throw new Error("REPORT_REASON_LONG")
  await enforceRateLimit(`trade-profile-report:${requestAddress}`, {
    maxAttempts: 5,
    windowSeconds: 3_600,
  })
  const [row] = await db
    .select()
    .from(tradePublicProfiles)
    .where(eq(tradePublicProfiles.handle, normalizeHandle(handle)))
  if (!row || !isPublic(row)) throw new Error("PROFILE_NOT_FOUND")
  await db
    .insert(tradePublicReports)
    .values({ id: randomUUID(), userId: row.userId, reason: text })
}

export type AdminProfileRow = {
  userId: string
  handle: string
  displayName: string
  email: string
  enabled: boolean
  hiddenAt: number | null
  hiddenReason: string | null
  reports: number
  lastReportAt: number | null
  lastReport: string | null
  updatedAt: number
}

/** Every saved profile, public or not, newest change first, with its reports. */
export async function listProfilesForAdmin(): Promise<AdminProfileRow[]> {
  const [rows, reportCounts, latest] = await Promise.all([
    db
      .select({
        profile: tradePublicProfiles,
        email: customShellUsers.email,
      })
      .from(tradePublicProfiles)
      .innerJoin(
        customShellUsers,
        eq(customShellUsers.id, tradePublicProfiles.userId)
      )
      .orderBy(desc(tradePublicProfiles.updatedAt)),
    db
      .select({
        userId: tradePublicReports.userId,
        reports: count(),
        lastAt: max(tradePublicReports.createdAt),
      })
      .from(tradePublicReports)
      .groupBy(tradePublicReports.userId),
    db
      .selectDistinctOn([tradePublicReports.userId], {
        userId: tradePublicReports.userId,
        reason: tradePublicReports.reason,
      })
      .from(tradePublicReports)
      .orderBy(tradePublicReports.userId, desc(tradePublicReports.createdAt)),
  ])
  const countBy = new Map(reportCounts.map((row) => [row.userId, row]))
  const latestBy = new Map(latest.map((row) => [row.userId, row.reason]))
  return rows.map(({ profile, email }) => ({
    userId: profile.userId,
    handle: profile.handle,
    displayName: profile.displayName,
    email,
    enabled: profile.enabled,
    hiddenAt: profile.hiddenAt?.getTime() ?? null,
    hiddenReason: profile.hiddenReason,
    reports: countBy.get(profile.userId)?.reports ?? 0,
    lastReportAt: countBy.get(profile.userId)?.lastAt?.getTime() ?? null,
    lastReport: latestBy.get(profile.userId) ?? null,
    updatedAt: profile.updatedAt.getTime(),
  }))
}

/**
 * Hides a profile from the public and the leaderboard, with a reason the
 * member reads in their own Public profile window. The record is untouched;
 * a null reason shows it again.
 */
export async function setProfileHidden(
  userId: string,
  reason: string | null
): Promise<void> {
  const text = reason?.trim() ?? null
  if (text !== null && !text) throw new Error("PROFILE_HIDE_REASON_REQUIRED")
  const updated = await db
    .update(tradePublicProfiles)
    .set({
      hiddenAt: text === null ? null : new Date(),
      hiddenReason: text,
      updatedAt: new Date(),
    })
    .where(eq(tradePublicProfiles.userId, userId))
    .returning({ userId: tradePublicProfiles.userId })
  if (updated.length === 0) throw new Error("PROFILE_NOT_FOUND")
  forgetViews()
}
