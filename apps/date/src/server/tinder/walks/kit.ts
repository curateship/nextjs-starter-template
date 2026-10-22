import type { PhoneActionKind, StopReason } from "@/lib/dating/options"
import type { PhoneAnswer } from "@/server/phone/actions"
import type { CustomShellDb } from "@/server/db"

import type { AppScreens } from "../app-screens"
import { allWords, center, findNode, isVisible, screenFromAnswer, type NodeMatch, type ScreenNode, type ScreenRead } from "../screen"

/**
 * What every walk is built from: one plain action on the phone at a time,
 * and after every one that reads the screen, the checks that stop a walk. A
 * stop screen (out of likes, a ban and the rest) stops the profile until
 * Resume. Another app in front fails the walk and stops nothing: the phone
 * was picked up, which is normal. On Facebook, a screen outside Dating stops
 * the profile too (part 3 of "facebook/01"), and an app that froze is closed
 * and opened again once (part 6).
 *
 * The kit drives whichever app the walk's profile is: the words it looks for
 * come from that app's `AppScreens`.
 */

/** Sends one plain action to the phone and waits for its answer. */
export type PhoneDriver = (kind: PhoneActionKind, payload: Record<string, unknown>, timeLimitSeconds: number) => Promise<PhoneAnswer>

/** The phone a walk runs on, and the profile whose walk it is. */
export type WalkPhone = { id: string; userId: string; workspaceId: string; name: string; accountId: string }

export type WalkContext = {
  phone: WalkPhone
  /** The app the profile is, and how its screens look. */
  app: AppScreens
  walkId: string
  drive: PhoneDriver
  db: CustomShellDb
  now: () => Date
}

/** One walk: what it does on the phone, from its input, and what it found or did. */
export type WalkRunner = (ctx: WalkContext, kit: WalkKit, input: Record<string, unknown>, askedBy: "member" | "ai") => Promise<Record<string, unknown>>

/** A walk that could not finish, with the reason in words and the last screen it saw. */
export class WalkError extends Error {
  readonly shot: Buffer | null
  constructor(message: string, shot: Buffer | null = null) {
    super(message)
    this.name = "WalkError"
    this.shot = shot
  }
}

/** A screen of the app's that stops the profile until Resume. */
export class StopScreenError extends Error {
  readonly reason: StopReason
  readonly words: string
  readonly shot: Buffer | null
  constructor(reason: StopReason, words: string, shot: Buffer | null) {
    super(`Stopped on the app's screen: ${reason}`)
    this.name = "StopScreenError"
    this.reason = reason
    this.words = words
    this.shot = shot
  }
}

/**
 * The app froze: Android says it isn't responding, or its screen stayed
 * empty on a second look. The walk closes it, opens it again and starts over
 * once (part 6 of "facebook/01"), unless it already typed something or
 * pressed something that can't be taken back.
 */
export class FrozenError extends Error {
  readonly shot: Buffer | null
  constructor(words: string, shot: Buffer | null) {
    super(words)
    this.name = "FrozenError"
    this.shot = shot
  }
}

/** A screen read and the picture of it. */
export type Seen = { screen: ScreenRead; shot: Buffer | null }

/** How long the app takes to draw after a tap or a swipe, in milliseconds. */
const SETTLE_MS = 700

