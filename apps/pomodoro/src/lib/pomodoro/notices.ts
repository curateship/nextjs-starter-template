/**
 * The kinds of notice this app writes into the shell's bell, and the words
 * that go with each.
 *
 * Every Pomodoro notice is the shell's one `app_activity` type, because a CHECK
 * constraint on `notifications` refuses any other name. What kind it really is
 * lives beside it in `pomodoro_notice_links`, written in the same transaction.
 *
 * Pure data with nothing behind it, because `src/app/options.ts` reads it and
 * that file sits inside the app-options import circle.
 */

export const POMODORO_NOTICE_KINDS = ["cheer"] as const

export type PomodoroNoticeKind = (typeof POMODORO_NOTICE_KINDS)[number]

/**
 * The tray's tabs beside Unread and All. A tab joins only with the first kind
 * that is filed under it, so the tray never offers a tab that is always empty.
 */
export const POMODORO_NOTICE_CATEGORIES = [
  { id: "social", label: "Social" },
] as const

export type PomodoroNoticeCategoryId =
  (typeof POMODORO_NOTICE_CATEGORIES)[number]["id"]

export const NOTICE_KIND_CATEGORY: Record<
  PomodoroNoticeKind,
  PomodoroNoticeCategoryId
> = {
  cheer: "social",
}

const CHEER_SUFFIX = " cheered you on."

/** The sentence a cheer arrives as. The bell reads it back with the test below. */
export function cheerNoticeMessage(senderName: string) {
  return `${senderName}${CHEER_SUFFIX}`
}

/**
 * Which kind a notice is, from its own words, for the first paint of a row.
 *
 * The bell draws a row before the server has said anything about it, and a
 * row that changes shape a moment later reads as a flash. The sentences are
 * this app's own, written by the functions above, so reading them back is the
 * app recognising its own handwriting rather than guessing at somebody else's.
 * The saved kind in `pomodoro_notice_links` stays the truth for the link.
 */
export function noticeKindFromWords(notice: {
  type: string
  message: string | null
}): PomodoroNoticeKind | null {
  if (notice.type !== "app_activity" || !notice.message) return null
  if (notice.message.endsWith(CHEER_SUFFIX)) return "cheer"
  return null
}
