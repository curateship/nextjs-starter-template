import type { XFindView } from "@/lib/api/social/x"
import { X_REACH_WORDS, type XReach } from "@/lib/social/x/options"
import { shortCount } from "@/lib/social/x/wording"

/**
 * The few words the X screens share: names, counts and states as they read
 * on screen. Kept apart from the components so each screen file holds
 * components only.
 */

/** An account's name as X writes it, or what to do when it has none yet. */
export function xAccountName(handle: string): string {
  return handle ? `@${handle}` : "Not signed in yet"
}

/** "1.2K followers", or nothing before the first reading. */
export function xFollowersText(followers: number | null): string | null {
  return followers === null ? null : `${shortCount(followers)} ${followers === 1 ? "follower" : "followers"}`
}

/** The person who posted it, as X writes them. */
export function authorWords(find: Pick<XFindView, "author">): string {
  return find.author.name ? `${find.author.name} @${find.author.handle}` : `@${find.author.handle}`
}

/** "1,204", or "?" while a figure has never been read. */
export function figure(value: number | null): string {
  return value === null ? "?" : value.toLocaleString("en-US")
}

/** The word for a count: "view" for exactly 1, "views" for anything else, unread included. */
export function countWord(value: number | null, one: string, many: string): string {
  return value === 1 ? one : many
}

/** "1 view", "1,204 views", "? views" while it has never been read. */
export function counted(value: number | null, one: string, many: string): string {
  return `${figure(value)} ${countWord(value, one, many)}`
}

/** Views, likes and replies in one line, or one "not read yet" when none of them has been read. */
export function numbersLine(row: { views: number | null; likes: number | null; replyCount: number | null }): string {
  if (row.views === null && row.likes === null && row.replyCount === null) return "Views and likes not read yet"
  return [counted(row.views, "view", "views"), counted(row.likes, "like", "likes"), counted(row.replyCount, "reply", "replies")].join(" · ")
}

/** "Still up", "Gone", "Not checked yet", and the states before it reached X. */
export function upWords(row: { deletedAt: Date | null; status: string; stillVisible: boolean | null }): string {
  if (row.deletedAt) return "Deleted"
  if (row.status === "waiting") return "Waiting to go"
  if (row.status === "failed") return "Did not go out"
  if (row.status === "draft") return "Draft"
  if (row.stillVisible === null) return "Not checked yet"
  return row.stillVisible ? "Still up" : "Gone"
}

/** "Posts at 14:00", with the day when it is not today. */
export function postsAtText(at: Date | string): string {
  const date = new Date(at)
  const today = new Date().toDateString() === date.toDateString()
  const time = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
  return today ? `Posts at ${time}` : `Posts ${date.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })} at ${time}`
}

/** What the daily look found, in a few words, and that it is a guess. */
export function xReachWords(reach: XReach | ""): string {
  return reach ? X_REACH_WORDS[reach] : "Not looked at yet"
}

/** The tooltip on the reach words: hidden and folded are Promo's guess, because X never says. */
export const X_REACH_HINT = "Promo's best guess from its daily look for the account's latest reply, by search and under its post. X never says."
