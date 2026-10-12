import { daysBetween } from "@/lib/format/format-time"
import type { BrowserStatus } from "@/lib/api/social/account"
import {
  NO_PROFILE_MESSAGE,
  type FindThread,
  type ProfileCheck,
  type SubredditRule,
} from "@/lib/social/options"
import { clockText, knownTimeZone, localDateKey, localMinutes } from "@/lib/social/waking"
import type { PostingState } from "@/server/social/posting"

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
  detail: FindLike | null,
  now: Date = new Date()
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
  const refusal = status.posting ? postingRefusalText(status.posting, now) : null
  return refusal ? { text: refusal } : null
}

/**
 * Why the account may not comment yet, or null when it may: still warming
 * up, or a young account at its pace limit. The server refuses Post with the
 * same words on the account's own clock, naming it; the screen shows them on
 * the viewer's.
 */
export function postingRefusalText(
  state: PostingState,
  now: Date = new Date(),
  timeZone?: string
): string | null {
  if (state.warmUp.ageUnknown) {
    return "Promo has not read how old this account is, so it cannot tell when the warm-up ends. Press Check now on Settings → Reddit account, then try again."
  }
  if (state.warmUp.endsAt && state.warmUp.endsAt > now) {
    return `This account is still warming up. Its first comment is allowed ${whenText(state.warmUp.endsAt, now, timeZone)}.`
  }
  const limit = state.limit
  if (!limit) return null
  const allowed = limit.limit === "hour" ? state.youngPerHour : state.youngPerDay
  const span = limit.limit === "hour" ? "an hour" : "a day"
  if (!limit.nextAllowedAt) {
    return `A young account may send ${allowed} ${allowed === 1 ? "comment" : "comments"} ${span}, and that many are sent or waiting to go. Post again once the waiting ones have gone.`
  }
  if (limit.nextAllowedAt <= now) return null
  return `A young account may send ${allowed} ${allowed === 1 ? "comment" : "comments"} ${span}, and this one has. The next one is allowed ${whenText(limit.nextAllowedAt, now, timeZone)}.`
}

/** "3 comments in the last hour, 11 today." Plain counts, no gauge. */
export function paceLineText(state: Pick<PostingState, "lastHour" | "lastDay">): string {
  const hour = `${state.lastHour} ${state.lastHour === 1 ? "comment" : "comments"} in the last hour`
  return `${hour}, ${state.lastDay} today.`
}

/**
 * The warning past the per-hour number, or null under it. It warns and never
 * refuses: pace is a judgement, and blocking it would stop the one comment
 * that mattered.
 */
export function paceWarningText(state: Pick<PostingState, "lastHour" | "warnPerHour">): string | null {
  if (state.lastHour < state.warnPerHour) return null
  return `That would be the ${ordinal(state.lastHour + 1)} comment this hour. New accounts get banned for less.`
}

/** What a comment held back for the account's morning says on the post. */
export function waitingCommentText(runAfter: Date, handle: string | null, now: Date = new Date()): string {
  const who = handle ? `u/${handle}'s` : "the account's"
  return `Your comment is waiting for ${who} waking hours and goes ${whenText(runAfter, now)}.`
}

/**
 * "today at 14:20", "tomorrow at 8:00", "on Wed 15 Oct at 8:00": a moment in
 * the words a person uses, on the viewer's clock. Given `timeZone`, on that
 * clock instead and saying so ("tomorrow at 8:00 Europe/Berlin time"), since
 * the reader's own clock may differ: the server words Post's refusals on the
 * account's clock, because it cannot know the viewer's.
 */
export function whenText(at: Date, now: Date = new Date(), timeZone?: string): string {
  const zone = knownTimeZone(timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone)
  const clock = clockText(localMinutes(at, zone)) + (timeZone ? ` ${zone} time` : "")
  const day = localDateKey(at, zone)
  if (day === localDateKey(now, zone)) return `today at ${clock}`
  if (day === localDateKey(new Date(now.getTime() + 86_400_000), zone)) return `tomorrow at ${clock}`
  const date = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(at)
  return `on ${date} at ${clock}`
}

