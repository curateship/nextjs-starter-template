import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import type { ProxyItem } from "@/lib/api/proxies"

export type ProfileItem = {
  id: string
  name: string
  status: "stopped" | "starting" | "running" | "error"
  engine: "camoufox" | "chromium"
  proxyId: string | null
  os: "windows" | "macos" | "linux"
  notes: string | null
  created_at: string
}

// The dashboard needs the proxy list too (for the picker), so load both at once.
export type ProfileListResponse = {
  profiles: ProfileItem[]
  proxies: ProxyItem[]
}

const profileFormSchema = z.object({
  name: z.string().min(1).max(255),
  engine: z.enum(["camoufox", "chromium"]),
  proxyId: z.string().min(1).nullable().optional(),
  os: z.enum(["windows", "macos", "linux"]).optional(),
  notes: z.string().max(2000).optional(),
})

const updateProfileSchema = profileFormSchema.extend({
  profileId: z.string().min(1),
})

const deleteProfileSchema = z.object({ profileId: z.string().min(1) })

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

export type ProfileFormInput = {
  name: string
  engine: ProfileItem["engine"]
  proxyId?: string | null
  os?: ProfileItem["os"]
  notes?: string
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
  const { listUserProfiles, serializeProfile } = await import(
    "@/server/profiles"
  )
  const { listUserProxies, serializeProxy } = await import("@/server/proxies")
  const [profiles, proxies] = await Promise.all([
    listUserProfiles(userId),
    listUserProxies(userId),
  ])
  return {
    profiles: profiles.map(serializeProfile),
    proxies: proxies.map(serializeProxy),
  }
}