/** Android's own box over an app that stopped answering. */
const NOT_RESPONDING = /(isn'?t|is not) responding|keeps stopping/i

/** How long a second look at an empty screen waits, in milliseconds, before the app counts as frozen. */
const BLANK_SECOND_LOOK_MS = 2_500

/** The friendly name of an app the phone showed instead of the profile's. */
function appName(packageName: string): string {
  if (!packageName) return "another screen"
  if (/launcher|home/i.test(packageName)) return "the home screen"
  if (/systemui/i.test(packageName)) return "Android's notification shade"
  if (/permissioncontroller|packageinstaller/i.test(packageName)) return "an Android permission question"
  return packageName
}

/** A screen of the app's with nothing written or labelled on it: still drawing, or frozen. */
function isBlank(screen: ScreenRead): boolean {
  return !screen.nodes.some((node) => isVisible(node, screen) && (node.text.trim() || node.desc.trim()))
}

export function walkKit(ctx: WalkContext) {
  const app = ctx.app
  let lastSeen: Seen | null = null
  /** While the app is being opened and brought to its dating screens, a screen outside them is expected. */
  let arriving = false
  /** Something was typed, or pressed that can't be taken back, during this walk, so it is never started over. */
  let committed = false
  /** What the app's own steps noticed on the way, such as the name Facebook's menu shows. */
  const noticed = new Map<string, string>()

  function check(seen: Seen) {
    const stop = app.stopScreen(seen.screen)
    if (stop) throw new StopScreenError(stop.reason, stop.words, seen.shot)
    const words = allWords(seen.screen)
    if (NOT_RESPONDING.test(words) && (seen.screen.package === "android" || seen.screen.package === app.packageName)) {
      throw new FrozenError(`${app.appName} stopped answering: Android said so on the phone.`, seen.shot)
    }
    if (seen.screen.package !== app.packageName) {
      throw new WalkError(
        `${app.appName} was not in front: the phone showed ${appName(seen.screen.package)}. This stopped there and nothing else was done.`,
        seen.shot
      )
    }
    if (!arriving && app.inside && !app.inside(seen.screen)) throw new StopScreenError("left_dating", words.slice(0, 1_000), seen.shot)
  }

  async function step(
    kind: PhoneActionKind,
    payload: Record<string, unknown>,
    options: { timeLimitSeconds?: number; checked?: boolean } = {}
  ): Promise<{ answer: Record<string, unknown>; seen: Seen | null }> {
    const { answer, screenshot } = await ctx.drive(kind, payload, options.timeLimitSeconds ?? 30)
    const screen = screenFromAnswer(answer)
    let seen = screen ? { screen, shot: screenshot ? Buffer.from(screenshot, "base64") : null } : null
    if (seen && app.blankMeansFrozen && seen.screen.package === app.packageName && isBlank(seen.screen)) {
      // Facebook draws slowly; only an empty screen on a second look counts as frozen.
      const again = await ctx.drive("read-screen", { settleMs: BLANK_SECOND_LOOK_MS }, 30)
      const second = screenFromAnswer(again.answer)
      if (second) seen = { screen: second, shot: again.screenshot ? Buffer.from(again.screenshot, "base64") : null }
      if (second && second.package === app.packageName && isBlank(second)) {
        lastSeen = seen
        throw new FrozenError(`${app.appName} showed an empty screen twice in a row.`, seen.shot)
      }
    }
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
    app,

    get lastSeen() {
      return lastSeen
    },

    /** Keeps something seen on the way, for the walk to read after. */
    notice(key: string, value: string) {
      noticed.set(key, value)
    },

    noticed(key: string): string | undefined {
      return noticed.get(key)
    },

    /** Whether this walk typed anything, or pressed something that can't be taken back (a like, a pass, Send, a report, an unmatch). */
    get committed() {
      return committed
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

    /**
     * A tap that can't be taken back, such as Like, Pass, Send like, a
     * report's Submit or an unmatch's confirm. From here on the walk is never
     * started over, because doing it again could like, report or unmatch twice.
     */
    async commit(node: ScreenNode, settleMs = SETTLE_MS): Promise<Seen> {
      committed = true
      return kit.tap(node, settleMs)
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

    /**
     * Drags a finger from one point to another along the screen, such as a
     * slider's thumb, then reads the screen. With `holdMs` the finger first
     * rests that long, a long press, which is how a photo is picked up.
     */
    async drag(from: { x: number; y: number }, to: { x: number; y: number }, settleMs = SETTLE_MS, holdMs = 0): Promise<Seen> {
      return needScreen(
        (
          await step("swipe", {
            x1: Math.round(from.x),
            y1: Math.round(from.y),
            x2: Math.round(to.x),
            y2: Math.round(to.y),
            durationMs: 450,
            ...(holdMs > 0 ? { holdMs } : {}),
            thenRead: true,
            settleMs,
          })
        ).seen,
        "a drag"
      )
    },

    async back(settleMs = SETTLE_MS): Promise<Seen> {
      return needScreen((await step("back", { thenRead: true, settleMs })).seen, "pressing back")
    },

    async type(node: ScreenNode, text: string): Promise<Seen> {
      committed = true
      return needScreen((await step("type", { node: node.id, text, thenRead: true, settleMs: 400 })).seen, "typing")
    },

    /**
     * Brings the profile's app to the front and onto its dating screens: for
     * Tinder its cards, for Facebook the Dating part of the app. Not installed
     * stops the profile; another app still in front after a second look
     * fails the walk.
     */
    async openApp(): Promise<Seen> {
      arriving = true
      try {
        const { answer, seen } = await step("open-app", { package: app.packageName, thenRead: true, settleMs: 1_800 }, { checked: false })
        if (answer.installed === false) throw new StopScreenError("tinder_missing", "", seen?.shot ?? null)
        // The app can take a moment longer to draw over the home screen.
        const first = seen && seen.screen.package === app.packageName ? seen : await kit.read()
        check(first)
        const arrived = await app.arrive(kit, first)
        arriving = false
        check(arrived)
        return arrived
      } finally {
        arriving = false
      }
    },

    /** Closes the app that froze; the next `openApp` starts it fresh. */
    async closeApp(): Promise<void> {
      await step("close-app", { package: app.packageName }, { checked: false })
    },

    /** Closes up to two offers the app put in the way, without buying anything. */
    async dismissOffers(seen: Seen): Promise<Seen> {
      let current = seen
      for (let tries = 0; tries < 2; tries += 1) {
        if (findNode(current.screen, app.words.like)) return current
        const offer = findNode(current.screen, app.words.dismissOffer)
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
      throw new WalkError(`Could not open ${app.appName}'s ${name} tab. The words for it may have changed.`, current.shot)
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
      if (!node) throw new WalkError(`Could not find ${what} on ${app.appName}'s screen. The words for it may have changed.`, seen.shot)
      return node
    },
  }
  return kit
}

export type WalkKit = ReturnType<typeof walkKit>

/** Whether this screen is the chat list, by the app's own headings. */
export function onChatList(app: AppScreens, screen: ScreenRead): boolean {
  return Boolean(findNode(screen, app.words.messagesHeading) || findNode(screen, app.words.newMatchesHeading))
}
