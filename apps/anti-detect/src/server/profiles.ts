import { and, desc, eq, inArray, sql } from "drizzle-orm"

import { db, type Db } from "@/server/db"
import {
  coerceFingerprint,
  generateFingerprint,
  randomSeed,
  type Fingerprint,
  type ProxyGeo,
} from "@/server/fingerprint"
import {
  profileFolders,
  profileStatuses,
  profiles,
  proxies,
  type Profile,
  type ProfileFolderRow,
  type ProfileStatusRow,
} from "@/server/schema"
import { now, uuid } from "@/server/security"

export type ProfileEngine = "camoufox" | "chromium"
export type ProfileStatus = "stopped" | "starting" | "running" | "error"
export type ProfileOs = "windows" | "macos" | "linux"

export type ProfileInput = {
  name: string
  engine: ProfileEngine
  proxyId?: string | null
  os?: ProfileOs
  notes?: string | null
  // The fingerprint is derived from this seed (so the dialog preview == what's
  // saved). Omitted on API calls → a fresh random seed (create) or the existing
  // one (update).
  fingerprintSeed?: number | null
  // Organization.
  folderId?: string | null
  statusId?: string | null
  tags?: string[]
}

// Workflow-status color tokens, cycled in creation order. The dashboard maps each
// token to literal Tailwind classes (dynamic class names can't be JIT-compiled).
const STATUS_COLORS = [
  "emerald",
  "amber",
  "red",
  "blue",
  "violet",
  "pink",
  "cyan",
  "slate",
] as const

const DEFAULT_STATUSES: ReadonlyArray<{ name: string; color: string }> = [
  { name: "Ready", color: "emerald" },
  { name: "Warming", color: "amber" },
  { name: "Banned", color: "red" },
]

// Trim, drop empties, de-dupe (case-insensitive), and cap length/count.
function normalizeTags(tags: string[] | null | undefined): string[] {
  if (!Array.isArray(tags)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of tags) {
    if (typeof raw !== "string") continue
    const tag = raw.trim().slice(0, 50)
    if (!tag) continue
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(tag)
    if (out.length >= 20) break
  }
  return out
}

// Verify a referenced proxy belongs to this user AND return its exit geo (country
// + tested timezone) so the fingerprint can be matched to it. Throws if the proxy
// isn't the caller's — otherwise a caller could attach another user's proxy by id.
async function getOwnedProxyGeo(
  userId: string,
  proxyId: string,
  database: Db
): Promise<ProxyGeo> {
  const [proxy] = await database
    .select({
      id: proxies.id,
      country: proxies.country,
      lastTestResult: proxies.lastTestResult,
    })
    .from(proxies)
    .where(and(eq(proxies.id, proxyId), eq(proxies.userId, userId)))
    .limit(1)
  if (!proxy) throw new Error("Proxy not found")

  // The proxy test stores an IANA timezone in last_test_result — prefer it.
  const result =
    proxy.lastTestResult &&
    typeof proxy.lastTestResult === "object" &&
    !Array.isArray(proxy.lastTestResult)
      ? (proxy.lastTestResult as Record<string, unknown>)
      : {}
  return {
    country: proxy.country,
    timezone: typeof result.timezone === "string" ? result.timezone : null,
  }
}

// Ownership guards for referenced folders/statuses — same pattern as proxies.
async function assertFolderOwned(
  userId: string,
  folderId: string,
  database: Db
) {
  const [row] = await database
    .select({ id: profileFolders.id })
    .from(profileFolders)
    .where(and(eq(profileFolders.id, folderId), eq(profileFolders.userId, userId)))
    .limit(1)
  if (!row) throw new Error("Folder not found")
}

async function assertStatusOwned(
  userId: string,
  statusId: string,
  database: Db
) {
  const [row] = await database
    .select({ id: profileStatuses.id })
    .from(profileStatuses)
    .where(
      and(eq(profileStatuses.id, statusId), eq(profileStatuses.userId, userId))
    )
    .limit(1)
  if (!row) throw new Error("Status not found")
}

