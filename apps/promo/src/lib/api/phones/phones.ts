import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { MANUAL_PHONE_ACTIONS, phoneLane } from "@/lib/phones/options"
import { adminGet, adminPost } from "@/server/guards"
import { listFoldersAndLabels, type FolderView, type LabelView } from "@/server/browser/profiles"
import { listProxies } from "@/server/browser/proxies"
import {
  changePhone,
  createPhone,
  type PhoneInput,
  deletePhones,
  holdPhones,
  labelPhones,
  listPhones,
  movePhones,
  ownsPhone,
  putPhonesOnRack,
  serialInUse,
  tagPhones,
  type BulkResult,
  type PhoneRecord,
} from "@/server/phones/phones"
import {
  createPairingCode,
  createRack,
  deleteRack,
  disconnectRack,
  listRacks,
  phoneActions,
  readRack,
  updateRack,
  type PhoneActionView,
  type RackState,
  type RackView,
} from "@/server/phones/rack"
import { phoneProjects, type PhoneProject } from "@/server/phones/phone-projects"
import { queuePhoneAction } from "@/server/phones/queue"
import { askForLog, ownsRack, readLog } from "@/server/phones/rack-log"
import { queueSetupCheck } from "@/server/phones/setup"
import { queueWipe } from "@/server/phones/wipe"
import { RACK_VERSION, rackServerAddress } from "@/server/phones/release"
import {
  readPhoneSettings,
  setRackPaused,
  waitingPhoneJobs,
  type WaitingPhoneJob,
} from "@/server/phones/settings"
import { cancelJobs, countWaitingJobs, listLaneJobs, type JobList } from "@/server/social/job-list"
import { cleanWrittenPageBody, type WrittenPageNode } from "@/lib/pages/written-page-body"
import { cleanRackNoteBody, RACK_NOTES_STORED_MAX, storedRackNotes, type RackNoteNode } from "@/lib/phones/rack-notes"
import { passReaderWritten } from "@/lib/social/refusal-words"

import { createErrorMessage } from "../error-message"

export type { BulkResult, FolderView, LabelView, PhoneActionView, PhoneProject, PhoneRecord, RackState, RackView, WaitingPhoneJob }

/**
 * The Racks dashboard's and each rack's page's endpoints
 * (`workspace/docs/phones/racks-dashboard.md`). Every one is admin-only and
 * scoped to the signed-in person, and every rack id is checked to be theirs.
 * None of them talks to a phone: a check writes an action the rack program
 * picks up, and the page follows the rows.
 */

export const getPhoneErrorMessage = passReaderWritten(createErrorMessage(
  {
    "does not exist": "That is not there any more. Refresh the list.",
    "serial number": "Another phone already has that serial number.",
    "needs a word": "A tag needs a word in it.",
    "is held": "That phone is held. Release it first.",
    "not on a connected rack": "That phone is not on a connected rack. Plug it into the rack, or connect a rack.",
    "has not checked in": "The rack has not checked in for a minute. Check the computer the phones are plugged into.",
    "phone is offline": "That phone is offline. Plug it in and answer the question on its screen: Allow USB debugging on an Android, Trust this computer on an iPhone.",
    "not connected": "That rack is already disconnected. Refresh the list.",
    "already paired": "That rack is already paired. Disconnect it first to install it on another computer.",
    "is connected": "That rack is connected. Disconnect it first, then delete it.",
    "needs a name": "Give it a name first.",
    ENCRYPTION_NOT_CONFIGURED: "This server has no encryption key set, so a rack's key cannot be kept.",
  },
  "That did not work. Please try again."
))

/** What the Racks dashboard draws: every rack, and every phone for the counts, the warnings and the search. */
export type RacksPage = {
  racks: RackView[]
  phones: PhoneRecord[]
  /** The version Promo serves, so a rack on an older one can say so. */
  rackVersion: string
  /** When every phone job was paused, or null while the racks run. Pause is one switch for every rack. */
  pausedAt: Date | null
  /** The spare phones the daily self-test runs on, or null when none is picked. */
  testPhoneId: string | null
  testPhoneIphoneId: string | null
}

const racksFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<RacksPage> => {
    const userId = context.user.id
    const [racks, phones, settings] = await Promise.all([listRacks(userId), listPhones(userId), readPhoneSettings()])
    return {
      racks,
      phones,
      rackVersion: RACK_VERSION,
      pausedAt: settings.pausedAt,
      testPhoneId: settings.testPhoneId,
      testPhoneIphoneId: settings.testPhoneIphoneId,
    }
  })

export function loadRacksPage() {
  return racksFn()
}

/** What one rack's page draws: the rack, its phones, and what a phone's settings pick from. */
export type RackPage = RacksPage & {
  rack: RackView
  folders: FolderView[]
  labels: LabelView[]
  /** The proxies a phone on Wi-Fi can go out through, never a password. */
  proxies: Array<{ id: string; label: string; host: string }>
  /** The shelf's rows and columns from Settings → Phones, for the shelf map. */
  shelfRows: number
  shelfColumns: number
  /** The projects with an account on one of this rack's phones, for the Project filter. */
  projects: PhoneProject[]
  /** The jobs waiting for this rack's phones, for the counts card (part 91). */
  jobsWaiting: number
}

/** A rack page, or `missing` when the rack is not there (part 86). */
export type RackPageAnswer = { missing: false; page: RackPage } | { missing: true }

const rackPageFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ rackId: z.string().min(1).max(36) }))
  .handler(async ({ context, data }): Promise<RackPageAnswer> => {
    const userId = context.user.id
    const rack = await readRack(userId, data.rackId)
    if (!rack) return { missing: true }
    const [phones, groups, proxies, settings, projects] = await Promise.all([
      listPhones(userId),
      listFoldersAndLabels(userId),
      listProxies(userId),
      readPhoneSettings(),
      phoneProjects(userId),
    ])
    const here = phones.filter((phone) => phone.rackId === rack.id)
    const hereIds = new Set(here.map((phone) => phone.id))
    const jobsWaiting = await countWaitingJobs(userId, here.map((phone) => phoneLane(phone.id)))
    return {
      missing: false,
      page: {
        rack,
        racks: [rack],
        phones: here,
        rackVersion: RACK_VERSION,
        pausedAt: settings.pausedAt,
        testPhoneId: settings.testPhoneId,
        testPhoneIphoneId: settings.testPhoneIphoneId,
        ...groups,
        proxies: proxies.map(({ id, label, host }) => ({ id, label, host })),
        shelfRows: settings.shelfRows,
        shelfColumns: settings.shelfColumns,
        projects: projects
          .map((project) => ({ ...project, phoneIds: project.phoneIds.filter((id) => hereIds.has(id)) }))
          .filter((project) => project.phoneIds.length),
        jobsWaiting,
      },
    }
  })

export function loadRackPage(rackId: string) {
  return rackPageFn({ data: { rackId } })
}

const oneRackFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ rackId: z.string().min(1).max(36) }))
  .handler(async ({ context, data }): Promise<RackView> => {
    const rack = await readRack(context.user.id, data.rackId)
    if (!rack) throw new Error("That rack does not exist.")
    return rack
  })

/** One rack as it is now, which the New rack window reads while it waits for the program to pair. */
export function loadRack(rackId: string) {
  return oneRackFn({ data: { rackId } })
}

const phoneRackFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ phoneId: z.string().min(1).max(36) }))
  .handler(async ({ context, data }): Promise<{ found: boolean; rackId: string | null }> => {
    const phone = (await listPhones(context.user.id)).find((one) => one.id === data.phoneId)
    return { found: Boolean(phone), rackId: phone?.rackId ?? null }
  })

/**
 * Which rack a phone is on now, for `/admin/phones?open=<id>`, the one
 * address that opens a phone (part 87). A bell notice or another dashboard
 * links there and lands on the phone's rack, wherever it was plugged in last.
 */
export function findPhoneRack(phoneId: string) {
  return phoneRackFn({ data: { phoneId } })
}

const rackInput = z.object({
  name: z.string().trim().min(1, "needs a name").max(120),
  description: z.unknown().optional(),
})

const makeRackFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(rackInput)
  .handler(async ({ context, data }): Promise<{ id: string }> => ({
    id: await createRack(context.user.id, {
      name: data.name,
      description: data.description === undefined ? undefined : cleanWrittenPageBody(data.description),
    }),
  }))

/** A new rack with its name and description, before the rack program is installed (part 76). */
export function makeRack(input: { name: string; description?: WrittenPageNode }) {
  return makeRackFn({ data: input })
}

const saveRackFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      rackId: z.string().min(1).max(36),
      name: z.string().max(120).optional(),
      description: z.unknown().optional(),
      bannerUrl: z.string().max(2_000).optional(),
      notes: z.unknown().optional(),
    })
  )
  .handler(async ({ context, data }): Promise<void> => {
    const notes = data.notes === undefined ? undefined : storedRackNotes(cleanRackNoteBody(data.notes))
    if (notes !== undefined && notes.length > RACK_NOTES_STORED_MAX) throw new Error("The notes are too long. Split them, or take some out.")
    await updateRack(context.user.id, data.rackId, {
      name: data.name,
      description: data.description === undefined ? undefined : cleanWrittenPageBody(data.description),
      bannerUrl: data.bannerUrl,
      notes,
    })
  })

/** Saves one thing about a rack as it changes: its name, description, banner or notes. */
export function saveRack(input: {
  rackId: string
  name?: string
  description?: WrittenPageNode
  bannerUrl?: string
  notes?: RackNoteNode
}) {
  return saveRackFn({ data: input })
}

const deleteRacksFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ rackIds: z.array(z.string().min(1).max(36)).min(1).max(100) }))
  .handler(async ({ context, data }): Promise<{ deleted: string[]; kept: Array<{ id: string; reason: string }> }> => {
    const deleted: string[] = []
    const kept: Array<{ id: string; reason: string }> = []
    for (const rackId of data.rackIds) {
      try {
        await deleteRack(context.user.id, rackId)
        deleted.push(rackId)
      } catch (error) {
        kept.push({ id: rackId, reason: getPhoneErrorMessage(error) })
      }
    }
    return { deleted, kept }
  })

/**
 * Deletes racks that are not connected, in one request (part 79). A
 * connected one is kept, with why. Their phones go to Not on a rack.
 */
export function removeRacks(rackIds: string[]) {
  return deleteRacksFn({ data: { rackIds } })
}

const phoneInput = z.object({
  name: z.string().trim().min(1, "needs a name").max(120),
  kind: z.enum(["android", "iphone"]).default("android"),
  model: z.string().max(120).default(""),
  androidVersion: z.string().max(40).default(""),
  serial: z.string().max(120).default(""),
  simCarrier: z.string().max(120).default(""),
  simNumber: z.string().max(40).default(""),
  connection: z.enum(["sim", "wifi"]),
  proxyId: z.string().min(1).nullable(),
  notes: z.string().max(4_000).default(""),
  folderId: z.string().min(1).nullable(),
  labelId: z.string().min(1).nullable(),
  tags: z.array(z.string().max(50)).max(20).default([]),
  shelfSlot: z.string().max(20).default(""),
})

export type PhoneFormInput = z.input<typeof phoneInput>

const addPhoneFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ rackId: z.string().min(1).max(36), phone: phoneInput }))
  .handler(async ({ context, data }): Promise<{ id: string }> => ({
    id: await createPhone(context.user.id, data.phone, data.rackId),
  }))

/** A phone added by hand from New phone on a rack's page, on that rack (part 102). */
export function addPhone(rackId: string, phone: PhoneFormInput) {
  return addPhoneFn({ data: { rackId, phone } })
}

/**
 * One field or a few, as a phone's Settings sends them. No defaults: Zod fills a
 * default in even on a partial, which would blank every field not sent.
 */