/** 1st, 2nd, 3rd, 4th, 11th, 21st. */
function ordinal(value: number): string {
  const tens = value % 100
  if (tens >= 11 && tens <= 13) return `${value}th`
  const suffix = ["th", "st", "nd", "rd"][value % 10] ?? "th"
  return `${value}${suffix}`
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
 * A saved search's name on its card: the words, or for a watch, which has
 * none, the subreddit it watches. The subreddit leads, because the keywords
 * panel opens at its narrowest: at a 1440px window a card has about 50px for
 * its name, and "Watching r/SaaS" was cut to "Watc…" on 11 Oct 2026.
 */
export function keywordTitle(input: { term: string; subreddits: string[] }): string {
  return input.term || `r/${input.subreddits[0] ?? ""}`
}

/** The heading over a saved search's posts, in the same terms as its card. */
export function findsHeading(input: { term: string; subreddits: string[] } | null): string {
  if (!input) return "Posts worth answering"
  return input.term ? `"${input.term}"` : `New posts in r/${input.subreddits[0] ?? ""}`
}

/**
 * What a saved keyword searches, as one line under its name.
 *
 * Says all three things a search is made of, because a keyword that quietly
 * searches one subreddit looks the same as one that searches Reddit otherwise.
 * A watch has no words, no window and no choice of order, so it says it reads
 * the newest first.
 */
export function keywordScopeText(input: {
  term: string
  postCount: number
  subreddits: string[]
  timeWindow: string
}): string {
  const posts = `${input.postCount} ${input.postCount === 1 ? "post" : "posts"}`
  if (!input.term) return `Watching · ${posts} · Newest first`

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

  return [posts, windows[input.timeWindow] ?? input.timeWindow, where].join(" · ")
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

/**
 * Words that mark a rule about promotion, strongest first: a rule that says
 * promotion or advertising outright beats one about spam, selling or links.
 */
const PROMOTION_RULES = [/promot|advertis/i, /spam|affiliate|solicit|selling|\blinks?\b|plug/i]

/**
 * The one line a subreddit's rules fold up to: how many there are, and the
 * one about promotion when there is one, since that is the rule a comment
 * from this app is most likely to break. Picking which rule to name is not a
 * judgement of any draft; every rule is one press away.
 */
export function rulesSummaryText(subreddit: string, rules: SubredditRule[]): string {
  const count = `r/${subreddit} has ${rules.length} ${rules.length === 1 ? "rule" : "rules"}`
  const promotion = PROMOTION_RULES.flatMap((pattern) => [
    rules.find((rule) => pattern.test(rule.title)),
    rules.find((rule) => pattern.test(rule.description)),
  ]).find(Boolean)
  return promotion?.title ? `${count}, including "${promotion.title}"` : count
}

/** Just enough of a sent comment's reading for the words below. */
type CommentReading = {
  stillVisible: boolean | null
  checkedAs: "stranger" | "you" | null
  checkedAt: Date | null
  checking: boolean
  checkError: string | null
}

/**
 * Whether a sent comment is still there, in words, with the longer
 * explanation for its tooltip.
 *
 * Three answers and never two: not read yet, read and still there, read and
 * gone. A comment nobody has checked is never shown as there or as gone, the
 * same rule the posts list follows for replies that were never read. When
 * Reddit refused a signed-out visitor, "there" is only what the account
 * itself sees, and the words say so, because a moderator's removal does not
 * show to the person who wrote the comment.
 */
export function commentStateWords(row: CommentReading): { label: string; detail: string } {
  if (row.checking) {
    return { label: "Reading", detail: "The browser is reading this comment on Reddit." }
  }
  if (row.checkedAt === null || row.stillVisible === null) {
    return row.checkError
      ? { label: "Could not read", detail: row.checkError }
      : { label: "Not read yet", detail: "Nobody has checked this comment since it went out." }
  }
  if (!row.stillVisible) {
    return {
      label: "Gone",
      detail:
        row.checkedAs === "stranger"
          ? "A signed-out visitor sees it as removed or deleted."
          : "Reddit shows it as removed or deleted.",
    }
  }
  return row.checkedAs === "stranger"
    ? { label: "There", detail: "A signed-out visitor can read it." }
    : {
        label: "There for you",
        detail:
          "Reddit would not answer a signed-out visitor, so this is what your own account sees. A moderator's removal does not show this way.",
      }
}