function readOs(fingerprint: unknown, fallback: ProfileOs = "windows"): ProfileOs {
  if (fingerprint && typeof fingerprint === "object" && !Array.isArray(fingerprint)) {
    const os = (fingerprint as Record<string, unknown>).os
    if (os === "windows" || os === "macos" || os === "linux") return os
  }
  return fallback
}

function readSeed(fingerprint: unknown): number | undefined {
  if (fingerprint && typeof fingerprint === "object" && !Array.isArray(fingerprint)) {
    const seed = (fingerprint as Record<string, unknown>).seed
    if (typeof seed === "number") return seed
  }
  return undefined
}

export async function listUserProfiles(
  userId: string,
  database: Db = db
) {
  return database
    .select()
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .orderBy(desc(profiles.createdAt))
}

export async function createUserProfile(
  userId: string,
  input: ProfileInput,
  database: Db = db
) {
  const name = input.name.trim()
  if (!name) throw new Error("Profile name is required")

  const os = input.os ?? "windows"
  const proxyGeo = input.proxyId
    ? await getOwnedProxyGeo(userId, input.proxyId, database)
    : undefined
  if (input.folderId) await assertFolderOwned(userId, input.folderId, database)
  if (input.statusId) await assertStatusOwned(userId, input.statusId, database)
  const fingerprint = generateFingerprint({
    os,
    engine: input.engine,
    proxyGeo,
    seed: input.fingerprintSeed ?? randomSeed(),
  })

  const createdAt = now()
  const [profile] = await database
    .insert(profiles)
    .values({
      id: uuid(),
      userId,
      name: name.slice(0, 255),
      status: "stopped",
      engine: input.engine,
      proxyId: input.proxyId ?? null,
      folderId: input.folderId ?? null,
      statusId: input.statusId ?? null,
      tags: normalizeTags(input.tags),
      fingerprint,
      notes: input.notes?.trim() ? input.notes.trim() : null,
      createdAt,
      updatedAt: createdAt,
    })
    .returning()

  if (!profile) throw new Error("Profile was not created")
  return profile
}

export async function updateUserProfile(
  userId: string,
  profileId: string,
  input: ProfileInput,
  database: Db = db
) {
  const name = input.name.trim()
  if (!name) throw new Error("Profile name is required")

  const proxyGeo = input.proxyId
    ? await getOwnedProxyGeo(userId, input.proxyId, database)
    : undefined
  if (input.folderId) await assertFolderOwned(userId, input.folderId, database)
  if (input.statusId) await assertStatusOwned(userId, input.statusId, database)

  const [existing] = await database
    .select({ fingerprint: profiles.fingerprint })
    .from(profiles)
    .where(and(eq(profiles.id, profileId), eq(profiles.userId, userId)))
    .limit(1)
  if (!existing) throw new Error("Profile not found")

  // Regenerate from the chosen seed (or keep the profile's current one). A no-op
  // edit reproduces the same fingerprint; changing OS/engine/proxy keeps it
  // coherent with the new selection.
  const os = input.os ?? readOs(existing.fingerprint)
  const seed =
    input.fingerprintSeed ?? readSeed(existing.fingerprint) ?? randomSeed()
  const fingerprint = generateFingerprint({
    os,
    engine: input.engine,
    proxyGeo,
    seed,
  })

  const [profile] = await database
    .update(profiles)
    .set({
      name: name.slice(0, 255),
      engine: input.engine,
      proxyId: input.proxyId ?? null,
      folderId: input.folderId ?? null,
      statusId: input.statusId ?? null,
      tags: normalizeTags(input.tags),
      fingerprint,
      notes: input.notes?.trim() ? input.notes.trim() : null,
      updatedAt: now(),
    })
    .where(and(eq(profiles.id, profileId), eq(profiles.userId, userId)))
    .returning()

  if (!profile) throw new Error("Profile not found")
  return profile
}

export async function deleteUserProfile(
  userId: string,
  profileId: string,
  database: Db = db
) {
  const [deleted] = await database
    .delete(profiles)
    .where(and(eq(profiles.id, profileId), eq(profiles.userId, userId)))
    .returning({ id: profiles.id })

  if (!deleted) throw new Error("Profile not found")
  return { profileId: deleted.id }
}

