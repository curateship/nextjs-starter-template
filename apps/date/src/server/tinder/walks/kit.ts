import { TINDER_PACKAGE, type PhoneActionKind, type StopReason } from "@/lib/dating/options"
import type { PhoneAnswer } from "@/server/phone/actions"
import type { CustomShellDb } from "@/server/db"

import { center, findNode, screenFromAnswer, type NodeMatch, type ScreenNode, type ScreenRead } from "../screen"
import { TINDER_WORDS } from "../screen-words"
import { stopScreen } from "../stop-screens"

/**
 * What every walk is built from: one plain action on the phone at a time,
 * and after every one that reads the screen, the two checks that stop a
 * walk. A stop screen (out of likes, a ban and the rest) stops the phone
 * until Resume. Another app in front fails the walk and stops nothing: the
 * phone was picked up, which is normal.
 */

/** Sends one plain action to the phone and waits for its answer. */
export type PhoneDriver = (kind: PhoneActionKind, payload: Record<string, unknown>, timeLimitSeconds: number) => Promise<PhoneAnswer>

export type WalkPhone = { id: string; userId: string; workspaceId: string; name: string }

export type WalkContext = {
  phone: WalkPhone
  walkId: string
  drive: PhoneDriver
  db: CustomShellDb
  now: () => Date
}

/** A walk that could not finish, with the reason in words and the last screen it saw. */
export class WalkError extends Error {
  readonly shot: Buffer | null
  constructor(message: string, shot: Buffer | null = null) {
    super(message)
    this.name = "WalkError"
    this.shot = shot
  }
}

/** A Tinder screen that stops everything until Resume. */
export class StopScreenError extends Error {
  readonly reason: StopReason
  readonly words: string
  readonly shot: Buffer | null
  constructor(reason: StopReason, words: string, shot: Buffer | null) {
    super(`Stopped on a Tinder screen: ${reason}`)
    this.name = "StopScreenError"
    this.reason = reason
    this.words = words
    this.shot = shot
  }
}

/** A screen read and the picture of it. */
export type Seen = { screen: ScreenRead; shot: Buffer | null }

/** How long Tinder takes to draw after a tap or a swipe, in milliseconds. */
const SETTLE_MS = 700

/** The friendly name of an app the phone showed instead of Tinder. */
function appName(packageName: string): string {
  if (!packageName) return "another screen"
  if (/launcher|home/i.test(packageName)) return "the home screen"
  if (/systemui/i.test(packageName)) return "Android's notification shade"
  if (/permissioncontroller|packageinstaller/i.test(packageName)) return "an Android permission question"
  return packageName
}

