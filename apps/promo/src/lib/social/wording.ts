import { daysBetween } from "@/lib/format/format-time"
import { slotWords } from "@/lib/phones/options"
import {
  NO_PROFILE_MESSAGE,
  PICK_AN_ACCOUNT,
  type FindThread,
  type ProfileCheck,
  type SubredditRule,
} from "@/lib/social/options"
import { clockText, knownTimeZone, localDateKey, localMinutes } from "@/lib/social/waking"
import type { PostPhone } from "@/server/phones/phones"
import type { PostingState } from "@/server/social/posting"

/**
 * The sentences the Projects and Reddit accounts dashboards put in front of a person.
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

/** Just enough of the clicked account for the wording below. */
type PostingAccount = {
  /** Empty or null when the browser was never seen signed in. */
  handle: string | null
  blocked: boolean
  reason: string
  profile: { id: string; name: string } | null
  /** The phone it runs on instead of a profile, or null, with what Post says about it. */
  phone: PostPhone | null
  posting: PostingState | null
}

/**
 * Which device a comment goes from, on the Post button itself (part 30 of
 * the phone farm): "Post from phone · slot 4", "Post from browser", or with
 * no account picked, "Post comment".
 */
export function postButtonWords(account: Pick<PostingAccount, "profile" | "phone"> | null): string {
  if (account?.phone) {
    const slot = slotWords(account.phone.shelfSlot)
    return slot ? `Post from phone · ${slot}` : "Post from phone"
  }
  if (account?.profile) return "Post from browser"
  return "Post comment"
}

/**
 * Why Post cannot be pressed, in words, or null when it can.
 *
 * Every one of these is something a person goes and fixes, so each says what
 * to do rather than just refusing. No account clicked on the Projects
 * dashboard comes first after the replies, because a comment always goes out
 * from the account clicked. A browser problem names the profile it is in and
 * the dashboard to find it on. The panel shows it in the Post button's
 * tooltip.
 */
