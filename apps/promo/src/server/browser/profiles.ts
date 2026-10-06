import { and, asc, desc, eq, inArray, sql } from "drizzle-orm"

import type {
  ProfileEventKind,
  ProfileIdentity,
  ProxyTestResult,
  SessionEndedBy,
  SiteCheckResult,
} from "@/lib/social/options"
import { uuid } from "@/server/auth/security"
import { db as defaultDb, type CustomShellDb } from "@/server/db"

import { DockerRequestError, dockerConnection, dockerRequest, publicDockerError } from "./docker"
import { recordProfileEvent } from "./events"
import {
  promoBrowserSessions,
  promoProfileEvents,
  promoProfileFolders,
  promoProfileLabels,
  promoProfiles,
  promoProxies,
} from "./schema"

/**
 * Browser profiles: one isolated browser each, with its own cookies, identity
 * and proxy. A network account points at one and owns none of it.
 *
 * Everything the Browser profiles dashboard does with them is here. Every
 * query is scoped by the person's id, and that filter is the ownership check:
 * a foreign id finds nothing, changes nothing and is reported as skipped.
 *
 * Opening and closing a profile's browser is not here. That is a job for the
 * browser program, the only program that ever touches a browser.
 */

/** The labels a person starts with, copied from anti-detect. */
const DEFAULT_LABELS = [
  { name: "Ready", color: "emerald" },
  { name: "Warming", color: "amber" },
  { name: "Banned", color: "red" },
] as const

/** Colours a new label cycles through, in order. */
const LABEL_COLORS = ["emerald", "amber", "red", "blue", "violet", "slate"] as const

const MAX_TAGS = 20

export type ProfileInput = {
  name: string
  proxyId: string | null
  notes: string
  folderId: string | null
  labelId: string | null
  tags: string[]
}

/** Trimmed, no empties, unique ignoring case, at most twenty of fifty letters. */
function cleanTags(tags: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of tags) {
    const tag = raw.trim().slice(0, 50)
    if (!tag || seen.has(tag.toLowerCase())) continue
    seen.add(tag.toLowerCase())
    out.push(tag)
    if (out.length >= MAX_TAGS) break
  }
  return out
}

/** Refuses a proxy, folder or label id that is not this person's. */
async function assertOwned(
  userId: string,
  input: Pick<ProfileInput, "proxyId" | "folderId" | "labelId">,
  db: CustomShellDb
): Promise<void> {
  const checks = [
    [input.proxyId, promoProxies, "That proxy does not exist."],
    [input.folderId, promoProfileFolders, "That folder does not exist."],
    [input.labelId, promoProfileLabels, "That label does not exist."],
  ] as const
  for (const [id, table, message] of checks) {
    if (!id) continue
    const [row] = await db
      .select({ id: table.id })
      .from(table)
      .where(and(eq(table.id, id), eq(table.userId, userId)))
      .limit(1)
    if (!row) throw new Error(message)
  }
}

/**
 * Makes a profile with a cookie volume of its own.
 *
 * The volume is named after the profile, so no two profiles can ever share
 * one. The profiles adopted from the first accounts kept the account's name
 * for it instead, which is why the name is stored on the row rather than
 * worked out from the id.
 */
export async function createProfile(
  userId: string,
  input: Partial<ProfileInput> & { name: string },
  db: CustomShellDb = defaultDb
): Promise<string> {
  const full: ProfileInput = {
    proxyId: null,
    notes: "",
    folderId: null,
    labelId: null,
    tags: [],
    ...input,
  }
  await assertOwned(userId, full, db)
  const id = uuid()
  await db.insert(promoProfiles).values({
    id,
    userId,
    name: full.name.trim().slice(0, 120) || "Main",
    proxyId: full.proxyId,
    notes: full.notes.trim().slice(0, 4_000),
    folderId: full.folderId,
    labelId: full.labelId,
    tags: cleanTags(full.tags),
    volumeName: `promo-profile-${id}`,
  })
  return id
}

/**
 * Saves a profile. A change of proxy is written into the profile's history,
 * because an open browser keeps the old one until it is restarted.
 */