// Generates a fingerprint for the dialog preview without persisting it. Ownership
// of any referenced proxy is enforced (so we don't leak another user's exit geo).
export async function previewProfileFingerprint(
  userId: string,
  input: {
    os: ProfileOs
    engine: ProfileEngine
    proxyId?: string | null
    seed?: number | null
  },
  database: Db = db
): Promise<Fingerprint> {
  const proxyGeo = input.proxyId
    ? await getOwnedProxyGeo(userId, input.proxyId, database)
    : undefined
  return generateFingerprint({
    os: input.os,
    engine: input.engine,
    proxyGeo,
    seed: input.seed ?? randomSeed(),
  })
}

export function serializeProfile(row: Profile) {
  const os = readOs(row.fingerprint)
  return {
    id: row.id,
    name: row.name,
    status: row.status as ProfileStatus,
    engine: row.engine as ProfileEngine,
    proxyId: row.proxyId,
    os,
    folderId: row.folderId,
    statusId: row.statusId,
    tags: Array.isArray(row.tags) ? row.tags : [],
    // Always a full, coherent fingerprint — legacy `{os}` rows are normalized.
    fingerprint: coerceFingerprint(row.fingerprint, os, row.engine as ProfileEngine),
    notes: row.notes,
    created_at: row.createdAt.toISOString(),
  }
}

// --- Folders -------------------------------------------------------------

export async function listUserFolders(userId: string, database: Db = db) {
  return database
    .select()
    .from(profileFolders)
    .where(eq(profileFolders.userId, userId))
    .orderBy(profileFolders.name)
}

export async function createUserFolder(
  userId: string,
  name: string,
  database: Db = db
) {
  const trimmed = name.trim()
  if (!trimmed) throw new Error("Folder name is required")
  const createdAt = now()
  const [folder] = await database
    .insert(profileFolders)
    .values({ id: uuid(), userId, name: trimmed.slice(0, 255), createdAt })
    .returning()
  if (!folder) throw new Error("Folder was not created")
  return folder
}

export function serializeFolder(row: ProfileFolderRow) {
  return { id: row.id, name: row.name }
}

// --- Statuses ------------------------------------------------------------

export async function listUserStatuses(userId: string, database: Db = db) {
  const existing = await database
    .select()
    .from(profileStatuses)
    .where(eq(profileStatuses.userId, userId))
    .orderBy(profileStatuses.createdAt)
  if (existing.length > 0) return existing

  // First use: seed sensible defaults. Stagger createdAt by index so the list
  // order is stable across reads, and onConflictDoNothing (on the user+name
  // unique) makes a concurrent double-seed harmless. Re-read for the canonical set.
  const base = now().getTime()
  const seeded = DEFAULT_STATUSES.map((status, index) => ({
    id: uuid(),
    userId,
    name: status.name,
    color: status.color,
    createdAt: new Date(base + index),
  }))
  await database.insert(profileStatuses).values(seeded).onConflictDoNothing()
  return database
    .select()
    .from(profileStatuses)
    .where(eq(profileStatuses.userId, userId))
    .orderBy(profileStatuses.createdAt)
}

export async function createUserStatus(
  userId: string,
  name: string,
  database: Db = db
) {
  const trimmed = name.trim()
  if (!trimmed) throw new Error("Status name is required")
  const existing = await database
    .select({ name: profileStatuses.name })
    .from(profileStatuses)
    .where(eq(profileStatuses.userId, userId))
  // Reject duplicates up front (case-insensitive) for a clean error; the DB
  // unique constraint is the backstop against races.
  if (existing.some((s) => s.name.toLowerCase() === trimmed.toLowerCase())) {
    throw new Error("A status with that name already exists")
  }
  // Pick the next palette color by current count.
  const color = STATUS_COLORS[existing.length % STATUS_COLORS.length]
  const createdAt = now()
  const [status] = await database
    .insert(profileStatuses)
    .values({ id: uuid(), userId, name: trimmed.slice(0, 255), color, createdAt })
    .returning()
  if (!status) throw new Error("Status was not created")
  return status
}