export function walkKit(ctx: WalkContext) {
  let lastSeen: Seen | null = null

  function check(seen: Seen) {
    const stop = stopScreen(seen.screen)
    if (stop) throw new StopScreenError(stop.reason, stop.words, seen.shot)
    if (seen.screen.package !== TINDER_PACKAGE) {
      throw new WalkError(
        `Tinder was not in front: the phone showed ${appName(seen.screen.package)}. This stopped there and nothing else was done.`,
        seen.shot
      )
    }
  }

  async function step(
    kind: PhoneActionKind,
    payload: Record<string, unknown>,
    options: { timeLimitSeconds?: number; checked?: boolean } = {}
  ): Promise<{ answer: Record<string, unknown>; seen: Seen | null }> {
    const { answer, screenshot } = await ctx.drive(kind, payload, options.timeLimitSeconds ?? 30)
    const screen = screenFromAnswer(answer)
    const seen = screen ? { screen, shot: screenshot ? Buffer.from(screenshot, "base64") : null } : null
    if (seen) {
      lastSeen = seen
      if (options.checked !== false) check(seen)
    }
    return { answer, seen }
  }

  function needScreen(seen: Seen | null, what: string): Seen {
    if (!seen) throw new WalkError(`The phone did not send the screen back after ${what}.`)
    return seen
  }

  const kit = {
    get lastSeen() {
      return lastSeen
    },

    /** Reads the screen as it is now. */
    async read(): Promise<Seen> {
      return needScreen((await step("read-screen", {})).seen, "reading it")
    },

    /** Taps the middle of a box, then reads the screen once it has settled. */
    async tap(node: ScreenNode, settleMs = SETTLE_MS): Promise<Seen> {
      const { x, y } = center(node.bounds)
      return needScreen((await step("tap", { x, y, thenRead: true, settleMs })).seen, "a tap")
    },

    async tapAt(x: number, y: number, settleMs = SETTLE_MS): Promise<Seen> {
      return needScreen((await step("tap", { x: Math.round(x), y: Math.round(y), thenRead: true, settleMs })).seen, "a tap")
    },

    /**
     * Moves the screen's content: "up" shows what is further down, the way a
     * thumb pushes a page up; "down" shows what is above.
     */
    async scroll(seen: Seen, direction: "up" | "down", settleMs = SETTLE_MS): Promise<Seen> {
      const { screenWidth: width, screenHeight: height } = seen.screen
      const x = Math.round(width / 2)
      const [from, to] = direction === "up" ? [0.72, 0.32] : [0.32, 0.72]
      return needScreen(
        (
          await step("swipe", {
            x1: x,
            y1: Math.round(height * from),
            x2: x,
            y2: Math.round(height * to),
            durationMs: 350,
            thenRead: true,
            settleMs,
          })
        ).seen,
        "a scroll"
      )
    },

    async back(settleMs = SETTLE_MS): Promise<Seen> {
      return needScreen((await step("back", { thenRead: true, settleMs })).seen, "pressing back")
    },

    async type(node: ScreenNode, text: string): Promise<Seen> {
      return needScreen((await step("type", { node: node.id, text, thenRead: true, settleMs: 400 })).seen, "typing")
    },

    /**
     * Brings Tinder to the front. Not installed stops the phone; another app
     * still in front after a second look fails the walk.
     */
    async openTinder(): Promise<Seen> {
      const { answer, seen } = await step(
        "open-app",
        { package: TINDER_PACKAGE, thenRead: true, settleMs: 1_800 },
        { checked: false }
      )
      if (answer.installed === false) throw new StopScreenError("tinder_missing", "", seen?.shot ?? null)
      if (seen && seen.screen.package === TINDER_PACKAGE) {
        check(seen)
        return kit.dismissOffers(seen)
      }
      // Tinder can take a moment longer to draw over the home screen.
      return kit.dismissOffers(await kit.read())
    },

    /** Closes up to two offers Tinder put in the way, without buying anything. */
    async dismissOffers(seen: Seen): Promise<Seen> {
      let current = seen
      for (let tries = 0; tries < 2; tries += 1) {
        if (findNode(current.screen, TINDER_WORDS.like)) return current
        const offer = findNode(current.screen, TINDER_WORDS.dismissOffer)
        if (!offer) return current
        current = await kit.tap(offer)
      }
      return current
    },

    /** Opens one of the bottom tabs, unless the screen already shows what that tab shows. */
    async goToTab(seen: Seen, tab: NodeMatch, arrived: (screen: ScreenRead) => boolean, name: string): Promise<Seen> {
      if (arrived(seen.screen)) return seen
      let current = seen
      // A full profile or a chat sits over the tabs: back out of it first, twice at most.
      for (let tries = 0; tries < 3; tries += 1) {
        const button = findNode(current.screen, tab)
        if (button) {
          current = await kit.dismissOffers(await kit.tap(button, 1_000))
          if (arrived(current.screen)) return current
        }
        if (tries < 2) current = await kit.back()
      }
      throw new WalkError(`Could not open Tinder's ${name} tab. The words for it may have changed.`, current.shot)
    },

    /** Whether a box matching this is on the screen. */
    has(seen: Seen, match: NodeMatch): boolean {
      return Boolean(findNode(seen.screen, match))
    },

    find(seen: Seen, match: NodeMatch): ScreenNode | null {
      return findNode(seen.screen, match)
    },

    /** The box, or a walk error naming what could not be found. */
    need(seen: Seen, match: NodeMatch, what: string): ScreenNode {
      const node = findNode(seen.screen, match)
      if (!node) throw new WalkError(`Could not find ${what} on Tinder's screen. The words for it may have changed.`, seen.shot)
      return node
    },

  }
  return kit
}

export type WalkKit = ReturnType<typeof walkKit>

/** Whether this screen is the card stack: the like and pass buttons are both on it. */
export function onDiscover(screen: ScreenRead): boolean {
  return Boolean(findNode(screen, TINDER_WORDS.like) && findNode(screen, TINDER_WORDS.pass))
}

/** Whether this screen is the chat list. */
export function onChatList(screen: ScreenRead): boolean {
  return Boolean(findNode(screen, TINDER_WORDS.messagesHeading) || findNode(screen, TINDER_WORDS.newMatchesHeading))
}
