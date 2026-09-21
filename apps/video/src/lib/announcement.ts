/**
 * The facts about an announcement that both sides need: how loud it looks, how
 * long it may be, and the shape the banner is handed. They live here rather
 * than in the API file or the server module so there is one copy of each — the
 * server validates against the same numbers the form and the banner use.
 */

/**
 * How loud an announcement looks. Three settings, because the three things an
 * admin broadcasts do not deserve the same colour: a launch is news, a planned
 * maintenance window is a heads-up, an outage is a problem.
 */
export const ANNOUNCEMENT_LEVELS = ["info", "warning", "critical"] as const

export type AnnouncementLevel = (typeof ANNOUNCEMENT_LEVELS)[number]

export const ANNOUNCEMENT_AUDIENCES = ["app", "everyone"] as const

export type AnnouncementAudience = (typeof ANNOUNCEMENT_AUDIENCES)[number]

export const DEFAULT_ANNOUNCEMENT_LEVEL: AnnouncementLevel = "info"

export function isAnnouncementLevel(value: unknown): value is AnnouncementLevel {
  return ANNOUNCEMENT_LEVELS.includes(value as AnnouncementLevel)
}

/** One line on a banner, not an essay — and the column is `varchar(200)`. */
export const MAX_ANNOUNCEMENT_TITLE_LENGTH = 200
/** A couple of short sentences. Anything longer belongs in a changelog entry. */
export const MAX_ANNOUNCEMENT_BODY_LENGTH = 1000

/** What the shell hands the banner: live, not dismissed, nothing else. */
export type UserAnnouncement = {
  id: string
  title: string
  body: string
  level: AnnouncementLevel
}

/** A public banner carries its edit time so an edited message can resurface. */
export type VisitorAnnouncement = UserAnnouncement & {
  updatedAt: string
}

const VISITOR_DISMISSAL_PREFIX = "custom-shell:visitor-announcement:"

export function visitorAnnouncementDismissalKey(announcementId: string) {
  return `${VISITOR_DISMISSAL_PREFIX}${announcementId}`
}

export function isVisitorAnnouncementDismissed(
  storage: Pick<Storage, "getItem">,
  announcement: VisitorAnnouncement
) {
  try {
    return (
      storage.getItem(visitorAnnouncementDismissalKey(announcement.id)) ===
      announcement.updatedAt
    )
  } catch {
    return false
  }
}

export function rememberVisitorAnnouncementDismissal(
  storage: Pick<Storage, "setItem">,
  announcement: VisitorAnnouncement
) {
  try {
    storage.setItem(
      visitorAnnouncementDismissalKey(announcement.id),
      announcement.updatedAt
    )
  } catch {
    // A browser that blocks storage still dismisses it for this page view.
  }
}

export const announcementLevelLabels: Record<AnnouncementLevel, string> = {
  info: "News",
  warning: "Heads-up",
  critical: "Problem",
}

/**
 * The banner's own colours. Written out per level rather than mixed from a
 * token so both themes are chosen deliberately, and never colour alone — every
 * banner carries the level's icon and its label in the text as well.
 *
 * Every one of these is fully opaque on purpose. A see-through band takes its
 * apparent colour from whatever is painted behind it, so it appears to change
 * shade while the page is still assembling and again if the workspace's content
 * background is retuned in Styling settings.
 */
export const announcementLevelBannerClassNames: Record<
  AnnouncementLevel,
  string
> = {
  info: "bg-blue-100 text-blue-950 dark:bg-blue-950 dark:text-blue-50",
  warning: "bg-amber-100 text-amber-950 dark:bg-amber-950 dark:text-amber-50",
  critical: "bg-red-100 text-red-950 dark:bg-red-950 dark:text-red-50",
}