export async function updateProfile(
  userId: string,
  profileId: string,
  input: ProfileInput,
  db: CustomShellDb = defaultDb
): Promise<void> {
  await assertOwned(userId, input, db)
  const [before] = await db
    .select({ proxyId: promoProfiles.proxyId })
    .from(promoProfiles)
    .where(and(eq(promoProfiles.id, profileId), eq(promoProfiles.userId, userId)))
    .limit(1)
  if (!before) throw new Error("That browser profile does not exist.")

  await db
    .update(promoProfiles)
    .set({
      name: input.name.trim().slice(0, 120) || "Untitled",
      proxyId: input.proxyId,
      notes: input.notes.trim().slice(0, 4_000),
      folderId: input.folderId,
      labelId: input.labelId,
      tags: cleanTags(input.tags),
      updatedAt: new Date(),
    })
    .where(and(eq(promoProfiles.id, profileId), eq(promoProfiles.userId, userId)))

  if (before.proxyId !== input.proxyId) {
    await recordProfileEvent(
      userId,
      profileId,
      "proxy_changed",
      `${await proxyName(before.proxyId, db)} to ${await proxyName(input.proxyId, db)}`,
      db
    )
  }
}

async function proxyName(proxyId: string | null, db: CustomShellDb): Promise<string> {
  if (!proxyId) return "this computer's own address"
  const [row] = await db
    .select({ label: promoProxies.label, host: promoProxies.host })
    .from(promoProxies)
    .where(eq(promoProxies.id, proxyId))
    .limit(1)
  return row ? row.label || row.host : "a deleted proxy"
}

export type DeleteResult = {
  deleted: string[]
  /** The ones that stayed, by name, with why. */
  kept: Array<{ id: string; name: string; reason: string }>
}

/**
 * Deletes profiles and their cookie volumes, so every sign-in inside them.
 *
 * A profile whose browser is open or opening is kept: removing a volume a
 * browser is writing to would corrupt it, so it has to be closed first. The
 * volume goes before the row. If Docker refuses, the profile is kept and says
 * so, rather than leaving cookies behind with nothing pointing at them.
 *
 * An account that pointed at a deleted profile is left with none, never
 * deleted; the database does that through the foreign key.
 */
export async function deleteProfiles(
  userId: string,
  ids: string[],
  db: CustomShellDb = defaultDb
): Promise<DeleteResult> {
  const result: DeleteResult = { deleted: [], kept: [] }
  if (!ids.length) return result

  const rows = await db
    .select({ id: promoProfiles.id, name: promoProfiles.name, volumeName: promoProfiles.volumeName })
    .from(promoProfiles)
    .where(and(inArray(promoProfiles.id, ids), eq(promoProfiles.userId, userId)))
  const runs = await db
    .select({ profileId: promoBrowserSessions.profileId, status: promoBrowserSessions.status })
    .from(promoBrowserSessions)
    .where(inArray(promoBrowserSessions.profileId, rows.map((row) => row.id)))
  const open = new Set(
    runs
      .filter((run) => run.status === "starting" || run.status === "running")
      .map((run) => run.profileId)
  )
  // The volume is made the first time a browser opens, so a profile that never
  // ran has none and Docker is not asked. Otherwise a profile made by mistake
  // could not be deleted on a machine with no Docker to answer.
  const everOpened = new Set(runs.map((run) => run.profileId))

  for (const row of rows) {
    if (open.has(row.id)) {
      result.kept.push({ id: row.id, name: row.name, reason: "its browser is open" })
      continue
    }
    try {
      if (everOpened.has(row.id)) await removeVolume(row.volumeName)
    } catch (error) {
      result.kept.push({ id: row.id, name: row.name, reason: publicDockerError(error, "remove its cookies").message })
      continue
    }
    await db
      .delete(promoProfiles)
      .where(and(eq(promoProfiles.id, row.id), eq(promoProfiles.userId, userId)))
    result.deleted.push(row.id)
  }
  return result
}

async function removeVolume(name: string): Promise<void> {
  try {
    await dockerRequest(dockerConnection(), "DELETE", `/volumes/${encodeURIComponent(name)}`)
  } catch (error) {
    // Never opened, so never made: nothing to remove.
    if (error instanceof DockerRequestError && error.status === 404) return
    throw error
  }
}

/**
 * A new profile with the same settings: proxy, notes, folder, label and tags.
 *
 * Copied from anti-detect, with its rule. The copy gets its own cookie volume
 * and none of the original's identity, so the two can never look like one
 * browser. Making the new identity is file 04's job; until then a profile
 * without one gets the browser's own fresh one each time it opens, which is
 * what every profile gets today.
 */
export async function duplicateProfile(
  userId: string,
  profileId: string,
  db: CustomShellDb = defaultDb
): Promise<string> {
  const [source] = await db
    .select()
    .from(promoProfiles)
    .where(and(eq(promoProfiles.id, profileId), eq(promoProfiles.userId, userId)))
    .limit(1)
  if (!source) throw new Error("That browser profile does not exist.")

  return createProfile(
    userId,
    {
      name: `${source.name} copy`,
      proxyId: source.proxyId,
      notes: source.notes,
      folderId: source.folderId,
      labelId: source.labelId,
      tags: source.tags,
    },
    db
  )
}