export function serializeStatus(row: ProfileStatusRow) {
  return { id: row.id, name: row.name, color: row.color }
}

// --- Duplicate + bulk actions -------------------------------------------

export async function duplicateUserProfile(
  userId: string,
  profileId: string,
  database: Db = db
) {
  const [src] = await database
    .select()
    .from(profiles)
    .where(and(eq(profiles.id, profileId), eq(profiles.userId, userId)))
    .limit(1)
  if (!src) throw new Error("Profile not found")

  // A clone is a NEW identity with the SAME config — regenerate the fingerprint
  // with a fresh seed so two accounts never share one.
  const os = readOs(src.fingerprint)
  const proxyGeo = src.proxyId
    ? await getOwnedProxyGeo(userId, src.proxyId, database)
    : undefined
  const fingerprint = generateFingerprint({
    os,
    engine: src.engine as ProfileEngine,
    proxyGeo,
    seed: randomSeed(),
  })

  const createdAt = now()
  const [copy] = await database
    .insert(profiles)
    .values({
      id: uuid(),
      userId,
      name: `${src.name} copy`.slice(0, 255),
      status: "stopped",
      engine: src.engine,
      proxyId: src.proxyId,
      folderId: src.folderId,
      statusId: src.statusId,
      tags: Array.isArray(src.tags) ? src.tags : [],
      fingerprint,
      notes: src.notes,
      createdAt,
      updatedAt: createdAt,
    })
    .returning()
  if (!copy) throw new Error("Profile was not duplicated")
  return copy
}

// Each bulk op scopes by userId in the WHERE, so foreign ids are silently
// skipped — never a leak or a cross-user mutation.
export async function bulkDeleteProfiles(
  userId: string,
  ids: string[],
  database: Db = db
) {
  if (ids.length === 0) return { count: 0 }
  const deleted = await database
    .delete(profiles)
    .where(and(inArray(profiles.id, ids), eq(profiles.userId, userId)))
    .returning({ id: profiles.id })
  return { count: deleted.length }
}

export async function bulkMoveProfiles(
  userId: string,
  ids: string[],
  folderId: string | null,
  database: Db = db
) {
  if (folderId) await assertFolderOwned(userId, folderId, database)
  if (ids.length === 0) return { count: 0 }
  const updated = await database
    .update(profiles)
    .set({ folderId: folderId ?? null, updatedAt: now() })
    .where(and(inArray(profiles.id, ids), eq(profiles.userId, userId)))
    .returning({ id: profiles.id })
  return { count: updated.length }
}

export async function bulkSetProfileStatus(
  userId: string,
  ids: string[],
  statusId: string | null,
  database: Db = db
) {
  if (statusId) await assertStatusOwned(userId, statusId, database)
  if (ids.length === 0) return { count: 0 }
  const updated = await database
    .update(profiles)
    .set({ statusId: statusId ?? null, updatedAt: now() })
    .where(and(inArray(profiles.id, ids), eq(profiles.userId, userId)))
    .returning({ id: profiles.id })
  return { count: updated.length }
}

export async function bulkAddProfileTag(
  userId: string,
  ids: string[],
  tag: string,
  database: Db = db
) {
  const clean = tag.trim().slice(0, 50)
  if (!clean) throw new Error("Tag is required")
  if (ids.length === 0) return { count: 0 }
  // One atomic, set-based UPDATE instead of N round-trips: append the tag unless
  // the row already has it (case-insensitive) or is already at the 20-tag cap.
  const updated = await database
    .update(profiles)
    .set({
      tags: sql`CASE
        WHEN jsonb_array_length(${profiles.tags}) >= 20 THEN ${profiles.tags}
        WHEN EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(${profiles.tags}) AS e
          WHERE lower(e) = lower(${clean})
        ) THEN ${profiles.tags}
        ELSE ${profiles.tags} || to_jsonb(${clean}::text)
      END`,
      updatedAt: now(),
    })
    .where(and(inArray(profiles.id, ids), eq(profiles.userId, userId)))
    .returning({ id: profiles.id })
  return { count: updated.length }
}