const phonePatch = z
  .object({
    name: z.string().trim().min(1, "needs a name").max(120),
    kind: z.enum(["android", "iphone"]),
    model: z.string().max(120),
    androidVersion: z.string().max(40),
    serial: z.string().max(120),
    simCarrier: z.string().max(120),
    simNumber: z.string().max(40),
    connection: z.enum(["sim", "wifi"]),
    proxyId: z.string().min(1).nullable(),
    notes: z.string().max(4_000),
    folderId: z.string().min(1).nullable(),
    labelId: z.string().min(1).nullable(),
    tags: z.array(z.string().max(50)).max(20),
    shelfSlot: z.string().max(20),
  })
  .partial()
  .strict()

const changePhoneFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ id: z.string().min(1).max(36), patch: phonePatch }))
  .handler(async ({ context, data }): Promise<void> => {
    await changePhone(context.user.id, data.id, data.patch as Partial<PhoneInput>)
  })

/** Saves the fields changed in a phone's Settings, and only those (part 111). */
export function savePhoneFields(id: string, patch: Partial<PhoneFormInput>) {
  return changePhoneFn({ data: { id, patch } })
}

const serialFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ serial: z.string().max(120) }))
  .handler(async ({ context, data }): Promise<{ taken: boolean }> => ({ taken: await serialInUse(context.user.id, data.serial) }))

/** Whether another phone already has this serial, for New phone's check before Create (part 103). */
export function checkPhoneSerial(serial: string) {
  return serialFn({ data: { serial } })
}

const ids = z.array(z.string().min(1)).min(1).max(500)

const bulkFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.discriminatedUnion("action", [
      z.object({ action: z.literal("delete"), ids }),
      z.object({ action: z.literal("hold"), ids, held: z.boolean() }),
      z.object({ action: z.literal("folder"), ids, folderId: z.string().min(1).nullable() }),
      z.object({ action: z.literal("label"), ids, labelId: z.string().min(1).nullable() }),
      z.object({ action: z.literal("tag"), ids, tag: z.string().trim().min(1, "needs a word").max(50) }),
      z.object({ action: z.literal("rack"), ids, rackId: z.string().min(1).max(36) }),
    ])
  )
  .handler(async ({ context, data }): Promise<BulkResult> => {
    const userId = context.user.id
    if (data.action === "delete") return deletePhones(userId, data.ids)
    if (data.action === "hold") return holdPhones(userId, data.ids, data.held)
    if (data.action === "folder") return movePhones(userId, data.ids, data.folderId)
    if (data.action === "label") return labelPhones(userId, data.ids, data.labelId)
    if (data.action === "rack") return putPhonesOnRack(userId, data.ids, data.rackId)
    return tagPhones(userId, data.ids, data.tag)
  })

export type BulkPhoneAction =
  | { action: "delete"; ids: string[] }
  | { action: "hold"; ids: string[]; held: boolean }
  | { action: "folder"; ids: string[]; folderId: string | null }
  | { action: "label"; ids: string[]; labelId: string | null }
  | { action: "tag"; ids: string[]; tag: string }
  | { action: "rack"; ids: string[]; rackId: string }

export function changePhones(input: BulkPhoneAction) {
  return bulkFn({ data: input })
}

const actionsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, data }): Promise<PhoneActionView[]> => {
    if (!(await ownsPhone(context.user.id, data.id))) throw new Error("That phone does not exist.")
    return phoneActions(context.user.id, data.id)
  })

export function loadPhoneActions(id: string) {
  return actionsFn({ data: { id } })
}

const runFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ id: z.string().min(1), action: z.enum(MANUAL_PHONE_ACTIONS) }))
  .handler(async ({ context, data }): Promise<{ id: string }> => ({
    id: await queuePhoneAction(context.user.id, data.id, data.action),
  }))

/** Asks the rack to run one named action on the phone. */
export function runPhoneAction(id: string, action: (typeof MANUAL_PHONE_ACTIONS)[number]) {
  return runFn({ data: { id, action } })
}

export type PairingCode = {
  code: string
  expiresAt: Date
  /** The whole install command, with this Promo's address in it. */
  command: string
}

const codeFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ rackId: z.string().min(1).max(36) }))
  .handler(async ({ context, data }): Promise<PairingCode> => {
    const { code, expiresAt } = await createPairingCode(context.user.id, data.rackId)
    return {
      code,
      expiresAt,
      command: `curl -fsSL ${rackServerAddress().replace(/\/$/, "")}/api/rack/install.sh | bash -s -- ${code}`,
    }
  })