/**
 * Asks for a new identity on the profile's next launch. Deliberate, never a
 * side effect of an edit: the sites it is signed in to will see a different
 * machine. The current identity stays until then, so nothing changes while
 * its browser is open.
 */
export async function requestNewIdentity(
  userId: string,
  profileId: string,
  db: CustomShellDb = defaultDb
): Promise<void> {
  const [profile] = await db
    .select({ fingerprint: promoProfiles.fingerprint })
    .from(promoProfiles)
    .where(and(eq(promoProfiles.id, profileId), eq(promoProfiles.userId, userId)))
    .limit(1)
  if (!profile) throw new Error("That browser profile does not exist.")
  await db
    .update(promoProfiles)
    .set({ fingerprint: { ...profile.fingerprint, renew: true }, updatedAt: new Date() })
    .where(and(eq(promoProfiles.id, profileId), eq(promoProfiles.userId, userId)))
}

/** Whether the profile is this person's. */
export async function ownsProfile(
  userId: string,
  profileId: string,
  db: CustomShellDb = defaultDb
): Promise<boolean> {
  const [row] = await db
    .select({ id: promoProfiles.id })
    .from(promoProfiles)
    .where(and(eq(promoProfiles.id, profileId), eq(promoProfiles.userId, userId)))
    .limit(1)
  return Boolean(row)
}

export type BulkResult = { done: string[]; skipped: string[] }

/** Puts profiles in a folder, or takes them out of any with null. One statement. */
export async function moveProfiles(
  userId: string,
  ids: string[],
  folderId: string | null,
  db: CustomShellDb = defaultDb
): Promise<BulkResult> {
  await assertOwned(userId, { proxyId: null, folderId, labelId: null }, db)
  return bulkUpdate(userId, ids, { folderId }, db)
}

/** Gives profiles a label, or takes it off with null. One statement. */
export async function labelProfiles(
  userId: string,
  ids: string[],
  labelId: string | null,
  db: CustomShellDb = defaultDb
): Promise<BulkResult> {
  await assertOwned(userId, { proxyId: null, folderId: null, labelId }, db)
  return bulkUpdate(userId, ids, { labelId }, db)
}

/**
 * Adds a tag to profiles. One statement, copied from anti-detect: a row that
 * already has it, ignoring case, or already has twenty, is left as it is.
 */
export async function tagProfiles(
  userId: string,
  ids: string[],
  tag: string,
  db: CustomShellDb = defaultDb
): Promise<BulkResult> {
  const [clean] = cleanTags([tag])
  if (!clean) throw new Error("A tag needs a word in it.")
  return bulkUpdate(
    userId,
    ids,
    {
      tags: sql`CASE
        WHEN jsonb_array_length(${promoProfiles.tags}) >= ${MAX_TAGS} THEN ${promoProfiles.tags}
        WHEN EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(${promoProfiles.tags}) AS "existing"
          WHERE lower("existing") = lower(${clean})
        ) THEN ${promoProfiles.tags}
        ELSE ${promoProfiles.tags} || to_jsonb(${clean}::text)
      END`,
    },
    db
  )
}

async function bulkUpdate(
  userId: string,
  ids: string[],
  set: Partial<Record<"folderId" | "labelId", string | null>> | { tags: ReturnType<typeof sql> },
  db: CustomShellDb
): Promise<BulkResult> {
  if (!ids.length) return { done: [], skipped: [] }
  const updated = await db
    .update(promoProfiles)
    .set({ ...set, updatedAt: new Date() })
    .where(and(inArray(promoProfiles.id, ids), eq(promoProfiles.userId, userId)))
    .returning({ id: promoProfiles.id })
  const done = updated.map((row) => row.id)
  return { done, skipped: ids.filter((id) => !done.includes(id)) }
}

export type FolderView = { id: string; name: string }
export type LabelView = { id: string; name: string; color: string }

