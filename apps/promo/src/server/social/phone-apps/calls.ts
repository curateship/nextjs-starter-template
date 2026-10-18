import { z } from "zod"

import { call, type CommandTarget } from "@/server/browser/command"
import type { PhoneAppNetwork } from "@/lib/social/networks"

/**
 * The steps the rack takes in the Instagram and TikTok apps, and in the
 * Reddit app's messages, each answer checked against its shape here so a
 * changed answer fails with a sentence rather than three layers later.
 *
 * The routine names are the network's own (`instagram/post`,
 * `tiktok/post`), the same steps in two apps, so one shape serves both. The
 * rack's side is `rack/promo_rack.py`, and every name is on
 * `PHONE_APP_ROUTINES` in `src/lib/phones/options.ts`.
 */

/** A check, a reading or a profile change: the app opened, a few screens, back home. */
const READ_TIMEOUT_MS = 5 * 60_000

/**
 * The health visit reads the profile, the Account status page, and the
 * numbers of up to a dozen posts, each opened by its link: about four
 * minutes. The health job's claim lasts 25 minutes (`jobs.ts`), so a reading
 * still running is never handed out a second time.
 */
const HEALTH_TIMEOUT_MS = 6 * 60_000

/**
 * A post is the file downloaded and put in the gallery, the app's own share
 * screen, the caption typed at a person's pace, the upload, and a little feed
 * afterwards. The same allowance as a Reddit comment's visit.
 */
const POST_TIMEOUT_MS = 930_000

/** A reply: the conversation or the comment found, the words typed, Send pressed once, a little feed. */
const REPLY_TIMEOUT_MS = 10 * 60_000

const handle = z.string().nullable()

const quickStateShape = z.object({
  /** False when the app could not be read, which is never written down as signed out. */
  checked: z.boolean(),
  handle,
})

const count = z.number().int().min(0).nullable().default(null)

const appHealthShape = z.object({
  handle,
  followers: count,
  following: count,
  posts: count,
  /**
   * What the app's Account status page says about being shown to people who
   * do not follow the account. `read` false when the page could not be
   * reached, which is never taken as "not shadowbanned".
   */
  shadowban: z.object({ read: z.boolean(), hidden: z.boolean(), words: z.string().default("") }),
  /** The numbers of each post asked about, by its link. */
  numbers: z
    .array(z.object({ url: z.string(), views: count, likes: count, comments: count }))
    .default([]),
  /** The app's inbox showed something unread, which a missed notification would leave waiting. */
  inboxWaiting: z.boolean().default(false),
})


const profileShape = z.object({
  /** The fields the app took, by name. */
  applied: z.array(z.enum(["displayName", "bio", "link", "picture"])),
  /** The bio read back off the profile afterwards, to prove it took. Null when unread. */
  bioAfter: z.string().nullable().default(null),
})

const postShape = z.object({
  /** The post's link, read off the app after posting, or "" when the app would not give it. */
  postUrl: z.string(),
})

const line = z.object({ from: z.string(), text: z.string(), mine: z.boolean() })

const inboxShape = z.object({
  conversations: z.array(z.object({ thread: z.string(), lines: z.array(line) })).default([]),
  comments: z.array(z.object({ thread: z.string(), author: z.string(), text: z.string() })).default([]),
})

export type AppInboxReading = z.infer<typeof inboxShape>

const replyShape = z.object({ sent: z.boolean() })

/** Who the app is signed in as, read after every job; an app that cannot be read says "not checked". */
export function appQuickState(target: CommandTarget, network: PhoneAppNetwork) {
  return call(target, `${network}/quick_state`, {}, quickStateShape, READ_TIMEOUT_MS)
}

/**
 * The daily reading: the profile's figures, the Account status page, and the
 * numbers of the posts named, opened by their links.
 */
export function appHealth(target: CommandTarget, network: PhoneAppNetwork, args: { postUrls: string[] }) {
  return call(target, `${network}/health`, { ...args }, appHealthShape, HEALTH_TIMEOUT_MS)
}

/** Changes the fields given in the app's Edit profile. Only ever after a person pressed Apply. */
export function appProfile(
  target: CommandTarget,
  network: PhoneAppNetwork,
  args: { displayName: string | null; bio: string | null; link: string | null; pictureUrl: string | null }
) {
  return call(target, `${network}/profile`, { ...args }, profileShape, READ_TIMEOUT_MS)
}

/** Posts one photo or video with its caption. Only ever after a person pressed Post. */
export function appPost(
  target: CommandTarget,
  network: PhoneAppNetwork,
  args: { mediaUrl: string; mediaKind: "photo" | "video"; caption: string; mediaFromSafari?: true }
) {
  return call(target, `${network}/post`, { ...args }, postShape, POST_TIMEOUT_MS)
}

/**
 * Reads what arrived: the conversations and, on Instagram and TikTok, the
 * comments under the account's own posts. `via` "notification" taps the
 * app's newest notification first, the way a person answers the buzz.
 * `handle` is the account's own name, so its caption is not read as a
 * comment.
 */
export function appInbox(
  target: CommandTarget,
  network: PhoneAppNetwork | "reddit",
  args: { kind: "message" | "comment"; via: "notification" | "inbox"; handle: string }
) {
  return call(target, `${network}/inbox`, { ...args }, inboxShape, READ_TIMEOUT_MS)
}

/**
 * Answers one conversation or one comment. Only ever after a person pressed
 * Send. `quote` is the line being answered, so the phone finds the right one.
 */
export function appReply(
  target: CommandTarget,
  network: PhoneAppNetwork | "reddit",
  args: { kind: "message" | "comment"; thread: string; author: string; quote: string; text: string }
) {
  const routine = network === "reddit" ? "reddit/reply_message" : `${network}/reply`
  return call(target, routine, { ...args }, replyShape, REPLY_TIMEOUT_MS)
}
