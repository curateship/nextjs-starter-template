import { daysBetween } from "@/lib/format/format-time"
import type { BrowserStatus } from "@/lib/api/social/account"
import type { AccountView } from "@/server/social/accounts"
import type { FindThread } from "@/lib/social/options"

/**
 * The sentences the Reddit screens put in front of a person.
 *
 * Their own file for two reasons. One, a file that exports both components and
 * plain functions loses React's fast refresh, so editing a sentence would
 * reload the whole page. Two, these are the wordings most worth testing and
 * least worth rendering a component to check.
 *
 * Every one of them has the same job: say what is true and what to do about
 * it. "Could not post" is not one of these; "the browser is not signed in to
 * Reddit, open it in Settings and sign in once" is.
 */

/** Just enough of a post for the wording below. */
type FindLike = { thread: FindThread | null }

/**
 * Why Post cannot be pressed, in words, or null when it can.
 *
 * Every one of these is something a person goes and fixes, so each says what
 * to do rather than just refusing. A button that is simply off with no reason
 * beside it is the thing this avoids.
 */
export function postingBlockedReason(
  status: BrowserStatus,
  detail: FindLike | null
): string | null {
  if (detail && detail.thread === null) {
    return "Read the replies first, so the comment does not repeat one of them."
  }
  if (status.blocked) {
    return status.reason
      ? `Reddit is asking the browser something: ${status.reason}. Open the browser in Settings and clear it.`
      : "Reddit is showing a challenge. Open the browser in Settings and clear it."
  }
  if (!status.handle) {
    return "The browser is not signed in to Reddit. Open it in Settings and sign in once."
  }
  return null
}

/** What the browser is doing, as one sentence a person can act on. */
export function describeBrowser(
  status: BrowserStatus | null,
  account: AccountView | null
): string {
  if (!account) {
    return "Save this page once and the browser can be opened."
  }
  if (!status?.streamUrl) {
    return account.handle
      ? `No browser is open. The last sign-in was u/${account.handle}, and those cookies are still stored.`
      : "No browser is open, and Reddit has never been signed in to."
  }
  if (status.blocked) {
    return `The browser is open and Reddit is asking it something. ${status.reason || "Open the window and clear it."}`
  }
  if (!status.handle) {
    return "The browser is open but signed out. Open the window and sign in to Reddit."
  }
  return `The browser is open and signed in as u/${status.handle}.`
}

/**
 * When a post went up, in the words the list column uses.
 *
 * Whole days apart rather than hours, through the shell's own `daysBetween`,
 * because 11pm and 1am are an hour apart and reading as a day apart is what
 * makes a date column feel wrong.
 */
export function postedDateText(postedAt: Date | null, now: Date = new Date()): string {
  if (!postedAt) return "—"
  const days = daysBetween(postedAt, now)
  if (days <= 0) return "Today"
  if (days === 1) return "Yesterday"
  if (days < 7) return `${days} days ago`
  if (days < 14) return "Last week"
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`
  return `${Math.floor(days / 30)} months ago`
}

/**
 * What a saved keyword searches, as one line under its name.
 *
 * Says all three things a search is made of, because a keyword that quietly
 * searches one subreddit looks the same as one that searches Reddit otherwise.
 */
export function keywordScopeText(input: {
  postCount: number
  subreddits: string[]
  timeWindow: string
}): string {
  const windows: Record<string, string> = {
    hour: "Past hour",
    day: "Past day",
    week: "Past week",
    month: "Past month",
    year: "Past year",
    all: "Any time",
  }
  const where = input.subreddits.length
    ? input.subreddits.map((name) => `r/${name}`).join(", ")
    : "All of Reddit"

  return [
    `${input.postCount} ${input.postCount === 1 ? "post" : "posts"}`,
    windows[input.timeWindow] ?? input.timeWindow,
    where,
  ].join(" · ")
}


/**
 * What an empty list of posts says, and it is never the same sentence twice.
 *
 * "Nothing here" and "I have not looked yet" are different answers, and so is
 * "you have not replied to anything". Each one tells a person what to do next
 * rather than leaving them to work out which of the three they are looking at.
 */
export function emptyFindsWords(
  loading: boolean,
  hasKeyword: boolean,
  tab: "new" | "commented" | "skipped"
): string {
  if (loading) return "Reading the posts"
  if (!hasKeyword) return "Pick a keyword on the left, or add one."
  if (tab === "commented") return "You have not replied to anything here yet."
  if (tab === "skipped") return "You have not skipped anything here."
  return "Nothing found for this keyword yet. Press the search button beside it."
}


export type PostBlock = { text: string; quoted: boolean }

/**
 * Breaks a Reddit post into paragraphs, keeping track of which are quotes.
 *
 * Reddit marks a quoted line with a leading `>`, and runs of them are one
 * quote. A post built mostly of quotes — somebody pasting a thread back into
 * their own post — reads as a wall of stray angle brackets without this.
 *
 * Blank lines part one block from the next, and a `>` on its own is a blank
 * line inside a quote rather than the end of it.
 */
export function splitIntoBlocks(body: string): PostBlock[] {
  const blocks: PostBlock[] = []
  let current: { lines: string[]; quoted: boolean } | null = null

  const flush = () => {
    if (!current) return
    // Runs of blank lines collapse to one. Reddit renders them that way, and a
    // post made of quoted lines carries a bare ">" between every paragraph —
    // left alone those became finger-deep gaps down the panel.
    const text = current.lines
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
    if (text) blocks.push({ text, quoted: current.quoted })
    current = null
  }

  for (const raw of body.split("\n")) {
    const line = raw.trimEnd()
    const quoted = line.trimStart().startsWith(">")
    const content = quoted ? line.replace(/^\s*>\s?/, "") : line

    // A blank line ends a paragraph, but a bare ">" is a blank line inside a
    // quote and must not end it.
    if (!content.trim() && !quoted) {
      flush()
      continue
    }

    if (!current || current.quoted !== quoted) {
      flush()
      current = { lines: [], quoted }
    }
    current.lines.push(content)
  }

  flush()
  return blocks
}
