import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { adminGet, adminPost } from "@/server/guards"
import {
  createFolder,
  createLabel,
  createProfile,
  deleteFolder,
  deleteLabel,
  deleteProfiles,
  duplicateProfile,
  labelProfiles,
  listFoldersAndLabels,
  listProfiles,
  moveProfiles,
  ownsProfile,
  requestNewIdentity,
  profileHistory,
  renameFolder,
  renameLabel,
  tagProfiles,
  updateProfile,
  type BulkResult,
  type DeleteResult,
  type FolderView,
  type HistoryEntry,
  type LabelView,
  type ProfileRecord,
} from "@/server/browser/profiles"
import { listProxies } from "@/server/browser/proxies"
import { lastRunStartedAt, liveSessionRow, streamWindow } from "@/server/browser/session"
import { accountsByProfile, hasPendingJob } from "@/server/social/accounts"
import { lastFailedProfileJob, pendingProfileJobs, queueJob } from "@/server/social/jobs"
import type { ProxyTestResult } from "@/lib/social/options"

import { createErrorMessage } from "../error-message"

export type { BulkResult, DeleteResult, FolderView, HistoryEntry, LabelView }

/**
 * The Browser profiles dashboard's endpoints. Every one is admin-only and
 * scoped to the signed-in person.
 *
 * Open, close and check never touch a browser. Each writes a job for the
 * browser program, the only program that holds the key to one, and the
 * dashboard follows the rows it writes.
 */

export const getProfileErrorMessage = createErrorMessage(
  {
    "does not exist": "That is not there any more. Refresh the list.",
    "already a folder": "There is already a folder with that name.",
    "already a label": "There is already a label with that name.",
    "needs a name": "Give it a name first.",
    "needs a word": "A tag needs a word in it.",
  },
  "That did not work. Please try again."
)

/** A profile row on the dashboard: the record and the accounts signed in inside it. */
export type ProfileRow = ProfileRecord & {
  accounts: Array<{ id: string; platform: string; handle: string; blocked: boolean }>
  /** A close, check or site check is waiting for the browser program. */
  closing: boolean
  checking: boolean
  siteChecking: boolean
}

export type ProfilesPage = {
  profiles: ProfileRow[]
  folders: FolderView[]
  labels: LabelView[]
  /** The proxies a profile can pick from, with their last test, never a password. */
  proxies: Array<{
    id: string
    label: string
    host: string
    port: number
    country: string
    lastTestResult: ProxyTestResult | null
    lastTestedAt: Date | null
  }>
}

const listFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<ProfilesPage> => {
    const userId = context.user.id
    const [profiles, groups, proxies, pending] = await Promise.all([
      listProfiles(userId),
      listFoldersAndLabels(userId),
      listProxies(userId),
      pendingProfileJobs(userId),
    ])
    const accounts = await accountsByProfile(userId, profiles.map((profile) => profile.id))
    const waiting = (kind: string, id: string) =>
      pending.some((job) => job.kind === kind && job.profileId === id)
    return {
      profiles: profiles.map((profile) => ({
        ...profile,
        // An open written but not yet picked up is already "opening": the
        // person pressed Open, and "stopped" would read as nothing happened.
        browser: profile.browser === "stopped" && waiting("open", profile.id) ? "opening" : profile.browser,
        closing: waiting("close", profile.id),
        checking: waiting("check", profile.id),
        siteChecking: waiting("site_check", profile.id),
        accounts: accounts.get(profile.id) ?? [],
      })),
      ...groups,
      proxies: proxies.map((proxy) => ({
        id: proxy.id,
        label: proxy.label,
        host: proxy.host,
        port: proxy.port,
        country: proxy.country,
        lastTestResult: proxy.lastTestResult,
        lastTestedAt: proxy.lastTestedAt,
      })),
    }
  })

export function loadProfilesPage() {
  return listFn()
}

const profileInput = z.object({
  name: z.string().trim().min(1, "needs a name").max(120),
  proxyId: z.string().min(1).nullable(),
  notes: z.string().max(4_000).default(""),
  folderId: z.string().min(1).nullable(),
  labelId: z.string().min(1).nullable(),
  tags: z.array(z.string().max(50)).max(20).default([]),
})

export type ProfileFormInput = z.input<typeof profileInput>

const saveFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ id: z.string().min(1).nullable(), profile: profileInput }))
  .handler(async ({ context, data }): Promise<{ id: string }> => {
    if (data.id) {
      await updateProfile(context.user.id, data.id, data.profile)
      return { id: data.id }
    }
    return { id: await createProfile(context.user.id, data.profile) }
  })

export function saveProfile(id: string | null, profile: ProfileFormInput) {
  return saveFn({ data: { id, profile } })
}

const ids = z.array(z.string().min(1)).min(1).max(500)

const deleteFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ ids }))
  .handler(async ({ context, data }): Promise<DeleteResult> => deleteProfiles(context.user.id, data.ids))

export function removeProfiles(profileIds: string[]) {
  return deleteFn({ data: { ids: profileIds } })
}

const duplicateFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, data }): Promise<{ id: string }> => ({
    id: await duplicateProfile(context.user.id, data.id),
  }))

export function copyProfile(id: string) {
  return duplicateFn({ data: { id } })
}

const bulkFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.discriminatedUnion("action", [
      z.object({ action: z.literal("folder"), ids, folderId: z.string().min(1).nullable() }),
      z.object({ action: z.literal("label"), ids, labelId: z.string().min(1).nullable() }),
      z.object({ action: z.literal("tag"), ids, tag: z.string().trim().min(1, "needs a word").max(50) }),
    ])
  )
  .handler(async ({ context, data }): Promise<BulkResult> => {
    const userId = context.user.id
    if (data.action === "folder") return moveProfiles(userId, data.ids, data.folderId)
    if (data.action === "label") return labelProfiles(userId, data.ids, data.labelId)
    return tagProfiles(userId, data.ids, data.tag)
  })

export type BulkProfileAction =
  | { action: "folder"; ids: string[]; folderId: string | null }
  | { action: "label"; ids: string[]; labelId: string | null }
  | { action: "tag"; ids: string[]; tag: string }

export function changeProfiles(input: BulkProfileAction) {
  return bulkFn({ data: input })
}

const groupFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      what: z.enum(["folder", "label"]),
      action: z.enum(["create", "rename", "delete"]),
      id: z.string().min(1).nullable(),
      name: z.string().max(120).default(""),
    })
  )
  .handler(async ({ context, data }): Promise<{ id: string | null }> => {
    const userId = context.user.id
    if (data.action === "create") {
      return { id: data.what === "folder" ? await createFolder(userId, data.name) : await createLabel(userId, data.name) }
    }
    if (!data.id) throw new Error("That does not exist.")
    if (data.action === "rename") {
      await (data.what === "folder" ? renameFolder : renameLabel)(userId, data.id, data.name)
    } else {
      await (data.what === "folder" ? deleteFolder : deleteLabel)(userId, data.id)
    }
    return { id: data.id }
  })

export function changeGroup(input: {
  what: "folder" | "label"
  action: "create" | "rename" | "delete"
  id: string | null
  name?: string
}) {
  return groupFn({ data: input })
}

const historyFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, data }): Promise<HistoryEntry[]> => profileHistory(context.user.id, data.id))

export function loadProfileHistory(id: string) {
  return historyFn({ data: { id } })
}

export type ProfileBrowser = {
  /** Open, opening, or not running, from the session row and the queue. */
  state: "open" | "opening" | "stopped"
  /**
   * The window's address with the name and password already in it, so the
   * stream lets a person straight in. Only for an open browser, and only to
   * the admin who owns it.
   */
  windowUrl: string | null
  /** True while a check a person asked for is waiting or running. */
  checking: boolean
  /**
   * What an opening browser is waiting for: the browser program to pick the
   * job up, or the container to come up. Null when not opening.
   */
  waitingFor: "program" | "container" | null
  /** Why the last open failed, when the newest run ended that way. */
  lastError: string
}

/**
 * The profile's browser as its window needs it, from the rows alone.
 *
 * Neko's own page signs in from `?usr=` and `?pwd=` in its address, checked
 * against the `promo-browser` image on 5 Oct 2026, so nobody types the password.
 */
const browserFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, data }): Promise<ProfileBrowser> => {
    const userId = context.user.id
    if (!(await ownsProfile(userId, data.id))) throw new Error("That browser profile does not exist.")

    const session = await liveSessionRow(data.id)
    const stream = session?.status === "running" ? streamWindow(session) : null
    const pendingOpen = await hasPendingJob(userId, "open", data.id)
    const state = stream ? "open" : session || pendingOpen ? "opening" : "stopped"
    return {
      state,
      windowUrl: stream
        ? `${stream.streamUrl}?usr=promo&pwd=${encodeURIComponent(stream.streamPassword)}`
        : null,
      checking: await hasPendingJob(userId, "check", data.id),
      waitingFor: state !== "opening" ? null : session ? "container" : "program",
      lastError:
        state === "stopped"
          ? ((await lastFailedProfileJob(userId, "open", data.id, await lastRunStartedAt(data.id))) ?? "")
          : "",
    }
  })

export function loadProfileBrowser(id: string) {
  return browserFn({ data: { id } })
}

/**
 * Writes an open, close or check job for the profile. A second press while the
 * same job is already waiting adds nothing.
 */
const jobFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      id: z.string().min(1),
      kind: z.enum(["open", "close", "check", "site_check", "restart"]),
    })
  )
  .handler(async ({ context, data }): Promise<void> => {
    const userId = context.user.id
    if (!(await ownsProfile(userId, data.id))) throw new Error("That browser profile does not exist.")

    // A restart is a close and then an open, in that order in the queue.
    const kinds = data.kind === "restart" ? (["close", "open"] as const) : ([data.kind] as const)
    for (const kind of kinds) {
      if (await hasPendingJob(userId, kind, data.id)) continue
      await queueJob(userId, kind, { profileId: data.id })
    }
  })

export function profileJob(
  id: string,
  kind: "open" | "close" | "check" | "site_check" | "restart"
) {
  return jobFn({ data: { id, kind } })
}

/** Asks for a new identity on the profile's next launch. */
const newIdentityFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, data }): Promise<void> => requestNewIdentity(context.user.id, data.id))

export function askForNewIdentity(id: string) {
  return newIdentityFn({ data: { id } })
}