/** A new one-time code for one rack that is not connected, and the command that uses it. */
export function makePairingCode(rackId: string) {
  return codeFn({ data: { rackId } })
}

const disconnectFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, data }): Promise<void> => disconnectRack(context.user.id, data.id))

/** Cancels a rack's key at once. */
export function disconnectPhoneRack(id: string) {
  return disconnectFn({ data: { id } })
}

const pauseFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .handler(async ({ context }): Promise<void> => setRackPaused(context.user.id, true))

/** Pauses every phone job. Jobs already running finish. */
export function pauseRack() {
  return pauseFn()
}

const waitingFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<WaitingPhoneJob[]> => waitingPhoneJobs(context.user.id))

/** The phone jobs still waiting, for the question asked before resuming. */
export function loadWaitingPhoneJobs() {
  return waitingFn()
}

const resumeFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ drop: z.array(z.string().min(1)).max(200) }))
  .handler(async ({ context, data }): Promise<{ dropped: number }> => {
    // The stale ones go first, so none of them starts in the moment between.
    const dropped = data.drop.length ? (await cancelJobs(context.user.id, data.drop)).completed.length : 0
    await setRackPaused(context.user.id, false)
    return { dropped }
  })

/** Drops the ticked waiting jobs, then resumes the rack. */
export function resumeRack(drop: string[]) {
  return resumeFn({ data: { drop } })
}

const setupFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, data }): Promise<void> => {
    await queueSetupCheck(context.user.id, data.id)
  })

/** Asks the rack to read the phone's setup and what the platform sees. */
export function runSetupCheck(id: string) {
  return setupFn({ data: { id } })
}

const wipeFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, data }): Promise<void> => {
    await queueWipe(context.user.id, data.id)
  })

/**
 * Asks the rack to factory-reset the phone, after the person confirmed it.
 * Refused while an account is on it or on its way to it.
 */
export function wipePhone(id: string) {
  return wipeFn({ data: { id } })
}

const phoneJobsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, data }): Promise<JobList> => {
    if (!(await ownsPhone(context.user.id, data.id))) throw new Error("That phone does not exist.")
    return listLaneJobs(context.user.id, [phoneLane(data.id)])
  })

/**
 * The jobs waiting for, running on and finished on one phone, newest first,
 * at most 100, for the Jobs section in its ⋮ (part 58). Cancel and Try
 * again are the Jobs window's own (`src/lib/api/social/jobs.ts`).
 */
export function loadPhoneJobs(id: string) {
  return phoneJobsFn({ data: { id } })
}

const rackJobsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ rackId: z.string().min(1).max(36) }))
  .handler(async ({ context, data }): Promise<JobList> => {
    if (!(await readRack(context.user.id, data.rackId))) throw new Error("That rack does not exist.")
    const phones = (await listPhones(context.user.id)).filter((phone) => phone.rackId === data.rackId)
    return listLaneJobs(context.user.id, phones.map((phone) => phoneLane(phone.id)))
  })

/** The jobs waiting for, running on and finished on every phone on one rack, for the rack's Jobs tab (part 104). */
export function loadRackJobs(rackId: string) {
  return rackJobsFn({ data: { rackId } })
}

const askLogFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ rackId: z.string().min(1) }))
  .handler(async ({ context, data }): Promise<void> => {
    if (!(await ownsRack(context.user.id, data.rackId))) throw new Error("That rack does not exist.")
    askForLog(data.rackId)
  })

/** Asks the rack for the last lines of its own log, which it sends on its next check for work (part 61). */
export function askRackLog(rackId: string) {
  return askLogFn({ data: { rackId } })
}

export type RackLogView = { lines: string[]; at: Date } | null

const logFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ rackId: z.string().min(1) }))
  .handler(async ({ context, data }): Promise<RackLogView> => readLog(context.user.id, data.rackId))

/** The lines the rack last sent, oldest first, with when, or null before it has answered. */
export function loadRackLog(rackId: string) {
  return logFn({ data: { rackId } })
}
