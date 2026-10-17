import { Link } from "@tanstack/react-router"
import { EyeIcon, SettingsIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { ReaderViewer } from "@/lib/courses/course-types"

/**
 * The strip an admin sees above a course: they are seeing every chapter,
 * drafts included, and can switch to exactly what a signed-in free member
 * sees, locks and all. Nobody else ever sees it.
 */
export function CoursePreviewBar({
  viewer,
  here,
  courseId,
}: {
  viewer: ReaderViewer
  /** The page being read, so the switch stays on it. */
  here: { course: string; chapter?: string }
  courseId?: string
}) {
  if (!viewer.isAdmin) return null

  const target = here.chapter
    ? ({ to: "/courses/$course/$chapter", params: { course: here.course, chapter: here.chapter } } as const)
    : ({ to: "/courses/$course", params: { course: here.course } } as const)

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/60 px-3 py-2 text-sm">
      <EyeIcon className="size-4 text-muted-foreground" aria-hidden />
      <p className="mr-auto">
        {viewer.previewingAsFree
          ? "You are reading as a signed-in free member. Nothing you do here is saved."
          : "You are reading as an admin, so every chapter is open, drafts included."}
      </p>
      <Button asChild size="sm" variant="outline" className="bg-background">
        <Link {...target} search={viewer.previewingAsFree ? {} : { preview: "free" }}>
          {viewer.previewingAsFree ? "Stop reading as a free member" : "Read as a free member"}
        </Link>
      </Button>
      {courseId ? (
        <Button asChild size="sm" variant="ghost">
          <Link to="/admin/courses/$courseId" params={{ courseId }}>
            <SettingsIcon className="size-4" />
            Edit course
          </Link>
        </Button>
      ) : null}
    </div>
  )
}
