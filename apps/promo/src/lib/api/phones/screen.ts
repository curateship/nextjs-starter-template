import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import type { PhoneStatus } from "@/lib/phones/options"
import { adminGet, adminPost } from "@/server/guards"
import { listPhones } from "@/server/phones/phones"
import {
  closeScreen,
  ownedPhones,
  sendScreenInput,
  setControl,
  wallFrame,
  wantWall,
  watchScreen,
  type ScreenInput,
} from "@/server/phones/screens"
import { currentCodes, type CurrentCode } from "@/server/social/two-factor"

import { createErrorMessage } from "../error-message"

export type { CurrentCode, ScreenInput }

/**
 * A phone's screen window. Admin-only, and every call checks the phone is the
 * person's own: a picture is never handed to anyone else, and signed out the
 * window gets nothing at all.
 */
export const getScreenErrorMessage = createErrorMessage(
  {
    "does not exist": "That phone is not there any more.",
    "Control is off": "Control is off. Switch it on under the screen first.",
    "not keeping up": "The phone is not keeping up. Wait a moment.",
  },
  "That did not reach the phone. Please try again."
)

export type ScreenView = {
  /** The newest picture, when it is newer than the one the window has. */
  frame: { src: string; width: number; height: number; seq: number; at: Date } | null
  /** Until when a person controls the phone, or null when control is off. */
  controlUntil: Date | null
  /** The current authenticator code of each account on the phone that has one saved. */
  codes: CurrentCode[]
  /** The newest code texted to the phone in the last ten minutes, never stored. */
  texted: { code: string; from: string; at: Date } | null
}

const screenFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ id: z.string().min(1), after: z.number().int().min(0) }))
  .handler(async ({ context, data }): Promise<ScreenView> => {
    const [phone] = await ownedPhones(context.user.id, [data.id])
    if (!phone) throw new Error("That phone does not exist.")
    const { frame, text } = watchScreen(data.id)
    const now = new Date()
    return {
      frame:
        frame && frame.seq > data.after
          ? { src: `data:image/jpeg;base64,${frame.jpeg}`, width: frame.width, height: frame.height, seq: frame.seq, at: new Date(frame.at) }
          : null,
      controlUntil: phone.controlUntil && phone.controlUntil > now ? phone.controlUntil : null,
      codes: await currentCodes(context.user.id, { phoneId: data.id }),
      texted: text ? { code: text.code, from: text.from, at: new Date(text.at) } : null,
    }
  })

/** The newest picture after `after`, the control state and the codes. Asked a few times a second. */
export function loadScreen(id: string, after: number) {
  return screenFn({ data: { id, after } })
}

const controlFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ id: z.string().min(1), on: z.boolean() }))
  .handler(async ({ context, data }): Promise<{ controlUntil: Date | null }> => ({
    controlUntil: await setControl(context.user.id, data.id, data.on),
  }))

export function setScreenControl(id: string, on: boolean) {
  return controlFn({ data: { id, on } })
}

const fraction = z.number().min(0).max(1)
const inputShape = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("tap"), x: fraction, y: fraction }),
  z.object({ kind: z.literal("swipe"), x1: fraction, y1: fraction, x2: fraction, y2: fraction }),
  z.object({ kind: z.literal("text"), text: z.string().min(1).max(500) }),
  z.object({ kind: z.literal("key"), key: z.enum(["back", "home", "recents", "enter", "delete"]) }),
])

const inputFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ id: z.string().min(1), input: inputShape }))
  .handler(async ({ context, data }): Promise<void> => sendScreenInput(context.user.id, data.id, data.input))

/** A tap, a swipe, typing or a key, sent only while control is on. */
export function sendToScreen(id: string, input: ScreenInput) {
  return inputFn({ data: { id, input } })
}

const closeFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ id: z.string().min(1) }))
  .handler(async ({ context, data }): Promise<void> => {
    const [phone] = await ownedPhones(context.user.id, [data.id])
    if (!phone) return
    if (phone.controlUntil) await setControl(context.user.id, data.id, false)
    closeScreen(data.id)
  })

/** The window closed: control lets go and the rack stops sending pictures. */
export function closeScreenWindow(id: string) {
  return closeFn({ data: { id } })
}

export type WallView = {
  phones: Array<{
    id: string
    name: string
    status: PhoneStatus
    /** The newest small picture, or null for a held or offline phone, or before the first picture arrives. */
    src: string | null
    /** When that picture was taken, or null. */
    at: Date | null
  }>
}

const wallFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<WallView> => {
    wantWall(context.user.id)
    const phones = await listPhones(context.user.id)
    return {
      phones: phones.map((phone) => {
        const frame = phone.status === "connected" || phone.status === "busy" ? wallFrame(phone.id) : null
        return {
          id: phone.id,
          name: phone.name,
          status: phone.status,
          src: frame ? `data:image/jpeg;base64,${frame.jpeg}` : null,
          at: frame ? new Date(frame.at) : null,
        }
      }),
    }
  })

/**
 * The wall of every phone (part 57): one small picture of each connected
 * phone, asked for every 5 seconds while the wall is open. Asking is what
 * keeps the rack sending; ten seconds without an ask and it stops.
 */
export function loadWall() {
  return wallFn()
}
