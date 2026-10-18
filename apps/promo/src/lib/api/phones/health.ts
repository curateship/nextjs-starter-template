import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { PHONE_KINDS, TRACKED_APPS, type PhoneKind } from "@/lib/phones/options"
import { adminGet, adminPost } from "@/server/guards"
import { phoneReadings, type PhoneReading } from "@/server/phones/health"
import { phoneHistory, type PhoneEventView } from "@/server/phones/history"
import { ownsPhone } from "@/server/phones/phones"
import {
  runSelfTestNow,
  selfTestPage,
  updateOtherPhones,
  updateTestPhone,
  type SelfTestKindPage,
  type SelfTestPage,
} from "@/server/phones/self-test"
import { clearStepPictures, stepPictures, type StepPicture } from "@/server/phones/trail"
import { icloudState, queueIcloudCheck, type IcloudState } from "@/server/phones/wipe"
import { passReaderWritten } from "@/lib/social/refusal-words"

import { createErrorMessage } from "../error-message"

export type { IcloudState, PhoneEventView, PhoneReading, SelfTestKindPage, SelfTestPage, StepPicture }

/**
 * A phone's health in its window (history, the battery and heat chart, each
 * action's step pictures, an iPhone's iCloud read) and the Self-test window
 * on the Phones dashboard. Admin-only, scoped to the signed-in person.
 */

export const getPhoneHealthErrorMessage = passReaderWritten(createErrorMessage(
  {
    "does not exist": "That is not there any more. Refresh the list.",
    "Pick a self-test iPhone": "Pick a self-test iPhone in Settings → Phones first.",
    "Pick a self-test phone": "Pick a self-test phone in Settings → Phones first.",
    "already being tried": "That app is already being tried on the test phone.",
    "is not on the Android test phone": "That app is not on the Android test phone.",
    "is not on the iPhone test phone": "That app is not on the iPhone test phone.",
    "has to pass the self-test": "The test phone has to pass the self-test on the new version before the other phones of its kind update.",
    "Only an iPhone": "Only an iPhone has an Apple ID to check.",
    "is held": "The test phone is held. Release it first.",
    "phone is offline": "The test phone is offline. Plug it in and answer the question on its screen: Allow USB debugging on an Android, Trust this computer on an iPhone.",
    "has not checked in": "The rack has not checked in for a minute. Check the computer the phones are plugged into.",
    "not on a connected rack": "The test phone is not on a connected rack.",
  },
  "That did not work. Please try again."
))

const historyFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, data }): Promise<PhoneEventView[]> => {
    if (!(await ownsPhone(context.user.id, data.id))) throw new Error("That phone does not exist.")
    return phoneHistory(context.user.id, data.id)
  })

/** The phone's history, newest first. */
export function loadPhoneHistory(id: string) {
  return historyFn({ data: { id } })
}

const readingsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, data }): Promise<PhoneReading[]> => phoneReadings(context.user.id, data.id))

/** Four weeks of battery and heat, oldest first. */
export function loadPhoneReadings(id: string) {
  return readingsFn({ data: { id } })
}

const picturesFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ actionId: z.string().min(1) }))
  .handler(async ({ context, data }): Promise<StepPicture[]> => stepPictures(context.user.id, data.actionId))

/** One action's steps with their pictures. */
export function loadStepPictures(actionId: string) {
  return picturesFn({ data: { actionId } })
}

const clearFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ actionId: z.string().min(1) }))
  .handler(async ({ context, data }): Promise<void> => clearStepPictures(context.user.id, data.actionId))

/** Deletes one action's pictures, once they have been looked at. */
export function clearActionPictures(actionId: string) {
  return clearFn({ data: { actionId } })
}

const selfTestFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<SelfTestPage> => selfTestPage(context.user.id))

export function loadSelfTest() {
  return selfTestFn()
}

const runFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ kind: z.enum(PHONE_KINDS).default("android") }))
  .handler(async ({ context, data }): Promise<void> => runSelfTestNow(context.user.id, data.kind))

/** Runs the self-test on one kind's test phone now rather than at its daily time. */
export function runSelfTest(kind: PhoneKind) {
  return runFn({ data: { kind } })
}

const updateFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({ app: z.enum(TRACKED_APPS), where: z.enum(["test", "others"]), kind: z.enum(PHONE_KINDS).default("android") })
  )
  .handler(async ({ context, data }): Promise<{ queued: string[]; skipped: string[] }> => {
    if (data.where === "test") {
      await updateTestPhone(context.user.id, data.app, data.kind)
      return { queued: [], skipped: [] }
    }
    return updateOtherPhones(context.user.id, data.app, data.kind)
  })

/** Updates an app on one kind's test phone, or, once it passed, on every other phone of that kind. */
export function updateApp(app: (typeof TRACKED_APPS)[number], where: "test" | "others", kind: PhoneKind = "android") {
  return updateFn({ data: { app, where, kind } })
}

const icloudFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, data }): Promise<IcloudState | null> => {
    if (!(await ownsPhone(context.user.id, data.id))) throw new Error("That phone does not exist.")
    return icloudState(context.user.id, data.id)
  })

/** What the rack last read about an Apple ID on an iPhone, or null when never read. */
export function loadIcloudState(id: string) {
  return icloudFn({ data: { id } })
}

const checkIcloudFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, data }): Promise<string> => queueIcloudCheck(context.user.id, data.id))

/** Check iCloud on an iPhone's Setup tab: asks the rack to read whether an Apple ID is signed in. */
export function checkIcloud(id: string) {
  return checkIcloudFn({ data: { id } })
}
