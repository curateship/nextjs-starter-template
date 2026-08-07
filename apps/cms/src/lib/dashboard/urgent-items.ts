import type * as React from "react"

/**
 * The handful of things somebody has to do something about. They ride at the
 * top of the activity feed under the word "Urgent".
 *
 * Which rows belong on the list is a question about a page's own numbers, so
 * the rules live apart from the drawing: `buildFeedsUrgent` covers the four
 * feeds, and the Overview adds the three only it can see.
 */
export type UrgentItem = {
  id: string
  icon: React.ComponentType<{ className?: string }>
  title: string
  detail: string
  action: string
  to: string
  /**
   * When this started, where the app records such a thing — the day the oldest
   * unopened notice was sent, the day the oldest unanswered feedback arrived,
   * the day an announcement is due to go live.
   *
   * **Null where nothing records it, and that is not a bug.** Some of these
   * rows are conditions rather than events: email being switched off, three
   * accounts sitting suspended, two subscriptions ending. The app stores no
   * moment those became true, so inventing one would be a made-up number on a
   * dashboard whose whole point is that its figures are real. A row with no
   * date says so, and the feed's day tabs never cut it — a live problem must
   * not disappear because nobody knows how old it is.
   */
  since: Date | null
  /** Set when the destination has a piece of its path to fill in, like a tab. */
  params?: Record<string, string>
  /**
   * The address the destination list should arrive on: `{ open }` to open one
   * record, or the list's own filter and sort values so the page lands already
   * showing the rows this row is about rather than everything.
   */
  search?: Record<string, string>
  /** Set when the row points at a block further down the same page. */
  hash?: string
}

/**
 * What a dismissal remembers.
 *
 * The id alone would not do. These rows are conditions, and a condition that is
 * still true would stay hidden for good — dismissing "3 suspended accounts"
 * would go on hiding the row when it became thirty. So the row's own words are
 * part of the key: the same fact stays dismissed, a changed one comes back.
 */
export function urgentDismissKey(item: Pick<UrgentItem, "id" | "title">) {
  return `${item.id}:${item.title}`
}

/**
 * How many dismissed rows a workspace remembers. A key is worthless the moment
 * the fact behind it is worded differently, so this list only grows while
 * somebody keeps dismissing new things — the cap is what stops it growing
 * without end all the same. The oldest keys are the ones dropped.
 */
export const MAX_DISMISSED_URGENT = 50

/** The longest a key can be. Long enough for any row's words, short enough that
 * a workspace's settings cannot be filled up through this door. */
export const MAX_URGENT_KEY_LENGTH = 400

/**
 * The most keys one request may carry.
 *
 * Deliberately above `MAX_DISMISSED_URGENT` rather than equal to it. The card
 * sends the list it is holding plus the row just dismissed, so at the cap that
 * request is one over — and a validator set to the cap would refuse it, meaning
 * the 51st row could never be put away at all. This is the abuse ceiling;
 * `cleanDismissedUrgent` is what actually trims, keeping the newest.
 */
export const MAX_DISMISSED_URGENT_SENT = 200

/**
 * What is safe to store: strings only, no repeats, no more than the cap. Run
 * on the way in and on the way out, like every other saved setting.
 */
export function cleanDismissedUrgent(value: unknown): string[] {
  if (!Array.isArray(value)) return []

  const keys = value.filter(
    (entry): entry is string =>
      typeof entry === "string" &&
      entry.length > 0 &&
      entry.length <= MAX_URGENT_KEY_LENGTH
  )

  return Array.from(new Set(keys)).slice(-MAX_DISMISSED_URGENT)
}

/** The rows still worth showing, in the order they were handed over. */
export function keepUndismissedUrgent(
  items: UrgentItem[],
  dismissed: string[]
): UrgentItem[] {
  if (!dismissed.length) return items
  const hidden = new Set(dismissed)
  return items.filter((item) => !hidden.has(urgentDismissKey(item)))
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * The urgent rows the day tabs leave on screen.
 *
 * A row with a date is cut like anything else. A row without one always
 * survives: there is no date to judge it by, and hiding a live problem on the
 * strength of a date nobody recorded would be the dashboard lying.
 *
 * A date in the future — an announcement due to go live — is never too old, so
 * it survives too.
 */
export function keepUrgentInRange(
  items: UrgentItem[],
  rangeInDays: number,
  now: Date
): UrgentItem[] {
  const oldest = now.getTime() - rangeInDays * DAY_MS
  return items.filter(
    (item) => !item.since || item.since.getTime() >= oldest
  )
}
