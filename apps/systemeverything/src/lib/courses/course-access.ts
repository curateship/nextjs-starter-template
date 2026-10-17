/**
 * Who may read what, as plain rules with no database behind them. The server
 * asks these on every read (`server/courses/reader.ts`), and the tests ask the
 * same functions, so the rule that is tested is the rule that runs.
 */

export const COURSE_ACCESS = ["everyone", "members", "paid"] as const
export type CourseAccess = (typeof COURSE_ACCESS)[number]

export const COURSE_ACCESS_LABELS: Record<CourseAccess, string> = {
  everyone: "Everyone",
  members: "Signed-in members",
  paid: "Paying members",
}

export const COURSE_STATUSES = ["draft", "published"] as const
export type CourseStatus = (typeof COURSE_STATUSES)[number]

export function isCourseAccess(value: unknown): value is CourseAccess {
  return COURSE_ACCESS.includes(value as CourseAccess)
}

/** The person reading, as far as the rules care. */
export type CourseViewer = {
  signedIn: boolean
  isAdmin: boolean
  /** True while a paid plan is running. A paused plan is not paid. */
  isPaid: boolean
  planId: string | null
}

export const SIGNED_OUT_VIEWER: CourseViewer = {
  signedIn: false,
  isAdmin: false,
  isPaid: false,
  planId: null,
}

export type CourseRules = { access: CourseAccess; planIds: string[] }

export type ChapterRules = {
  status: CourseStatus
  isPreview: boolean
  opensAfterDays: number | null
  publishAt: Date | null
}

/** Why a locked chapter is locked, which decides what the reader is offered. */
export type LockReason = "sign-in" | "upgrade" | "waiting"

export type ChapterAccess =
  /** Not on the site yet: a draft, or published for a later date. */
  | { kind: "hidden" }
  | { kind: "open" }
  | { kind: "locked"; reason: LockReason; opensAt: Date | null }

/** Whether this person may read the course's chapters at all. */
export function courseLock(
  course: CourseRules,
  viewer: CourseViewer
): LockReason | null {
  if (viewer.isAdmin || course.access === "everyone") return null
  if (!viewer.signedIn) return "sign-in"
  if (course.access === "members") return null
  if (!viewer.isPaid) return "upgrade"
  if (course.planIds.length === 0) return null
  return viewer.planId && course.planIds.includes(viewer.planId)
    ? null
    : "upgrade"
}

const DAY_MS = 24 * 60 * 60 * 1000

/** When a held-back chapter opens for somebody who started on `startedAt`. */
export function chapterOpensAt(startedAt: Date, opensAfterDays: number): Date {
  return new Date(startedAt.getTime() + opensAfterDays * DAY_MS)
}

/** Whether a chapter is on the site at all yet, for anyone but an admin. */
export function chapterIsLive(chapter: ChapterRules, at: Date): boolean {
  if (chapter.status !== "published") return false
  return !chapter.publishAt || chapter.publishAt.getTime() <= at.getTime()
}

/**
 * One chapter, for one person.
 *
 * `startedAt` is when they first opened the course, which is what "opens
 * after N days" counts from (Tyler, 17 Oct 2026). A member opening the course
 * for the first time has not started yet, so the clock starts now.
 *
 * An admin sees every chapter, drafts and dated ones included, because the
 * reader is also where they check their own work. A preview chapter is open
 * to anyone, and is never held back.
 */
export function chapterAccess(
  course: CourseRules,
  chapter: ChapterRules,
  viewer: CourseViewer,
  startedAt: Date | null,
  at: Date
): ChapterAccess {
  if (viewer.isAdmin) return { kind: "open" }
  if (!chapterIsLive(chapter, at)) return { kind: "hidden" }
  if (chapter.isPreview) return { kind: "open" }

  const lock = courseLock(course, viewer)
  if (lock) return { kind: "locked", reason: lock, opensAt: null }

  if (chapter.opensAfterDays) {
    // Somebody signed out has no clock to count from, so they are asked to
    // sign in first rather than shown a date that moves every visit.
    if (!viewer.signedIn) return { kind: "locked", reason: "sign-in", opensAt: null }
    const opensAt = chapterOpensAt(startedAt ?? at, chapter.opensAfterDays)
    if (opensAt.getTime() > at.getTime()) {
      return { kind: "locked", reason: "waiting", opensAt }
    }
  }

  return { kind: "open" }
}