export function postingBlockedReason(
  status: PostingAccount | null,
  detail: FindLike | null,
  now: Date = new Date()
): BlockedReason | null {
  if (detail && detail.thread === null) {
    return { text: "Read the replies first, so the comment does not repeat one of them." }
  }
  if (!status) return { text: PICK_AN_ACCOUNT }
  // Where a person goes to fix what the account's browser or phone shows.
  const device = status.profile
    ? { kind: "browser", where: `the profile ${status.profile.name} on the Browser profiles dashboard` }
    : status.phone
      ? { kind: "phone", where: `the screen of ${status.phone.name} on the Phones dashboard` }
      : null
  if (!device) return { text: NO_PROFILE_MESSAGE }
  // A phone that cannot take the comment now says why, with where to fix it.
  const phone = status.phone
  if (phone) {
    const named = `${phone.name}${phone.shelfSlot ? ` in ${slotWords(phone.shelfSlot)}` : ""}`
    if (phone.addressStop) return { text: `${named} was stopped for showing the wrong address: ${phone.addressStop}` }
    if (phone.status === "offline") {
      return { text: `${named} is offline: ${phone.offlineReason || "not seen by the rack"}. Check it on the Phones dashboard.` }
    }
    if (phone.status === "held") {
      return {
        text: phone.inUse
          ? `${named} is held while someone uses its screen window. Close the window, or wait for it to let go, then post.`
          : `${named} is held. Release it on the Phones dashboard, then post.`,
      }
    }
  }
  if (status.blocked) {
    return {
      text: status.reason
        ? `Reddit is asking the ${device.kind} something: ${status.reason}. Open ${device.where} and clear it.`
        : `Reddit is showing a challenge. Open ${device.where} and clear it.`,
    }
  }
  if (!status.handle) {
    return {
      text: `The ${device.kind} is not signed in to Reddit. Open ${device.where} and sign in once.`,
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
  if (state.paused === "account") {
    return "This account is paused. Resume it on the Reddit accounts dashboard to post from it again."
  }
  if (state.paused === "project") {
    return "This account's project is paused. Resume the project on its dashboard to post from it again."
  }
  if (state.warmUp.ageUnknown) {
    return "Promo has not read how old this account is, so it cannot tell when the warm-up ends. Tick it on the Reddit accounts dashboard and press Check now, then try again."
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

/** What an answer to a reply waiting for the account's morning says. */
export function waitingReplyText(runAfter: Date, handle: string | null, now: Date = new Date()): string {
  const who = handle ? `u/${handle}'s` : "the account's"
  return `Your answer is waiting for ${who} waking hours and goes ${whenText(runAfter, now)}.`
}

/** "2 to answer" under a comment's reply count, or null when there are none. */
export function toAnswerText(count: number | null): string | null {
  if (!count) return null
  return `${count} to answer`
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

/**
 * The heading over a saved search's posts, in the same terms as its card. No
 * keyword means the Everything row, every saved search's posts in one order.
 */
export function findsHeading(input: { term: string; subreddits: string[] } | null): string {
  if (!input) return "Everything"
  return input.term ? `"${input.term}"` : `New posts in r/${input.subreddits[0] ?? ""}`
}

/**
 * The line under the Everything row: how many posts are waiting to be looked
 * at across every keyword, and how many keywords that is.
 */
export function everythingLineText(waiting: number, keywords: number): string {
  return `${waiting} waiting · ${keywords} ${keywords === 1 ? "keyword" : "keywords"}`
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
 * When a keyword last searched and whether it searches again by itself:
 * "Searched 2 hours ago", "Not searched yet", and "Timer off" ahead of either
 * when its switch is off. `lastRunAt` is the last search that worked.
 */
export function keywordTimerText(
  input: { enabled: boolean; lastRunAt: Date | null },
  now: Date = new Date()
): string {
  const searched = input.lastRunAt
    ? `Searched ${relativeText(input.lastRunAt, now)}`
    : "Not searched yet"
  return input.enabled ? searched : `Timer off · ${searched}`
}

/** When a keyword last searched, short enough for its chip: "6 days ago", or "not searched yet". */
export function keywordChipTimeText(input: { lastRunAt: Date | null }, now: Date = new Date()): string {
  return input.lastRunAt ? relativeText(input.lastRunAt, now) : "not searched yet"
}

/** "just now", "5 minutes ago", "2 hours ago", "3 days ago". */
function relativeText(at: Date, now: Date): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - new Date(at).getTime()) / 60_000))
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`
  const days = Math.floor(hours / 24)
  return `${days} ${days === 1 ? "day" : "days"} ago`
}

/**
 * What an empty list of posts says, and it is never the same sentence twice.
 *
 * "Nothing here" and "I have not looked yet" are different answers, and so is
 * "you have not replied to anything", and so is "the search box hid them all".
 * Each one tells a person what to do next rather than leaving them to work out
 * which of these they are looking at.
 */
export function emptyFindsWords(input: {
  loading: boolean
  /** Everything lists every keyword's posts; otherwise one keyword's. */
  everything: boolean
  /** Whether any keyword is saved at all. */
  hasKeywords: boolean
  tab: "new" | "commented" | "skipped"
  /** The tab has posts, and the words in the search box matched none of them. */
  searchHidAll: boolean
}): string {
  if (input.loading) return "Reading the posts"
  if (input.searchHidAll) return "No post matches those words."
  if (!input.hasKeywords) return "No keywords yet. Add one above and it searches straight away."
  if (input.everything) {
    if (input.tab === "commented") return "You have not replied to any post yet."
    if (input.tab === "skipped") return "You have not skipped any post."
    return "Nothing is waiting under any keyword. Press the search button beside one to look again."
  }
  if (input.tab === "commented") return "You have not replied to anything here yet."
  if (input.tab === "skipped") return "You have not skipped anything here."
  return "Nothing found for this keyword yet. Press the search button beside it."
}


/**
 * What the answer panel says in place of a post's words when it has none and
 * the linked page is not there to show: not read yet, could not be read and
 * why, or a picture with no link at all. The first is not a failure, so it
 * never borrows the failure's words.
 */
export function noWordsText(find: {
  linkUrl: string
  linkReadAt: Date | null
  linkError: string
}): string {
  const plain = "This post has no words of its own. It is a link or a picture."
  if (!find.linkUrl) return plain
  if (!find.linkReadAt) {
    return "This post is a link with no words of its own. Promo is reading the page it links to, which shows here when you open the post again."
  }
  return `${plain} The page it links to could not be read. ${find.linkError || "Nothing came back."}`
}

/** "example.com" out of a full address, for the line naming a linked page. */
export function linkHostText(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return url
  }
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
  /** When Promo deleted it from Reddit on a person's press. */
  deletedAt?: Date | null
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
  if (row.deletedAt) {
    return {
      label: "Deleted by you",
      detail: "You deleted it from Reddit with Promo. It is kept here, and never read again.",
    }
  }
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

/**
 * How many of the comments read in one subreddit are gone, for that
 * subreddit on the Comments screen: "2 of 5 removed". Only comments a check
 * has read count, and the words say what the check saw, never "shadowbanned".
 * Null with none gone, so a clean subreddit says nothing.
 */
export function subredditRemovalText(counts: { removed: number; checked: number }): string | null {
  if (!counts.removed) return null
  return `${counts.removed} of ${counts.checked} removed`
}

/**
 * The warning in the comment box for a subreddit that removed comments
 * before: "r/SaaS removed 2 of your last 5 checked comments there." It warns
 * and never turns Post off. Null when nothing was removed.
 */
export function subredditRemovalWarning(
  subreddit: string,
  counts: { removed: number; checked: number }
): string | null {
  if (!counts.removed) return null
  return `r/${subreddit} removed ${counts.removed} of your ${counts.checked} checked ${counts.checked === 1 ? "comment" : "comments"} there.`
}
