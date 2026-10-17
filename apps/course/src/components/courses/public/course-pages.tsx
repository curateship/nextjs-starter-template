import { Link, useRouter, type ErrorComponentProps } from "@tanstack/react-router"
import { BookOpenIcon, BookmarkIcon, LockIcon } from "lucide-react"

import { CourseChapterList } from "@/components/courses/public/course-sidebar"
import { CoursePreviewBar } from "@/components/courses/public/course-preview-bar"
import { PublicPageFrame } from "@/components/shell/public-page-frame"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { COURSE_ACCESS_LABELS } from "@/lib/courses/course-access"
import type {
  CourseIntroPage,
  PublicCourseCard,
  ReaderViewer,
  SavedChapter,
} from "@/lib/courses/course-types"
import { formatDate } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { focusRing } from "@/lib/layout/focus-ring"
import { mediaImageSrcSet } from "@/lib/media/image-sizes"
import { pageGutter } from "@/lib/layout/shell-gutter"
import { cn } from "@/lib/utils"

/** Every course page sits in the site's own public frame, with one gap. */
export function CourseFrame({ children }: { children: React.ReactNode }) {
  return (
    <PublicPageFrame layout="marketing">
      <div className="flex w-full flex-col" style={{ gap: pageGutter }}>
        {children}
      </div>
    </PublicPageFrame>
  )
}

/** A visitor is never shown the server's own words for a failure. */
export function CourseRouteError(_props: ErrorComponentProps) {
  const router = useRouter()
  return (
    <CourseFrame>
      <Card>
        <CardContent className="grid gap-2">
          <h1 className="text-lg font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">
            This page could not be loaded. Please try again.
          </p>
          <div>
            <Button type="button" onClick={() => void router.invalidate()}>
              Try again
            </Button>
          </div>
        </CardContent>
      </Card>
    </CourseFrame>
  )
}

/** /courses: one card per published course. */
export function CourseListPage({
  courses,
  viewer,
}: {
  courses: PublicCourseCard[]
  viewer: ReaderViewer
}) {
  return (
    <CourseFrame>
      <header className="grid gap-1">
        <h1 className="text-3xl font-semibold">Courses</h1>
        <p className="text-sm text-muted-foreground">
          Step-by-step guides, one chapter at a time.
        </p>
      </header>
      {viewer.signedIn && !viewer.previewingAsFree ? (
        <div>
          <Button asChild variant="outline">
            <Link to="/courses/saved">
              <BookmarkIcon className="size-4" />
              Your saved chapters
            </Link>
          </Button>
        </div>
      ) : null}
      {courses.length === 0 ? (
        <Card>
          <CardContent>
            <p className="py-6 text-center text-sm text-muted-foreground">
              No courses yet. Check back soon.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul
          className="grid sm:grid-cols-2 lg:grid-cols-3"
          style={{ gap: pageGutter }}
        >
          {courses.map((course) => (
            <li key={course.slug} className="flex">
              <CourseCard course={course} />
            </li>
          ))}
        </ul>
      )}
    </CourseFrame>
  )
}

