import type { ChapterBody } from "@/lib/courses/chapter-body"
import type {
  CourseAccess,
  CourseStatus,
  LockReason,
} from "@/lib/courses/course-access"

/**
 * The shapes the Courses screens are handed, shared by the server that builds
 * them and the browser that draws them. Types only.
 */

export type AdminCourse = {
  id: string
  title: string
  slug: string
  description: string
  image: string
  access: CourseAccess
  planIds: string[]
  status: CourseStatus
  position: number
  createdAt: Date
  updatedAt: Date
}

/** A row on the admin's Courses table. */
export type AdminCourseRow = AdminCourse & {
  chapterCount: number
  publishedChapterCount: number
  /** Members who have opened it. */
  readerCount: number
}

export type AdminGroup = { id: string; title: string; position: number }

export type AdminChapter = {
  id: string
  groupId: string | null
  title: string
  slug: string
  body: ChapterBody
  readMinutes: number
  position: number
  status: CourseStatus
  isPreview: boolean
  opensAfterDays: number | null
  publishAt: Date | null
  audioUrl: string
  /** False when the words changed after the audio was made. */
  audioCurrent: boolean
  updatedAt: Date
}

export type PlanChoice = { id: string; name: string; paid: boolean }

/** Everything the course editor opens with. */
export type CourseForEdit = {
  course: AdminCourse
  groups: AdminGroup[]
  chapters: AdminChapter[]
  plans: PlanChoice[]
  /** Chapters of every course on the site, for the chapter link picker. */
  linkChoices: ChapterLinkChoice[]
  /** Questions nobody has answered yet, for the Questions tab's count. */
  unansweredQuestions: number
  /** True when an ElevenLabs key is saved, so "Make audio" can work. */
  voiceReady: boolean
}

export type ChapterLinkChoice = {
  chapterId: string
  courseTitle: string
  chapterTitle: string
}

/** A course card on /courses. */
export type PublicCourseCard = {
  slug: string
  title: string
  description: string
  image: string
  access: CourseAccess
  chapterCount: number
  readMinutes: number
  /** Why this person cannot read it, or null when they can. */
  lock: LockReason | null
  /** Chapters this person marked done, for "3 of 8 done". */
  doneCount: number
  started: boolean
}

export type ReaderChapterLink = {
  id: string
  slug: string
  title: string
  readMinutes: number
  groupId: string | null
  open: boolean
  lockReason: LockReason | null
  /** When a held-back chapter opens for this person. */
  opensAt: Date | null
  isPreview: boolean
  done: boolean
  /** Only an admin sees these two: why a reader would not see the chapter. */
  draft: boolean
  scheduledFor: Date | null
}

export type ReaderOutline = {
  groups: { id: string; title: string }[]
  /** Every chapter this person may know about, in reading order. */
  chapters: ReaderChapterLink[]
}

export type ReaderCourse = {
  id: string
  slug: string
  title: string
  description: string
  image: string
  access: CourseAccess
  lock: LockReason | null
}

export type ReaderViewer = {
  signedIn: boolean
  isAdmin: boolean
  /** An admin reading as a free member would. */
  previewingAsFree: boolean
}

/** /courses/<course>: the intro page. */
export type CourseIntroPage = {
  siteName: string
  course: ReaderCourse
  outline: ReaderOutline
  viewer: ReaderViewer
  /** Where "Start reading" or "Keep reading" goes, or null for none open. */
  resumeChapterSlug: string | null
  started: boolean
}

export type QuizResult = { choiceId: string; correct: boolean; rightChoiceId: string }

export type ChapterMemberState = {
  done: boolean
  bookmarked: boolean
  note: string
  /** Ticked checklist items, by item id. */
  ticks: string[]
  /** This person's quiz answers so far, by question id. */
  quiz: Record<string, QuizResult>
}

export type ChapterQuestion = {
  id: string
  body: string
  askerName: string
  mine: boolean
  answer: string
  createdAt: Date
  answeredAt: Date | null
}

/** /courses/<course>/<chapter>. */
export type ChapterPage = {
  siteName: string
  course: ReaderCourse
  outline: ReaderOutline
  viewer: ReaderViewer
  chapter: {
    id: string
    slug: string
    title: string
    readMinutes: number
    /** Null while the chapter is locked for this person. */
    body: ChapterBody | null
    lockReason: LockReason | null
    opensAt: Date | null
    audioUrl: string
  }
  previous: { slug: string; title: string } | null
  next: { slug: string; title: string; open: boolean } | null
  /** Null when signed out or the chapter is locked. */
  member: ChapterMemberState | null
  questions: ChapterQuestion[]
  /** True once this person has marked every chapter they can see done. */
  finishedCourse: boolean
  /** Another published course to point to from the finished-course screen. */
  nextCourse: { slug: string; title: string } | null
}

/** One chapter on the member's Saved list. */
export type SavedChapter = {
  courseSlug: string
  courseTitle: string
  chapterSlug: string
  chapterTitle: string
  savedAt: Date
}

/** The admin's stats table: one row per chapter, in reading order. */
export type CourseStatsRow = {
  chapterId: string
  title: string
  groupTitle: string | null
  opened: number
  finished: number
  /** Members whose last opened chapter is this one, and who have not finished the course. */
  stoppedHere: number
}

export type CourseStats = {
  readers: number
  finishedCourse: number
  rows: CourseStatsRow[]
}

/** A question on the admin's Questions tab. */
export type AdminQuestion = ChapterQuestion & {
  chapterId: string
  chapterTitle: string
  askerEmail: string
}
