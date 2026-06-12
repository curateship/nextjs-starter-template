import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import type { ProxyItem } from "@/lib/api/proxies"
// Type-only import (erased at build) — server/fingerprint.ts is pure data/logic.
import type { Fingerprint } from "@/server/fingerprint"

export type { Fingerprint } from "@/server/fingerprint"

export type FolderItem = { id: string; name: string }
export type StatusItem = { id: string; name: string; color: string }

export type ProfileItem = {
  id: string
  name: string
  status: "stopped" | "starting" | "running" | "error"
  engine: "camoufox" | "chromium"
  proxyId: string | null
  os: "windows" | "macos" | "linux"
  folderId: string | null
  statusId: string | null
  tags: string[]
  fingerprint: Fingerprint
  notes: string | null
  created_at: string
}

// The dashboard needs proxies (picker), folders, and statuses too — load together.
export type ProfileListResponse = {
  profiles: ProfileItem[]
  proxies: ProxyItem[]
  folders: FolderItem[]
  statuses: StatusItem[]
}

// Seed is bounded to the 31-bit range randomSeed() produces.
const fingerprintSeed = z.number().int().min(0).max(0x7fffffff)

const tagsSchema = z.array(z.string().max(50)).max(20)

const profileFormSchema = z.object({
  name: z.string().min(1).max(255),
  engine: z.enum(["camoufox", "chromium"]),
  proxyId: z.string().min(1).nullable().optional(),
  os: z.enum(["windows", "macos", "linux"]).optional(),
  notes: z.string().max(2000).optional(),
  fingerprintSeed: fingerprintSeed.optional(),
  folderId: z.string().min(1).nullable().optional(),
  statusId: z.string().min(1).nullable().optional(),
  tags: tagsSchema.optional(),
})

const updateProfileSchema = profileFormSchema.extend({
  profileId: z.string().min(1),
})

const deleteProfileSchema = z.object({ profileId: z.string().min(1) })
const duplicateProfileSchema = z.object({ profileId: z.string().min(1) })

const createFolderSchema = z.object({ name: z.string().min(1).max(255) })
const createStatusSchema = z.object({ name: z.string().min(1).max(255) })

// Bulk actions all take a list of profile ids plus an optional target.
const bulkIds = z.array(z.string().min(1)).min(1).max(500)
const bulkDeleteSchema = z.object({ profileIds: bulkIds })
const bulkMoveSchema = z.object({
  profileIds: bulkIds,
  folderId: z.string().min(1).nullable(),
})
const bulkStatusSchema = z.object({
  profileIds: bulkIds,
  statusId: z.string().min(1).nullable(),
})
const bulkTagSchema = z.object({
  profileIds: bulkIds,
  tag: z.string().min(1).max(50),
})

const previewFingerprintSchema = z.object({
  os: z.enum(["windows", "macos", "linux"]),
  engine: z.enum(["camoufox", "chromium"]),
  proxyId: z.string().min(1).nullable().optional(),
  seed: fingerprintSeed.optional(),
})

export function getProfileErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Profile request failed."
}

const loadProfilesFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<ProfileListResponse> => {
    const user = await requireUser()
    return profileListForUser(user.id)
  }
)

const createProfileFn = createServerFn({ method: "POST" })
  .inputValidator(profileFormSchema)
  .handler(async ({ data }): Promise<ProfileListResponse> => {
    const { requireAppOrigin } = await import("@/server/origin")
    const { createUserProfile } = await import("@/server/profiles")
    requireAppOrigin()
    const user = await requireUser()
    await createUserProfile(user.id, data)
    return profileListForUser(user.id)
  })

const updateProfileFn = createServerFn({ method: "POST" })
  .inputValidator(updateProfileSchema)
  .handler(async ({ data }): Promise<ProfileListResponse> => {
    const { requireAppOrigin } = await import("@/server/origin")
    const { updateUserProfile } = await import("@/server/profiles")
    requireAppOrigin()
    const user = await requireUser()
    const { profileId, ...input } = data
    await updateUserProfile(user.id, profileId, input)
    return profileListForUser(user.id)
  })

const deleteProfileFn = createServerFn({ method: "POST" })
  .inputValidator(deleteProfileSchema)
  .handler(async ({ data }): Promise<ProfileListResponse> => {
    const { requireAppOrigin } = await import("@/server/origin")
    const { deleteUserProfile } = await import("@/server/profiles")
    requireAppOrigin()
    const user = await requireUser()
    await deleteUserProfile(user.id, data.profileId)
    return profileListForUser(user.id)
  })

const previewFingerprintFn = createServerFn({ method: "POST" })
  .inputValidator(previewFingerprintSchema)
  .handler(async ({ data }): Promise<Fingerprint> => {
    const { requireAppOrigin } = await import("@/server/origin")
    const { previewProfileFingerprint } = await import("@/server/profiles")
    requireAppOrigin()
    const user = await requireUser()
    return previewProfileFingerprint(user.id, data)
  })

const duplicateProfileFn = createServerFn({ method: "POST" })
  .inputValidator(duplicateProfileSchema)
  .handler(async ({ data }): Promise<ProfileListResponse> => {
    const { requireAppOrigin } = await import("@/server/origin")
    const { duplicateUserProfile } = await import("@/server/profiles")
    requireAppOrigin()
    const user = await requireUser()
    await duplicateUserProfile(user.id, data.profileId)
    return profileListForUser(user.id)
  })

