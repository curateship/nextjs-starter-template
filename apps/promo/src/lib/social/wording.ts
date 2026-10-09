import { daysBetween } from "@/lib/format/format-time"
import type { BrowserStatus } from "@/lib/api/social/account"
import { NO_PROFILE_MESSAGE, type FindThread, type ProfileCheck } from "@/lib/social/options"

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

/** Why Post is off, in words a person can act on. */
export type BlockedReason = { text: string }

/**
 * Why Post cannot be pressed, in words, or null when it can.
 *
 * Every one of these is something a person goes and fixes, so each says what
 * to do rather than just refusing. A browser problem names the profile it is
 * in and the dashboard to find it on. The panel shows it in the Post button's
 * tooltip.
 */
export function postingBlockedReason(
  status: BrowserStatus,
  detail: FindLike | null
): BlockedReason | null {
  if (detail && detail.thread === null) {
    return { text: "Read the replies first, so the comment does not repeat one of them." }
  }
  const profile = status.profile
  if (!profile) return { text: NO_PROFILE_MESSAGE }
  if (status.blocked) {
    return {
      text: status.reason
        ? `Reddit is asking the browser something: ${status.reason}. Open the profile ${profile.name} on the Browser profiles dashboard and clear it.`
        : `Reddit is showing a challenge. Open the profile ${profile.name} on the Browser profiles dashboard and clear it.`,
    }
  }
  if (!status.handle) {
    return {
      text: `The browser is not signed in to Reddit. Open the profile ${profile.name} on the Browser profiles dashboard and sign in once.`,
    }
  }
  return null
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

/** "Reddit u/name", or "a Reddit account" when nobody has signed in yet. */
function accountName(account: { platform: string; handle: string }): string {
  const network = account.platform === "reddit" ? "Reddit" : account.platform
  if (!account.handle) return `a ${network} account`
  return account.platform === "reddit" ? `Reddit u/${account.handle}` : `${network} ${account.handle}`
}

/** "Reddit u/a and Reddit u/b", for the accounts drafting with a voice. */
export function voiceUsersList(usedBy: ReadonlyArray<{ platform: string; handle: string }>): string {
  const names = usedBy.map(accountName)
  return names.length <= 1
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`
}

/** Who drafts with a voice, as one sentence. */
export function voiceUsersWords(usedBy: ReadonlyArray<{ platform: string; handle: string }>): string {
  return usedBy.length ? `Used by ${voiceUsersList(usedBy)}.` : "No account uses it yet."
}

/** What deleting voices does to the accounts using them, as one sentence. */
export function voiceDeleteWords(usedBy: ReadonlyArray<{ platform: string; handle: string }>): string {
  if (!usedBy.length) return "No account uses it, so nothing else changes."
  const list = voiceUsersList(usedBy)
  return `${list.charAt(0).toUpperCase()}${list.slice(1)} ${usedBy.length === 1 ? "loses it" : "lose it"}, and will draft plainly, never mentioning what you make, until given another voice in Settings.`
}

/** "1 post", "4 posts": the count a block or an unblock reports. */
export function postsWord(count: number): string {
  return `${count} ${count === 1 ? "post" : "posts"}`
}

/**
 * How old a Reddit account is, in the unit a person would use: "12 days
 * old", "5 months old", "3 years old".
 */
export function accountAgeText(createdAt: Date, now: Date = new Date()): string {
  const days = Math.max(0, daysBetween(createdAt, now))
  if (days < 60) return `${days} ${days === 1 ? "day" : "days"} old`
  const months = Math.floor(days / 30.44)
  if (months < 24) return `${months} months old`
  return `${Math.floor(days / 365.25)} years old`
}

/**
 * What the profile check saw, in words, and whether it is worth a second look.
 *
 * Says what loaded and what did not. A shadowban is never stated as a fact:
 * Reddit sends no notice of one, so the closest anyone outside Reddit gets is
 * a profile that loads for its owner and not for a stranger. When Reddit
 * would not answer the signed-out request at all, the reading says nothing
 * either way, and the words say exactly that.
 */
export function profileCheckWords(check: ProfileCheck): { text: string; concern: boolean } {
  const name = `u/${check.handle}`
  if (check.suspended) {
    return { text: `Reddit marks ${name} as suspended.`, concern: true }
  }
  if (check.signedOutFound) {
    return { text: `A signed-out visitor can see ${name}.`, concern: false }
  }
  if (check.signedOutStatus === 404 && check.signedInFound) {
    return {
      text: `${name} loads for you, but Reddit told a signed-out visitor it does not exist. That is what a shadowbanned account looks like from outside. Reddit never confirms one, so open reddit.com/user/${check.handle} in a private window to see it for yourself.`,
      concern: true,
    }
  }
  if (check.signedOutStatus === 404) {
    return {
      text: `Reddit answered "not found" for ${name} both signed in and signed out.`,
      concern: true,
    }
  }
  return {
    text: check.signedOutStatus
      ? `Reddit refused the signed-out request (status ${check.signedOutStatus}), so this reading says nothing either way.`
      : "The signed-out request got no answer, so this reading says nothing either way.",
    concern: false,
  }
}
