import * as React from "react"
import { Link } from "@tanstack/react-router"
import { CheckCircle2Icon, CircleIcon, LockIcon } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import type { ChapterHeading } from "@/lib/courses/chapter-body"
import type { ReaderChapterLink, ReaderOutline } from "@/lib/courses/course-types"
import { formatDate } from "@/lib/format/format-time"
import { focusRing } from "@/lib/layout/focus-ring"
import { cn } from "@/lib/utils"

/**
 * The left column of a course: every chapter this person may know about,
 * under its part, with a tick for each one done and a lock on each one they
 * cannot open yet. The chapter being read is marked.
 */
export function CourseChapterList({
  courseSlug,
  outline,
  currentSlug,
  preview,
  onPick,
}: {
  courseSlug: string
  outline: ReaderOutline
  currentSlug: string | null
  /** Keeps an admin's "read as a free member" on as they move between chapters. */
  preview: boolean
  /** Called when a chapter is picked, so a phone's slide-in list can shut. */
  onPick?: () => void
}) {
  const done = outline.chapters.filter((chapter) => chapter.done).length
  const loose = outline.chapters.filter(
    (chapter) => !chapter.groupId || !outline.groups.some((g) => g.id === chapter.groupId)
  )

  return (
    <nav aria-label="Chapters" className="grid gap-3">
      <p className="text-xs text-muted-foreground">
        {done} of {outline.chapters.length} done
      </p>
      {loose.length ? (
        <ChapterLinks
          chapters={loose}
          courseSlug={courseSlug}
          currentSlug={currentSlug}
          preview={preview}
          onPick={onPick}
        />
      ) : null}
      {outline.groups.map((group) => (
        <div key={group.id} className="grid gap-1">
          <h3 className="px-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {group.title}
          </h3>
          <ChapterLinks
            chapters={outline.chapters.filter((chapter) => chapter.groupId === group.id)}
            courseSlug={courseSlug}
            currentSlug={currentSlug}
            preview={preview}
            onPick={onPick}
          />
        </div>
      ))}
    </nav>
  )
}

function ChapterLinks({
  chapters,
  courseSlug,
  currentSlug,
  preview,
  onPick,
}: {
  chapters: ReaderChapterLink[]
  courseSlug: string
  currentSlug: string | null
  preview: boolean
  onPick?: () => void
}) {
  return (
    <ol className="grid gap-0.5">
      {chapters.map((chapter) => {
        const current = chapter.slug === currentSlug
        const Icon = chapter.done ? CheckCircle2Icon : chapter.open ? CircleIcon : LockIcon
        return (
          <li key={chapter.id}>
            <Link
              to="/courses/$course/$chapter"
              params={{ course: courseSlug, chapter: chapter.slug }}
              search={preview ? { preview: "free" } : {}}
              onClick={onPick}
              aria-current={current ? "page" : undefined}
              className={cn(
                "flex items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted",
                focusRing,
                current && "bg-muted font-medium text-foreground",
                !current && "text-muted-foreground"
              )}
            >
              <Icon
                className={cn(
                  "mt-0.5 size-4 shrink-0",
                  chapter.done && "text-primary"
                )}
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <span className="block leading-snug">{chapter.title}</span>
                <span className="block text-xs text-muted-foreground">
                  {chapterNote(chapter)}
                </span>
              </span>
            </Link>
          </li>
        )
      })}
    </ol>
  )
}

/** The small line under a chapter's name: how long, or why it is shut. */
function chapterNote(chapter: ReaderChapterLink): string {
  const parts = [`${chapter.readMinutes} min read`]
  if (chapter.done) parts.push("Done")
  if (chapter.draft) parts.push("Draft")
  if (chapter.scheduledFor) parts.push(`Goes live ${formatDate(chapter.scheduledFor)}`)
  if (!chapter.open && chapter.opensAt) parts.push(`Opens ${formatDate(chapter.opensAt)}`)
  if (chapter.isPreview && !chapter.done) parts.push("Free preview")
  return parts.join(" · ")
}

/**
 * The chapter's own headings, with the one being read marked as the reader
 * scrolls. Worked out from where the headings sit in the window, the same
 * way CMS's post contents list does it, because the question is "which
 * heading did I last pass".
 */
export function OnThisPage({ headings }: { headings: ChapterHeading[] }) {
  const [activeId, setActiveId] = React.useState(headings[0]?.id ?? "")

  React.useEffect(() => {
    if (headings.length === 0) return
    const read = () => {
      const marks = headings
        .map((heading) => document.getElementById(heading.id))
        .filter((element): element is HTMLElement => element !== null)
      if (marks.length === 0) return
      const atBottom =
        window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4
      if (atBottom) {
        setActiveId(marks[marks.length - 1]!.id)
        return
      }
      const passed = [...marks]
        .reverse()
        .find((mark) => mark.getBoundingClientRect().top <= 120)
      setActiveId(passed?.id ?? marks[0]!.id)
    }
    const first = window.requestAnimationFrame(read)
    window.addEventListener("scroll", read, { passive: true })
    window.addEventListener("scrollend", read)
    window.addEventListener("resize", read)
    return () => {
      window.cancelAnimationFrame(first)
      window.removeEventListener("scroll", read)
      window.removeEventListener("scrollend", read)
      window.removeEventListener("resize", read)
    }
  }, [headings])

  if (headings.length === 0) return null

  return (
    <nav aria-label="On this page" className="grid gap-2">
      <h2 className="text-sm font-semibold">On this page</h2>
      <ol className="grid gap-1.5">
        {headings.map((heading) => (
          <li key={heading.id}>
            <a
              href={`#${heading.id}`}
              aria-current={activeId === heading.id ? "true" : undefined}
              className={cn(
                "block border-l-2 border-transparent pl-3 text-sm leading-snug text-muted-foreground hover:text-foreground",
                focusRing,
                activeId === heading.id && "border-primary font-medium text-foreground"
              )}
            >
              {heading.text}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
}

/** The left column's card: the course name, its chapters, and the headings. */
export function CourseSidebarCard({
  title,
  courseSlug,
  outline,
  currentSlug,
  headings,
  preview,
  onPick,
}: {
  title: string
  courseSlug: string
  outline: ReaderOutline
  currentSlug: string | null
  headings: ChapterHeading[]
  preview: boolean
  onPick?: () => void
}) {
  return (
    <Card size="sm">
      <CardContent className="grid gap-4">
        <Link
          to="/courses/$course"
          params={{ course: courseSlug }}
          search={preview ? { preview: "free" } : {}}
          onClick={onPick}
          className={cn("rounded-sm text-base font-semibold hover:underline", focusRing)}
        >
          {title}
        </Link>
        <CourseChapterList
          courseSlug={courseSlug}
          outline={outline}
          currentSlug={currentSlug}
          preview={preview}
          onPick={onPick}
        />
        {headings.length ? (
          <div className="-mx-3 border-t px-3 pt-4">
            <OnThisPage headings={headings} />
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
