import type { LinkedinFindView } from "@/lib/api/social/linkedin"
import { shortCount } from "@/lib/social/x/wording"

/**
 * The few words only the LinkedIn screens use: names, counts and states as
 * they read on screen. X's shared ones (`../x/x-words.ts`) are imported where
 * they read the same. Kept apart from the components so each screen file
 * holds components only.
 */

/** An account's name as LinkedIn's address writes it, or what to do when it has none yet. */
export function linkedinAccountName(slug: string): string {
  return slug ? `in/${slug}` : "Not signed in yet"
}

/** "1.2K followers", or nothing before the first reading. */
export function linkedinFollowersText(followers: number | null): string | null {
  return followers === null ? null : `${shortCount(followers)} ${followers === 1 ? "follower" : "followers"}`
}

/** The writer of a post, with their job title: "Jane Doe, Founder at Acme". */
export function writerWords(find: Pick<LinkedinFindView, "author">): string {
  const name = find.author.name || (find.author.slug ? `${find.author.kind === "company" ? "company/" : "in/"}${find.author.slug}` : "Someone")
  return find.author.headline ? `${name}, ${find.author.headline}` : name
}