function CourseCard({ course }: { course: PublicCourseCard }) {
  return (
    <Link
      to="/courses/$course"
      params={{ course: course.slug }}
      className={cn("flex w-full rounded-xl", focusRing)}
    >
      <Card className="w-full pt-0 transition-colors hover:bg-accent/40">
        {course.image ? (
          <img
            src={course.image}
            srcSet={mediaImageSrcSet(course.image)}
            sizes="(min-width: 1024px) 360px, (min-width: 640px) 50vw, 100vw"
            alt=""
            loading="lazy"
            className="aspect-video w-full object-cover"
          />
        ) : (
          <div className="flex aspect-video w-full items-center justify-center bg-muted">
            <BookOpenIcon className="size-8 text-muted-foreground" aria-hidden />
          </div>
        )}
        <CardContent className="grid gap-2">
          <h2 className="text-base font-semibold">{course.title}</h2>
          {course.description ? (
            <p className="line-clamp-3 text-sm text-muted-foreground">
              {course.description}
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            {course.chapterCount} {plural(course.chapterCount, "chapter")} ·{" "}
            {course.readMinutes} min read
            {course.started || course.doneCount > 0
              ? ` · ${course.doneCount} of ${course.chapterCount} done`
              : ""}
          </p>
          <div className="flex flex-wrap gap-1">
            {course.lock ? (
              <Badge variant="outline">
                <LockIcon className="size-3" aria-hidden />
                {course.access === "paid" ? "Paid plan" : "Members only"}
              </Badge>
            ) : course.access !== "everyone" ? (
              <Badge variant="secondary">{COURSE_ACCESS_LABELS[course.access]}</Badge>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

/** /courses/<course>: what it covers, its chapters, and the way in. */
export function CourseIntro({ page }: { page: CourseIntroPage }) {
  const { course, outline, viewer } = page
  const preview = viewer.previewingAsFree
  const search = preview ? { preview: "free" as const } : {}
  const doneCount = outline.chapters.filter((chapter) => chapter.done).length
  const minutes = outline.chapters.reduce((total, chapter) => total + chapter.readMinutes, 0)
  const here = `/courses/${course.slug}`

  return (
    <CourseFrame>
      <CoursePreviewBar viewer={viewer} here={{ course: course.slug }} courseId={course.id} />
      <div
        className="grid items-start lg:grid-cols-[minmax(0,1.4fr)_minmax(16rem,1fr)]"
        style={{ gap: pageGutter }}
      >
        <div className="grid gap-4">
          {course.image ? (
            <img
              src={course.image}
              srcSet={mediaImageSrcSet(course.image)}
              sizes="(min-width: 1024px) 680px, 100vw"
              alt=""
              className="aspect-video w-full rounded-xl object-cover"
            />
          ) : null}
          <header className="grid gap-2">
            <h1 className="text-3xl font-semibold text-pretty md:text-4xl">{course.title}</h1>
            <p className="text-sm text-muted-foreground">
              {outline.chapters.length} {plural(outline.chapters.length, "chapter")} ·{" "}
              {minutes} min read
              {page.started || doneCount > 0
                ? ` · ${doneCount} of ${outline.chapters.length} done`
                : ""}
            </p>
            {course.description ? (
              <p className="text-base whitespace-pre-line">{course.description}</p>
            ) : null}
          </header>
          <div className="flex flex-wrap gap-2">
            {page.resumeChapterSlug ? (
              <Button asChild>
                <Link
                  to="/courses/$course/$chapter"
                  params={{ course: course.slug, chapter: page.resumeChapterSlug }}
                  search={search}
                >
                  {page.started && doneCount > 0 ? "Keep reading" : "Start reading"}
                </Link>
              </Button>
            ) : null}
            {course.lock === "sign-in" ? (
              <Button asChild variant={page.resumeChapterSlug ? "outline" : "default"}>
                <Link to="/login" search={{ redirect: here }}>
                  Sign in to read every chapter
                </Link>
              </Button>
            ) : null}
            {course.lock === "upgrade" ? (
              <Button asChild variant={page.resumeChapterSlug ? "outline" : "default"}>
                <Link to="/pricing">Join to read every chapter</Link>
              </Button>
            ) : null}
          </div>
        </div>
        <Card size="sm">
          <CardContent className="grid gap-3">
            <h2 className="text-base font-semibold">Chapters</h2>
            {outline.chapters.length ? (
              <CourseChapterList
                courseSlug={course.slug}
                outline={outline}
                currentSlug={null}
                preview={preview}
              />
            ) : (
              <p className="text-sm text-muted-foreground">No chapters are out yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </CourseFrame>
  )
}

/** /courses/saved: the chapters this member saved, newest first. */
export function SavedChaptersPage({ saved }: { saved: SavedChapter[] }) {
  return (
    <CourseFrame>
      <header className="grid gap-1">
        <h1 className="text-3xl font-semibold">Saved chapters</h1>
        <p className="text-sm text-muted-foreground">
          Chapters you saved with the Save button, newest first.
        </p>
      </header>
      {saved.length === 0 ? (
        <Card>
          <CardContent>
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nothing saved yet. Press Save on any chapter to keep it here.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-2 md:gap-3">
          {saved.map((item) => (
            <li key={`${item.courseSlug}/${item.chapterSlug}`}>
              <Card size="sm" className="transition-colors hover:bg-accent/40">
                <CardContent className="grid gap-1">
                  <p className="text-xs text-muted-foreground">{item.courseTitle}</p>
                  <h2 className="text-base font-medium">
                    <Link
                      to="/courses/$course/$chapter"
                      params={{ course: item.courseSlug, chapter: item.chapterSlug }}
                      className={cn("rounded-sm hover:underline", focusRing)}
                    >
                      {item.chapterTitle}
                    </Link>
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Saved {formatDate(item.savedAt)}
                  </p>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
      <div>
        <Button asChild variant="outline">
          <Link to="/courses">All courses</Link>
        </Button>
      </div>
    </CourseFrame>
  )
}
