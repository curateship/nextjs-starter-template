import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { TRACKED_APPS } from "@/lib/phones/options"
import { adminGet, adminPost } from "@/server/guards"
import { phoneReadings, type PhoneReading } from "@/server/phones/health"
import { phoneHistory, type PhoneEventView } from "@/server/phones/history"
import { ownsPhone } from "@/server/phones/phones"
import {
  runSelfTestNow,
  selfTestPage,
  updateOtherPhones,
  updateTestPhone,
  type SelfTestPage,
} from "@/server/phones/self-test"
import { clearStepPictures, stepPictures, type StepPicture } from "@/server/phones/trail"
import { passReaderWritten } from "@/lib/social/refusal-words"

import { createErrorMessage } from "../error-message"

export type { PhoneEventView, PhoneReading, SelfTestPage, StepPicture }

/**
 * A phone's health in its window (history, the battery and heat chart, each
 * action's step pictures) and the Self-test window on the Phones dashboard.
 * Admin-only, scoped to the signed-in person.
 */

export const getPhoneHealthErrorMessage = passReaderWritten(createErrorMessage(
  {
    "does not exist": "That is not there any more. Refresh the list.",
    "Pick a self-test phone": "Pick a self-test phone in Settings → Phones first.",
    "already being tried": "That app is already being tried on the test phone.",
    "is not on the test phone": "That app is not on the test phone.",
    "has to pass the self-test": "The test phone has to pass the self-test on the new version before the other phones update.",
    "is held": "The test phone is held. Release it first.",
    "phone is offline": "The test phone is offline. Plug it in and allow USB debugging on its screen.",
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
  .handler(async ({ context }): Promise<void> => runSelfTestNow(context.user.id))

/** Runs the self-test on the test phone now rather than at its daily time. */
export function runSelfTest() {
  return runFn()
}

const updateFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ app: z.enum(TRACKED_APPS), where: z.enum(["test", "others"]) }))
  .handler(async ({ context, data }): Promise<{ queued: string[]; skipped: string[] }> => {
    if (data.where === "test") {
      await updateTestPhone(context.user.id, data.app)
      return { queued: [], skipped: [] }
    }
    return updateOtherPhones(context.user.id, data.app)
  })

/** Updates an app on the test phone, or, once it passed, on every other phone. */
export function updateApp(app: (typeof TRACKED_APPS)[number], where: "test" | "others") {
  return updateFn({ data: { app, where } })
}
