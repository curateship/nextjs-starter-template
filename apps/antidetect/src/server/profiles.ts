import { and, desc, eq } from "drizzle-orm"

import { db, type Db } from "@/server/db"
import {
  profiles,
  proxies,
  type Profile,
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
}

// Verify a referenced proxy belongs to this user before linking it — otherwise a
// caller could attach another user's proxy by guessing its id.
async function assertProxyOwned(
  userId: string,
  proxyId: string,
  database: Db
) {
  const [proxy] = await database
    .select({ id: proxies.id })
    .from(proxies)
    .where(
      and(
        eq(proxies.id, proxyId),
        eq(proxies.userId, userId)
      )
    )
    .limit(1)
  if (!proxy) throw new Error("Proxy not found")
}

function readOs(fingerprint: unknown, fallback: ProfileOs = "windows"): ProfileOs {
  if (fingerprint && typeof fingerprint === "object" && !Array.isArray(fingerprint)) {
    const os = (fingerprint as Record<string, unknown>).os
    if (os === "windows" || os === "macos" || os === "linux") return os
  }
  return fallback
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
  if (input.proxyId) await assertProxyOwned(userId, input.proxyId, database)

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
      fingerprint: { os: input.os ?? "windows" },
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
  if (input.proxyId) await assertProxyOwned(userId, input.proxyId, database)

  const [existing] = await database
    .select({ fingerprint: profiles.fingerprint })
    .from(profiles)
    .where(
      and(
        eq(profiles.id, profileId),
        eq(profiles.userId, userId)
      )
    )
    .limit(1)
  if (!existing) throw new Error("Profile not found")

  // Preserve any other fingerprint fields, update only the OS seed.
  const prev =
    existing.fingerprint &&
    typeof existing.fingerprint === "object" &&
    !Array.isArray(existing.fingerprint)
      ? (existing.fingerprint as Record<string, unknown>)
      : {}
  const fingerprint = { ...prev, os: input.os ?? readOs(existing.fingerprint) }

  const [profile] = await database
    .update(profiles)
    .set({
      name: name.slice(0, 255),
      engine: input.engine,
      proxyId: input.proxyId ?? null,
      fingerprint,
      notes: input.notes?.trim() ? input.notes.trim() : null,
      updatedAt: now(),
    })
    .where(
      and(
        eq(profiles.id, profileId),
        eq(profiles.userId, userId)
      )
    )
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
    .where(
      and(
        eq(profiles.id, profileId),
        eq(profiles.userId, userId)
      )
    )
    .returning({ id: profiles.id })

  if (!deleted) throw new Error("Profile not found")
  return { profileId: deleted.id }
}

export function serializeProfile(row: Profile) {
  return {
    id: row.id,
    name: row.name,
    status: row.status as ProfileStatus,
    engine: row.engine as ProfileEngine,
    proxyId: row.proxyId,
    os: readOs(row.fingerprint),
    notes: row.notes,
    created_at: row.createdAt.toISOString(),
  }
}