const createFolderFn = createServerFn({ method: "POST" })
  .inputValidator(createFolderSchema)
  .handler(async ({ data }): Promise<ProfileListResponse> => {
    const { requireAppOrigin } = await import("@/server/origin")
    const { createUserFolder } = await import("@/server/profiles")
    requireAppOrigin()
    const user = await requireUser()
    await createUserFolder(user.id, data.name)
    return profileListForUser(user.id)
  })

const createStatusFn = createServerFn({ method: "POST" })
  .inputValidator(createStatusSchema)
  .handler(async ({ data }): Promise<ProfileListResponse> => {
    const { requireAppOrigin } = await import("@/server/origin")
    const { createUserStatus } = await import("@/server/profiles")
    requireAppOrigin()
    const user = await requireUser()
    await createUserStatus(user.id, data.name)
    return profileListForUser(user.id)
  })

const bulkDeleteFn = createServerFn({ method: "POST" })
  .inputValidator(bulkDeleteSchema)
  .handler(async ({ data }): Promise<ProfileListResponse> => {
    const { requireAppOrigin } = await import("@/server/origin")
    const { bulkDeleteProfiles } = await import("@/server/profiles")
    requireAppOrigin()
    const user = await requireUser()
    await bulkDeleteProfiles(user.id, data.profileIds)
    return profileListForUser(user.id)
  })

const bulkMoveFn = createServerFn({ method: "POST" })
  .inputValidator(bulkMoveSchema)
  .handler(async ({ data }): Promise<ProfileListResponse> => {
    const { requireAppOrigin } = await import("@/server/origin")
    const { bulkMoveProfiles } = await import("@/server/profiles")
    requireAppOrigin()
    const user = await requireUser()
    await bulkMoveProfiles(user.id, data.profileIds, data.folderId)
    return profileListForUser(user.id)
  })

const bulkStatusFn = createServerFn({ method: "POST" })
  .inputValidator(bulkStatusSchema)
  .handler(async ({ data }): Promise<ProfileListResponse> => {
    const { requireAppOrigin } = await import("@/server/origin")
    const { bulkSetProfileStatus } = await import("@/server/profiles")
    requireAppOrigin()
    const user = await requireUser()
    await bulkSetProfileStatus(user.id, data.profileIds, data.statusId)
    return profileListForUser(user.id)
  })

const bulkTagFn = createServerFn({ method: "POST" })
  .inputValidator(bulkTagSchema)
  .handler(async ({ data }): Promise<ProfileListResponse> => {
    const { requireAppOrigin } = await import("@/server/origin")
    const { bulkAddProfileTag } = await import("@/server/profiles")
    requireAppOrigin()
    const user = await requireUser()
    await bulkAddProfileTag(user.id, data.profileIds, data.tag)
    return profileListForUser(user.id)
  })

export type ProfileFormInput = {
  name: string
  engine: ProfileItem["engine"]
  proxyId?: string | null
  os?: ProfileItem["os"]
  notes?: string
  fingerprintSeed?: number
  folderId?: string | null
  statusId?: string | null
  tags?: string[]
}

export function loadProfiles() {
  return loadProfilesFn()
}

export function createProfile(input: ProfileFormInput) {
  return createProfileFn({ data: input })
}

export function updateProfile(profileId: string, input: ProfileFormInput) {
  return updateProfileFn({ data: { profileId, ...input } })
}

export function deleteProfile(profileId: string) {
  return deleteProfileFn({ data: { profileId } })
}

export function previewFingerprint(input: {
  os: ProfileItem["os"]
  engine: ProfileItem["engine"]
  proxyId?: string | null
  seed?: number
}): Promise<Fingerprint> {
  return previewFingerprintFn({ data: input })
}

export function duplicateProfile(profileId: string) {
  return duplicateProfileFn({ data: { profileId } })
}

export function createFolder(name: string) {
  return createFolderFn({ data: { name } })
}

export function createStatus(name: string) {
  return createStatusFn({ data: { name } })
}

export function bulkDeleteProfiles(profileIds: string[]) {
  return bulkDeleteFn({ data: { profileIds } })
}

export function bulkMoveProfiles(profileIds: string[], folderId: string | null) {
  return bulkMoveFn({ data: { profileIds, folderId } })
}

export function bulkSetProfileStatus(
  profileIds: string[],
  statusId: string | null
) {
  return bulkStatusFn({ data: { profileIds, statusId } })
}

export function bulkAddProfileTag(profileIds: string[], tag: string) {
  return bulkTagFn({ data: { profileIds, tag } })
}

async function requireUser() {
  const { findCurrentUser } = await import("@/server/security")
  const user = await findCurrentUser()
  if (!user) {
    throw new Error("Missing session")
  }
  return user
}

async function profileListForUser(
  userId: string
): Promise<ProfileListResponse> {
  const {
    listUserProfiles,
    serializeProfile,
    listUserFolders,
    serializeFolder,
    listUserStatuses,
    serializeStatus,
  } = await import("@/server/profiles")
  const { listUserProxies, serializeProxy } = await import("@/server/proxies")
  const [profiles, proxies, folders, statuses] = await Promise.all([
    listUserProfiles(userId),
    listUserProxies(userId),
    listUserFolders(userId),
    listUserStatuses(userId),
  ])
  return {
    profiles: profiles.map(serializeProfile),
    proxies: proxies.map(serializeProxy),
    folders: folders.map(serializeFolder),
    statuses: statuses.map(serializeStatus),
  }
}
