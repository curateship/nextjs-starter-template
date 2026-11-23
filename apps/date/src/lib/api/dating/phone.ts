import { createServerFn } from "@tanstack/react-start"
import { and, desc, eq } from "drizzle-orm"
import { z } from "zod"

import { requestAccount } from "@/server/dating/accounts"
import { readDatingSettings, scheduleClash } from "@/server/dating/settings"
import { addSamples, removeSamples } from "@/server/dating/samples"
import { inWords } from "@/server/dating/words"
import { db } from "@/server/db"
import { userGet, userPost } from "@/server/guards"
import { queueAction } from "@/server/phone/actions"
import {
  createPairingCode,
  ownPhone,
  phoneView,
  phoneActions,
  phonesToShare,
  setInControl,
  shareAPhone,
  unpairPhone,
  type PhoneActionView,
  type PhoneView,
} from "@/server/phone/link"
import { closeScreen, watchScreen, type ScreenFrame } from "@/server/phone/screens"
import { resumeProfile } from "@/server/tinder/jobs"
import { datePhones } from "@/server/phone/schema"
import { dateProfiles, dateWalks } from "@/server/tinder/schema"

/**
 * The dashboard's Phone panel's server functions: pairing, the "Date is in control"
 * switch, Resume, the picture button, the live screen window, and the sample
 * data. Every one is behind sign-in and acts only on the member's own phone,
 * and pairing, Resume and the samples on the open profile.
 */

export type { PhoneActionView, PhoneView, ScreenFrame }

export type PhoneWalkView = {
  id: string
  kind: string
  status: string
  error: string
  askedBy: "member" | "ai"
  createdAt: Date
  finishedAt: Date | null
}

export type PhoneScreenData = {
  /** The open profile's phone, or null before one is paired for it. */
  phone: PhoneView | null
  /** The phone's last fifty actions. */
  actions: PhoneActionView[]
  /** The profile's last twenty walks. */
  walks: PhoneWalkView[]
  hasSamples: boolean
  /** With no phone yet: the member's paired phones this profile could share, by part 2 of "facebook/01". */
  shareable: Array<{ id: string; name: string }>
  /** Facebook Dating's own break as last read back (part 22): on, off, or null before it ever was. */
  appBreak: { on: boolean | null; at: Date | null }
}

const phoneId = z.object({ phoneId: z.string().min(1).max(40) })

const loadPhoneScreenFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }): Promise<PhoneScreenData> =>
    inWords(async () => {
      const account = await requestAccount(context.user.id)
      const [row] = account.phoneId ? await db.select().from(datePhones).where(eq(datePhones.id, account.phoneId)).limit(1) : []
      const phone = row ? phoneView(row, account) : null
      const [actions, walks, sample, shareable] = await Promise.all([
        phone ? phoneActions(context.user.id, phone.id) : Promise.resolve([]),
        phone
          ? db
              .select({
                id: dateWalks.id,
                kind: dateWalks.kind,
                status: dateWalks.status,
                error: dateWalks.error,
                askedBy: dateWalks.askedBy,
                createdAt: dateWalks.createdAt,
                finishedAt: dateWalks.finishedAt,
              })
              .from(dateWalks)
              .where(eq(dateWalks.accountId, account.id))
              .orderBy(desc(dateWalks.createdAt))
              .limit(20)
          : Promise.resolve([]),
        db
          .select({ id: dateProfiles.id })
          .from(dateProfiles)
          .where(and(eq(dateProfiles.accountId, account.id), eq(dateProfiles.sample, true)))
          .limit(1),
        phone ? Promise.resolve([]) : phonesToShare(account),
      ])
      return { phone, actions, walks, hasSamples: sample.length > 0, shareable, appBreak: { on: account.appBreak, at: account.appBreakAt } }
    })
  )

export function loadPhoneScreen() {
  return loadPhoneScreenFn()
}

const makePairCodeFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .handler(async ({ context }) => inWords(async () => createPairingCode(await requestAccount(context.user.id))))

/** A new six-digit code for the phone app, for the open profile. Its phone, when it has one, is paired again. */
export function makePairCode() {
  return makePairCodeFn()
}

const unpairFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(phoneId)
  .handler(async ({ data, context }) => inWords(() => unpairPhone(context.user.id, data.phoneId)))

export function unpair(phone: string) {
  return unpairFn({ data: { phoneId: phone } })
}

const setInControlFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(phoneId.extend({ on: z.boolean() }))
  .handler(async ({ data, context }) => inWords(() => setInControl(context.user.id, data.phoneId, data.on)))

export function switchDateInControl(phone: string, on: boolean) {
  return setInControlFn({ data: { phoneId: phone, on } })
}

const resumeFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .handler(async ({ context }) =>
    inWords(async () => {
      await resumeProfile(await requestAccount(context.user.id))
    })
  )

/** Resume: clears the open profile's stop and has the phone look at its app again at once. */
export function resume() {
  return resumeFn()
}

const shareFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(phoneId)
  .handler(async ({ data, context }) =>
    inWords(async () => {
      const account = await requestAccount(context.user.id)
      // The member's own phone first, so nothing about another member's phone is ever read or told.
      await ownPhone(context.user.id, data.phoneId)
      // The phone runs one app at a time, so this profile's swiping hours may not overlap another's on it.
      const clash = await scheduleClash({ ...account, phoneId: data.phoneId }, await readDatingSettings(account.id), db)
      if (clash) throw new Error(clash)
      await shareAPhone(account, data.phoneId)
    })
  )

/** The open profile runs on a phone already paired for another profile, with no new code. */
export function sharePhone(phone: string) {
  return shareFn({ data: { phoneId: phone } })
}

const takePictureFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(phoneId)
  .handler(async ({ data, context }) =>
    inWords(async () => {
      await queueAction(context.user.id, data.phoneId, "screenshot", {})
    })
  )

/** Asks the phone for a picture of its screen. It lands in the action list. */
export function takePicture(phone: string) {
  return takePictureFn({ data: { phoneId: phone } })
}

const watchScreenFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(phoneId)
  .handler(async ({ data, context }): Promise<{ frame: ScreenFrame | null }> =>
    inWords(async () => {
      await ownPhone(context.user.id, data.phoneId)
      return { frame: watchScreen(data.phoneId) }
    })
  )

/** The newest picture of the phone's screen; asking keeps the phone sending them. */
export function watchPhoneScreen(phone: string) {
  return watchScreenFn({ data: { phoneId: phone } })
}

const closeScreenFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(phoneId)
  .handler(async ({ data, context }) =>
    inWords(async () => {
      await ownPhone(context.user.id, data.phoneId)
      closeScreen(data.phoneId)
    })
  )

export function closePhoneScreen(phone: string) {
  return closeScreenFn({ data: { phoneId: phone } })
}

const tapScreenFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(phoneId.extend({ x: z.number().int().min(0).max(10_000), y: z.number().int().min(0).max(20_000) }))
  .handler(async ({ data, context }) =>
    inWords(async () => {
      await queueAction(context.user.id, data.phoneId, "tap", { x: data.x, y: data.y })
    })
  )

/** A tap in the screen window, in the phone's own pixels. Refused while a walk is working the phone. */
export function tapPhoneScreen(phone: string, x: number, y: number) {
  return tapScreenFn({ data: { phoneId: phone, x, y } })
}

const pressKeyFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(phoneId.extend({ key: z.enum(["back", "home"]) }))
  .handler(async ({ data, context }) =>
    inWords(async () => {
      await queueAction(context.user.id, data.phoneId, data.key, {})
    })
  )

export function pressPhoneKey(phone: string, key: "back" | "home") {
  return pressKeyFn({ data: { phoneId: phone, key } })
}

const addSamplesFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .handler(async ({ context }) =>
    inWords(async () => addSamples(await requestAccount(context.user.id)))
  )

/** Twelve sample cards and four conversations in the open profile, to look at the dashboard before a phone is paired. */
export function addSampleData() {
  return addSamplesFn()
}

const removeSamplesFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .handler(async ({ context }) =>
    inWords(async () => removeSamples(await requestAccount(context.user.id)))
  )

/** Deletes the open profile's sample cards and conversations, and nothing a phone read. */
export function removeSampleData() {
  return removeSamplesFn()
}
