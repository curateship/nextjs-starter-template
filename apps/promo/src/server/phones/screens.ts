import { and, eq, gt, inArray } from "drizzle-orm"

import { CONTROL_HOLD_MS } from "@/lib/phones/options"
import { db as defaultDb, type CustomShellDb } from "@/server/db"

import { promoPhones } from "./schema"

/**
 * A phone's live screen, passed from the rack to a person's window and back.
 *
 * Tyler's choice, 14 Oct 2026: pictures a few times a second rather than
 * video. The rack program sends the newest picture of each phone someone is
 * watching to `/api/rack/screen` over the connection it already opens, and
 * takes back the taps and typing waiting for it in the same answer. The window
 * asks this server for the newest picture. Nothing at home is reachable.
 *
 * Kept in this process's memory, not the database: a picture is stale in a
 * second, writing three a second would only churn the database, and texted
 * codes must never be stored. Both the rack and the window talk to the web
 * server, which is one process, so they meet here. A restart loses only the
 * picture on screen, and the next one arrives a moment later.
 */

/** A window that has not asked for a picture this long ago is closed, and the rack stops sending. */
const WATCH_MS = 10_000

/** A texted code is shown this long after it arrived, then forgotten. */
const TEXT_KEEP_MS = 10 * 60_000

/** At most this many taps and keys wait for the rack at once. */
const MAX_WAITING_INPUTS = 50

export type ScreenInput =
  | { kind: "tap"; x: number; y: number }
  | { kind: "swipe"; x1: number; y1: number; x2: number; y2: number }
  | { kind: "text"; text: string }
  | { kind: "key"; key: "back" | "home" | "recents" | "enter" | "delete" }

export type ScreenFrame = { jpeg: string; width: number; height: number; seq: number; at: number }

export type TextedCode = { code: string; from: string; at: number }

type Screen = {
  watchedAt: number
  frame: ScreenFrame | null
  inputs: ScreenInput[]
  text: TextedCode | null
}

// On `globalThis` so the dev server's module reloads keep the windows open.
const holder = globalThis as unknown as { __promoPhoneScreens?: Map<string, Screen> }
const screens = (holder.__promoPhoneScreens ??= new Map<string, Screen>())

function screenOf(phoneId: string): Screen {
  let screen = screens.get(phoneId)
  if (!screen) {
    screen = { watchedAt: 0, frame: null, inputs: [], text: null }
    screens.set(phoneId, screen)
  }
  return screen
}

/** The window asked for a picture: the phone is being watched, and here is what there is. */
export function watchScreen(
  phoneId: string,
  now: number = Date.now()
): { frame: ScreenFrame | null; text: TextedCode | null } {
  const screen = screenOf(phoneId)
  screen.watchedAt = now
  if (screen.text && now - screen.text.at > TEXT_KEEP_MS) screen.text = null
  return { frame: screen.frame, text: screen.text }
}

/** The window closed: the rack stops sending, and nothing it was told to do is left waiting. */
export function closeScreen(phoneId: string): void {
  screens.delete(phoneId)
}

export function queueScreenInput(phoneId: string, input: ScreenInput): void {
  const screen = screenOf(phoneId)
  if (screen.inputs.length >= MAX_WAITING_INPUTS) throw new Error("The phone is not keeping up. Wait a moment.")
  screen.inputs.push(input)
}

/** Drops every tap and key still waiting, when control is switched off. */
export function dropScreenInputs(phoneId: string): void {
  const screen = screens.get(phoneId)
  if (screen) screen.inputs = []
}

/**
 * The rack's turn: it hands in pictures and texted codes for the phones it
 * was asked to show, and takes back which phones to show and the taps and
 * keys waiting for each. Taps are handed over only while a person still has
 * control, so a window whose control ran out, or was switched off, sends
 * nothing to the phone.
 */
export async function exchangeScreens(
  rack: { id: string; userId: string },
  input: {
    frames: Array<{ serial: string; jpeg: string; width: number; height: number }>
    texts: Array<{ serial: string; code: string; from: string }>
  },
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<{ wanted: string[]; inputs: Record<string, ScreenInput[]> }> {
  const phones = await db
    .select({ id: promoPhones.id, serial: promoPhones.serial, controlUntil: promoPhones.controlUntil })
    .from(promoPhones)
    .where(and(eq(promoPhones.userId, rack.userId), eq(promoPhones.rackId, rack.id)))
  const bySerial = new Map(phones.map((phone) => [phone.serial, phone]))

  for (const frame of input.frames) {
    const phone = bySerial.get(frame.serial)
    if (!phone) continue
    const screen = screenOf(phone.id)
    screen.frame = {
      jpeg: frame.jpeg,
      width: frame.width,
      height: frame.height,
      seq: (screen.frame?.seq ?? 0) + 1,
      at: now.getTime(),
    }
  }
  for (const text of input.texts) {
    const phone = bySerial.get(text.serial)
    if (phone) screenOf(phone.id).text = { code: text.code, from: text.from, at: now.getTime() }
  }

  const wanted: string[] = []
  const inputs: Record<string, ScreenInput[]> = {}
  for (const phone of phones) {
    const screen = screens.get(phone.id)
    if (!screen) continue
    if (now.getTime() - screen.watchedAt > WATCH_MS) {
      // A window that went quiet keeps nothing for the phone to do later.
      screen.inputs = []
      continue
    }
    wanted.push(phone.serial)
    if (screen.inputs.length && phone.controlUntil && phone.controlUntil > now) inputs[phone.serial] = screen.inputs
    screen.inputs = []
  }
  return { wanted, inputs }
}

/**
 * Switches control on or off. On holds the phone for fifteen minutes, and
 * every tap moves that on; the queue skips a held phone, so no job taps
 * while a person does. Off, or the window closing, lets jobs run again.
 */
export async function setControl(
  userId: string,
  phoneId: string,
  on: boolean,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<Date | null> {
  const controlUntil = on ? new Date(now.getTime() + CONTROL_HOLD_MS) : null
  const updated = await db
    .update(promoPhones)
    .set({ controlUntil })
    .where(and(eq(promoPhones.id, phoneId), eq(promoPhones.userId, userId)))
    .returning({ id: promoPhones.id })
  if (!updated.length) throw new Error("That phone does not exist.")
  if (!on) dropScreenInputs(phoneId)
  return controlUntil
}

/**
 * A tap or a key from the window. Refused unless control is on, checked here
 * and not only on the page, and each one keeps the hold for another fifteen
 * minutes.
 */
export async function sendScreenInput(
  userId: string,
  phoneId: string,
  input: ScreenInput,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  const held = await db
    .update(promoPhones)
    .set({ controlUntil: new Date(now.getTime() + CONTROL_HOLD_MS) })
    .where(and(eq(promoPhones.id, phoneId), eq(promoPhones.userId, userId), gt(promoPhones.controlUntil, now)))
    .returning({ id: promoPhones.id })
  if (!held.length) throw new Error("Control is off. Switch it on under the screen first.")
  queueScreenInput(phoneId, input)
}

/** The phones of these ids that the person owns, for a window to check before it shows anything. */
export async function ownedPhones(
  userId: string,
  ids: string[],
  db: CustomShellDb = defaultDb
): Promise<Array<{ id: string; controlUntil: Date | null }>> {
  if (!ids.length) return []
  return db
    .select({ id: promoPhones.id, controlUntil: promoPhones.controlUntil })
    .from(promoPhones)
    .where(and(eq(promoPhones.userId, userId), inArray(promoPhones.id, ids)))
}