/** The person's folders and labels, with the three starting labels made on first use. */
export async function listFoldersAndLabels(
  userId: string,
  db: CustomShellDb = defaultDb
): Promise<{ folders: FolderView[]; labels: LabelView[] }> {
  const [anyLabel] = await db
    .select({ id: promoProfileLabels.id })
    .from(promoProfileLabels)
    .where(eq(promoProfileLabels.userId, userId))
    .limit(1)
  if (!anyLabel) {
    await db
      .insert(promoProfileLabels)
      // A millisecond apart, so they list in this order rather than by chance.
      .values(
        DEFAULT_LABELS.map((label, index) => ({
          id: uuid(),
          userId,
          ...label,
          createdAt: new Date(Date.now() + index),
        }))
      )
      .onConflictDoNothing()
  }

  const folders = await db
    .select({ id: promoProfileFolders.id, name: promoProfileFolders.name })
    .from(promoProfileFolders)
    .where(eq(promoProfileFolders.userId, userId))
    .orderBy(asc(promoProfileFolders.name))
  const labels = await db
    .select({ id: promoProfileLabels.id, name: promoProfileLabels.name, color: promoProfileLabels.color })
    .from(promoProfileLabels)
    .where(eq(promoProfileLabels.userId, userId))
    .orderBy(asc(promoProfileLabels.createdAt))
  return { folders, labels }
}

function cleanName(name: string, what: string): string {
  const clean = name.trim().slice(0, 120)
  if (!clean) throw new Error(`A ${what} needs a name.`)
  return clean
}

/** A unique-name refusal, in words. */
function nameTaken(error: unknown, what: string): Error {
  const message = error instanceof Error ? error.message : String(error)
  const cause = error instanceof Error && error.cause instanceof Error ? error.cause.message : ""
  if (`${message} ${cause}`.includes("ux_promo_profile_")) {
    return new Error(`There is already a ${what} with that name.`)
  }
  return error instanceof Error ? error : new Error(message)
}

export async function createFolder(userId: string, name: string, db: CustomShellDb = defaultDb): Promise<string> {
  const id = uuid()
  try {
    await db.insert(promoProfileFolders).values({ id, userId, name: cleanName(name, "folder") })
  } catch (error) {
    throw nameTaken(error, "folder")
  }
  return id
}

export async function renameFolder(userId: string, id: string, name: string, db: CustomShellDb = defaultDb): Promise<void> {
  try {
    await db
      .update(promoProfileFolders)
      .set({ name: cleanName(name, "folder") })
      .where(and(eq(promoProfileFolders.id, id), eq(promoProfileFolders.userId, userId)))
  } catch (error) {
    throw nameTaken(error, "folder")
  }
}

export async function deleteFolder(userId: string, id: string, db: CustomShellDb = defaultDb): Promise<void> {
  await db
    .delete(promoProfileFolders)
    .where(and(eq(promoProfileFolders.id, id), eq(promoProfileFolders.userId, userId)))
}

export async function createLabel(userId: string, name: string, db: CustomShellDb = defaultDb): Promise<string> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(promoProfileLabels)
    .where(eq(promoProfileLabels.userId, userId))
  const id = uuid()
  try {
    await db.insert(promoProfileLabels).values({
      id,
      userId,
      name: cleanName(name, "label"),
      color: LABEL_COLORS[count % LABEL_COLORS.length],
    })
  } catch (error) {
    throw nameTaken(error, "label")
  }
  return id
}

export async function renameLabel(userId: string, id: string, name: string, db: CustomShellDb = defaultDb): Promise<void> {
  try {
    await db
      .update(promoProfileLabels)
      .set({ name: cleanName(name, "label") })
      .where(and(eq(promoProfileLabels.id, id), eq(promoProfileLabels.userId, userId)))
  } catch (error) {
    throw nameTaken(error, "label")
  }
}

export async function deleteLabel(userId: string, id: string, db: CustomShellDb = defaultDb): Promise<void> {
  await db
    .delete(promoProfileLabels)
    .where(and(eq(promoProfileLabels.id, id), eq(promoProfileLabels.userId, userId)))
}

/** One profile as the dashboard shows it, before the accounts inside it are added. */
export type ProfileRecord = {
  id: string
  name: string
  notes: string
  folderId: string | null
  labelId: string | null
  tags: string[]
  proxy: {
    id: string
    label: string
    host: string
    port: number
    country: string
    lastTestedAt: Date | null
    lastTestResult: ProxyTestResult | null
  } | null
  /** Whether its browser is open, opening or not running, from the session row. */
  browser: "open" | "opening" | "stopped"
  /** True when the open browser went out through another proxy than the one now set. */
  onOldProxy: boolean
  /** The country its browser last went out from, or blank when never known. */
  lastCountry: string
  /** Its identity's id and what a page last read through it. Null before its first launch. */
  identity: ProfileIdentity | null
  /** The last "Check what a site sees", or null until one is run. */
  siteCheck: SiteCheckResult | null
  lastRanAt: Date | null
  createdAt: Date
}

