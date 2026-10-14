import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { MANUAL_PHONE_ACTIONS } from "@/lib/phones/options"
import { adminGet, adminPost } from "@/server/guards"
import { listFoldersAndLabels, type FolderView, type LabelView } from "@/server/browser/profiles"
import { listProxies } from "@/server/browser/proxies"
import {
  createPhone,
  deletePhones,
  holdPhones,
  labelPhones,
  listPhones,
  movePhones,
  ownsPhone,
  tagPhones,
  updatePhone,
  type BulkResult,
  type PhoneRecord,
} from "@/server/phones/phones"
import {
  createPairingCode,
  disconnectRack,
  listRacks,
  phoneActions,
  type PhoneActionView,
  type RackView,
} from "@/server/phones/rack"
import { queuePhoneAction } from "@/server/phones/queue"
import { queueSetupCheck } from "@/server/phones/setup"
import { queueWipe } from "@/server/phones/wipe"
import { RACK_VERSION, rackServerAddress } from "@/server/phones/release"
import {
  readPhoneSettings,
  setRackPaused,
  waitingPhoneJobs,
  type WaitingPhoneJob,
} from "@/server/phones/settings"
import { cancelJobs } from "@/server/social/job-list"
import { passReaderWritten } from "@/lib/social/refusal-words"

import { createErrorMessage } from "../error-message"

export type { BulkResult, FolderView, LabelView, PhoneActionView, PhoneRecord, RackView, WaitingPhoneJob }

/**
 * The Phones dashboard's endpoints. Every one is admin-only and scoped to the
 * signed-in person. None of them talks to a phone: a test writes an action
 * the rack program picks up, and the dashboard follows the rows.
 */

export const getPhoneErrorMessage = passReaderWritten(createErrorMessage(
  {
    "does not exist": "That is not there any more. Refresh the list.",
    "serial number": "Another phone already has that serial number.",
    "needs a word": "A tag needs a word in it.",
    "is held": "That phone is held. Release it first.",
    "not on a connected rack": "That phone is not on a connected rack. Plug it into the rack, or connect a rack.",
    "has not checked in": "The rack has not checked in for a minute. Check the computer the phones are plugged into.",
    "phone is offline": "That phone is offline. Plug it in and allow USB debugging on its screen.",
    "not connected": "That rack is already disconnected. Refresh the list.",
    ENCRYPTION_NOT_CONFIGURED: "This server has no encryption key set, so a rack's key cannot be kept.",
  },
  "That did not work. Please try again."
))

export type PhonesPage = {
  phones: PhoneRecord[]
  racks: RackView[]
  /** The version Promo serves, so a rack on an older one can say so. */
  rackVersion: string
  /** When every phone job was paused, or null while the rack runs. */
  pausedAt: Date | null
  /** The spare phone the daily self-test runs on, or null when none is picked. */
  testPhoneId: string | null
  folders: FolderView[]
  labels: LabelView[]
  /** The proxies a phone on Wi-Fi can go out through, never a password. */
  proxies: Array<{ id: string; label: string; host: string }>
}

const listFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<PhonesPage> => {
    const userId = context.user.id
    const [phones, racks, groups, proxies, settings] = await Promise.all([
      listPhones(userId),
      listRacks(userId),
      listFoldersAndLabels(userId),
      listProxies(userId),
      readPhoneSettings(),
    ])
    return {
      phones,
      racks,
      rackVersion: RACK_VERSION,
      pausedAt: settings.pausedAt,
      testPhoneId: settings.testPhoneId,
      ...groups,
      proxies: proxies.map(({ id, label, host }) => ({ id, label, host })),
    }
  })

export function loadPhonesPage() {
  return listFn()
}

const phoneInput = z.object({
  name: z.string().trim().min(1, "needs a name").max(120),
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

const saveFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ id: z.string().min(1).nullable(), phone: phoneInput }))
  .handler(async ({ context, data }): Promise<{ id: string }> => {
    if (data.id) {
      await updatePhone(context.user.id, data.id, data.phone)
      return { id: data.id }
    }
    return { id: await createPhone(context.user.id, data.phone) }
  })

export function savePhone(id: string | null, phone: PhoneFormInput) {
  return saveFn({ data: { id, phone } })
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
    ])
  )
  .handler(async ({ context, data }): Promise<BulkResult> => {
    const userId = context.user.id
    if (data.action === "delete") return deletePhones(userId, data.ids)
    if (data.action === "hold") return holdPhones(userId, data.ids, data.held)
    if (data.action === "folder") return movePhones(userId, data.ids, data.folderId)
    if (data.action === "label") return labelPhones(userId, data.ids, data.labelId)
    return tagPhones(userId, data.ids, data.tag)
  })

export type BulkPhoneAction =
  | { action: "delete"; ids: string[] }
  | { action: "hold"; ids: string[]; held: boolean }
  | { action: "folder"; ids: string[]; folderId: string | null }
  | { action: "label"; ids: string[]; labelId: string | null }
  | { action: "tag"; ids: string[]; tag: string }

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
  .handler(async ({ context }): Promise<PairingCode> => {
    const { code, expiresAt } = await createPairingCode(context.user.id)
    return {
      code,
      expiresAt,
      command: `curl -fsSL ${rackServerAddress().replace(/\/$/, "")}/api/rack/install.sh | bash -s -- ${code}`,
    }
  })

/** A new one-time code and the command that uses it. */
export function makePairingCode() {
  return codeFn()
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
