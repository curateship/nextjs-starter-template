/**
 * The phone farm's fixed lists and numbers, shared by the server, the
 * dashboard and the tests. The rack program keeps its own copy of the action
 * names in `rack/promo_rack.py`; a name on one list and not the other is
 * refused by whichever side does not know it.
 */

export type PhoneConnection = "sim" | "wifi"

export type PhoneActionStatus = "queued" | "running" | "done" | "failed" | "cancelled"

/**
 * What the dashboard says about a phone, worked out from the rows:
 * held by a person, offline, busy running an action, or connected and idle.
 */
export type PhoneStatus = "connected" | "offline" | "busy" | "held"

export const PHONE_STATUS_WORDS: Record<PhoneStatus, string> = {
  connected: "Connected",
  offline: "Offline",
  busy: "Busy",
  held: "Held",
}

/**
 * The actions Promo may ask the rack for. Nothing else is written or run.
 * The network routines (`reddit/search` and the rest) join this list in the
 * later phone farm steps.
 */
export const PHONE_ACTIONS = ["phone/list", "phone/health", "phone/android-version"] as const

export type PhoneAction = (typeof PHONE_ACTIONS)[number]

export const PHONE_ACTION_WORDS: Record<PhoneAction, string> = {
  "phone/list": "List the phones",
  "phone/health": "Health check",
  "phone/android-version": "Read the Android version from Settings",
}

/**
 * The rack checks in every 15 seconds. A phone not seen for 45 seconds, three
 * missed check-ins, is offline, so a phone pulled out or a rack switched off
 * shows within a minute.
 */
export const RACK_CHECK_IN_SECONDS = 15
export const PHONE_STALE_MS = 45_000

/** How long a pairing code works. */
export const RACK_CODE_MINUTES = 15

/** How far a signed message's clock may be from the server's, either way. */
export const RACK_CLOCK_WINDOW_SECONDS = 300

/** The bell notice's heading for a phone that needs a hand. */
export const PHONE_NOTICE_PREFIX = "Phone needs a hand: "

/** "slot 4", or empty when no slot was typed. */
export function slotWords(shelfSlot: string): string {
  const slot = shelfSlot.trim()
  return slot ? `slot ${slot}` : ""
}

/** The bounds Settings → Phones allows. Here because the tab draws them too. */
export const MAX_WORKING_RANGE = { min: 1, max: 50 } as const
export const SCREENSHOT_DAYS_RANGE = { min: 1, max: 90 } as const

/** A forgotten screen window with control on lets the phone go after this long without a tap. */
export const CONTROL_HOLD_MS = 15 * 60_000

/** A phone job's lane: `phone:` and the phone's id, so it never shares a profile's lane. */
export const PHONE_LANE_PREFIX = "phone:"

export function phoneLane(phoneId: string): string {
  return `${PHONE_LANE_PREFIX}${phoneId}`
}

/** The bell notice's heading while the rack is paused. */
export const RACK_PAUSED_NOTICE = "The rack is paused"