/** Every profile the person has, by name. */
export async function listProfiles(
  userId: string,
  db: CustomShellDb = defaultDb
): Promise<ProfileRecord[]> {
  const rows = await db
    .select({ profile: promoProfiles, proxy: promoProxies })
    .from(promoProfiles)
    .leftJoin(promoProxies, eq(promoProxies.id, promoProfiles.proxyId))
    .where(eq(promoProfiles.userId, userId))
    .orderBy(asc(promoProfiles.name))
  if (!rows.length) return []

  // The newest run of each profile, which says both whether it is open now
  // and when it last ran.
  const latest = await db
    .selectDistinctOn([promoBrowserSessions.profileId])
    .from(promoBrowserSessions)
    .where(inArray(promoBrowserSessions.profileId, rows.map((row) => row.profile.id)))
    .orderBy(promoBrowserSessions.profileId, desc(promoBrowserSessions.startedAt))
  const byProfile = new Map(latest.map((run) => [run.profileId, run]))

  return rows.map(({ profile, proxy }) => {
    const run = byProfile.get(profile.id)
    const live = run && (run.status === "starting" || run.status === "running")
    return {
      id: profile.id,
      name: profile.name,
      notes: profile.notes,
      folderId: profile.folderId,
      labelId: profile.labelId,
      tags: profile.tags,
      proxy: proxy
        ? {
            id: proxy.id,
            label: proxy.label,
            host: proxy.host,
            port: proxy.port,
            country: proxy.country,
            lastTestedAt: proxy.lastTestedAt,
            lastTestResult: proxy.lastTestResult,
          }
        : null,
      browser: !live ? "stopped" : run.status === "running" ? "open" : "opening",
      onOldProxy: Boolean(
        live &&
          run.status === "running" &&
          (run.proxyId !== profile.proxyId ||
            (proxy && proxy.updatedAt > run.startedAt))
      ),
      lastCountry: run?.exitCountry ?? "",
      identity: profile.fingerprint,
      siteCheck: profile.siteCheck,
      lastRanAt: run?.startedAt ?? null,
      createdAt: profile.createdAt,
    }
  })
}

export type HistoryEntry =
  | {
      kind: "run"
      id: string
      at: Date
      endedAt: Date | null
      ending: "running" | "opening" | SessionEndedBy | "stopped"
      reason: string
      /** The first run on a different browser image than the run before it. */
      newBuild: boolean
    }
  | { kind: ProfileEventKind; id: string; at: Date; detail: string }

/**
 * Every run of the profile's browser and everything else that happened to it,
 * newest first, at most the last hundred.
 *
 * A run written before the ending was kept has a blank `ended_by`, so it is
 * read from the status and the words: see `legacyEnding`.
 */
export async function profileHistory(
  userId: string,
  profileId: string,
  db: CustomShellDb = defaultDb
): Promise<HistoryEntry[]> {
  const runs = await db
    .select()
    .from(promoBrowserSessions)
    .where(and(eq(promoBrowserSessions.profileId, profileId), eq(promoBrowserSessions.userId, userId)))
    .orderBy(desc(promoBrowserSessions.startedAt))
    .limit(100)
  const events = await db
    .select()
    .from(promoProfileEvents)
    .where(and(eq(promoProfileEvents.profileId, profileId), eq(promoProfileEvents.userId, userId)))
    .orderBy(desc(promoProfileEvents.createdAt))
    .limit(100)

  const entries: HistoryEntry[] = [
    ...runs.map((run, index) => ({
      kind: "run" as const,
      id: run.id,
      at: run.startedAt,
      endedAt: run.endedAt,
      ending:
        run.status === "running"
          ? ("running" as const)
          : run.status === "starting"
            ? ("opening" as const)
            : run.endedBy || legacyEnding(run.status, run.lastError),
      reason: run.lastError,
      // Runs are newest first, so the run before this one is the next in the
      // list. Blank ids are runs from before builds were kept.
      newBuild: Boolean(
        run.imageId && runs[index + 1]?.imageId && runs[index + 1].imageId !== run.imageId
      ),
    })),
    ...events.map((event) => ({
      kind: event.kind,
      id: event.id,
      at: event.createdAt,
      detail: event.detail,
    })),
  ]
  return entries.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 100)
}

/**
 * How a run ended, for a row from before `ended_by` was kept. A death was
 * recorded as an error with the dead-browser check's own words, so those words
 * tell it from a failed start. A stop is a stop: the idle tidy-up and a person
 * closing it wrote the same row.
 */
function legacyEnding(status: string, lastError: string): "dead" | "failed" | "stopped" {
  if (status !== "error") return "stopped"
  return /stopped on its own|container is gone/.test(lastError) ? "dead" : "failed"
}
