import * as React from "react"
import { Link, useNavigate, useRouter } from "@tanstack/react-router"
import {
  ExternalLinkIcon,
  GraduationCapIcon,
  Loader2Icon,
  PlusIcon,
  SettingsIcon,
  Trash2Icon,
} from "lucide-react"
import { toast } from "sonner"

import { DashboardTable } from "@/components/shared/dashboard-table"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
} from "@/components/shared/dashboard-toolbar"
import {
  SortableTableHeader,
  type SortableColumn,
} from "@/components/shared/sortable-table-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import { TableCell, TableHead, TableRow } from "@/components/ui/table"
import { removeCourses, saveNewCourse } from "@/lib/api/courses/admin"
import { COURSE_ACCESS_LABELS } from "@/lib/courses/course-access"
import { getCourseErrorMessage } from "@/lib/courses/course-errors"
import type { AdminCourseRow } from "@/lib/courses/course-types"
import { describeBulkResult } from "@/lib/format/bulk-result"
import { formatDate } from "@/lib/format/format-time"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useSelection } from "@/lib/hooks/use-selection"
import { useTableSort } from "@/lib/hooks/use-table-sort"
import { showErrorToast } from "@/lib/toast/error-toast"

type CourseSort = "title" | "status" | "access" | "chapters" | "readers" | "updated"

const COLUMNS: SortableColumn<CourseSort>[] = [
  { key: "title", label: "Course", column: "main" },
  { key: "status", label: "Status", column: "meta" },
  { key: "access", label: "Who can read", column: "meta", className: "hidden md:table-cell" },
  { key: "chapters", label: "Chapters", column: "meta" },
  { key: "readers", label: "Readers", column: "meta", className: "hidden md:table-cell" },
  { key: "updated", label: "Updated", column: "meta", className: "hidden lg:table-cell" },
]

function compare(a: AdminCourseRow, b: AdminCourseRow, sort: CourseSort) {
  switch (sort) {
    case "title":
      return a.title.localeCompare(b.title)
    case "status":
      return a.status.localeCompare(b.status)
    case "access":
      return a.access.localeCompare(b.access)
    case "chapters":
      return a.chapterCount - b.chapterCount
    case "readers":
      return a.readerCount - b.readerCount
    case "updated":
      return a.updatedAt.getTime() - b.updatedAt.getTime()
  }
}

/**
 * The admin's Courses screen. Every course on the site, newest edits first.
 * A row opens the course's editor, which is a full screen of its own like the
 * page editor, because a course is a list of chapters rather than a form.
 */
export function CoursesDashboard({ courses }: { courses: AdminCourseRow[] }) {
  const router = useRouter()
  const navigate = useNavigate()
  const { sort, direction, toggleSort } = useTableSort<CourseSort>(
    "updated",
    "desc",
    (column) => (column === "title" || column === "status" || column === "access" ? "asc" : "desc")
  )
  const [search, setSearch] = React.useState("")
  const selection = useSelection()
  const [run, deleting] = useAsyncAction(getCourseErrorMessage)
  const [creating, setCreating] = React.useState(false)
  const [confirm, setConfirm] = React.useState<{ ids: string[]; title: string | null } | null>(
    null
  )

  const visible = React.useMemo(() => {
    const words = search.trim().toLowerCase()
    const found = words
      ? courses.filter(
          (course) =>
            course.title.toLowerCase().includes(words) ||
            course.slug.includes(words)
        )
      : courses
    const sorted = [...found].sort((a, b) => compare(a, b, sort))
    return direction === "asc" ? sorted : sorted.reverse()
  }, [courses, search, sort, direction])
  const visibleIds = visible.map((course) => course.id)

  const openEditor = (course: AdminCourseRow) =>
    void navigate({ to: "/admin/courses/$courseId", params: { courseId: course.id } })

  async function confirmDelete() {
    if (!confirm) return
    await run(async () => {
      const { done, kept } = await removeCourses(confirm.ids)
      await router.invalidate()
      selection.setSelected(new Set(kept))
      if (done.length === 0) {
        throw new Error("No courses were deleted. They may already be gone. The list has been refreshed.")
      }
      toast.success(
        describeBulkResult({
          done: done.length,
          kept: kept.length,
          one: "course",
          many: "courses",
          verb: "deleted",
        })
      )
      setConfirm(null)
    })
  }

  return (
    <>
      <DashboardTable
        title="Courses"
        icon={<GraduationCapIcon className="text-muted-foreground" />}
        count={courses.length}
        fillHeight
        className="h-auto max-h-full"
        selectedCount={selection.selected.size}
        onClearSelection={selection.clear}
        controls={
          <>
            {selection.selected.size ? (
              <DashboardToolbarButton
                type="button"
                variant="destructive"
                disabled={deleting}
                onClick={() => setConfirm({ ids: [...selection.selected], title: null })}
              >
                <Trash2Icon className="size-4" />
                Delete ({selection.selected.size})
              </DashboardToolbarButton>
            ) : null}
            <DashboardToolbarSearch
              name="course-search"
              aria-label="Search courses"
              placeholder="Search name or address…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <DashboardToolbarButton variant="outline" asChild>
              <Link to="/courses" target="_blank">
                <ExternalLinkIcon className="size-4" />
                Open /courses
              </Link>
            </DashboardToolbarButton>
            <DashboardToolbarButton type="button" onClick={() => setCreating(true)}>
              <PlusIcon className="size-4" />
              New course
            </DashboardToolbarButton>
          </>
        }
        header={
          <SortableTableHeader
            columns={COLUMNS}
            sort={sort}
            direction={direction}
            onSort={toggleSort}
            leading={
              <TableHead column="select">
                <Checkbox
                  checked={selection.selectAllState(visibleIds)}
                  onCheckedChange={() => selection.toggleVisible(visibleIds)}
                  aria-label="Select every course shown"
                />
              </TableHead>
            }
            trailing={<TableHead column="meta">Actions</TableHead>}
          />
        }
        isEmpty={visible.length === 0}
        emptyText={
          search.trim()
            ? "No course matches that search."
            : "No courses yet. Press New course to write the first one."
        }
        emptyColSpan={8}
        footer={{ type: "summary", count: visible.length }}
      >
        {visible.map((course) => (
          <TableRow key={course.id} className="group" rowAction={() => openEditor(course)}>
            <TableCell column="select">
              <Checkbox
                checked={selection.selected.has(course.id)}
                onCheckedChange={() => selection.toggle(course.id)}
                aria-label={`Select ${course.title}`}
              />
            </TableCell>
            <TableCell column="main">
              <button
                type="button"
                className="block max-w-96 truncate text-left text-sm font-medium group-hover:underline"
                onClick={() => openEditor(course)}
              >
                {course.title}
              </button>
              <span className="block max-w-96 truncate text-xs text-muted-foreground">
                /courses/{course.slug}
              </span>
            </TableCell>
            <TableCell column="meta">
              {course.status === "published" ? (
                <Badge variant="secondary">Published</Badge>
              ) : (
                <Badge variant="outline">Draft</Badge>
              )}
            </TableCell>
            <TableCell column="meta" className="hidden md:table-cell">
              {COURSE_ACCESS_LABELS[course.access]}
            </TableCell>
            <TableCell column="meta">
              {course.publishedChapterCount} of {course.chapterCount} out
            </TableCell>
            <TableCell column="meta" className="hidden md:table-cell">
              {course.readerCount}
            </TableCell>
            <TableCell column="meta" className="hidden lg:table-cell">
              {formatDate(course.updatedAt)}
            </TableCell>
            <TableCell column="actions">
              <div className="flex items-center">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Edit ${course.title}`}
                  onClick={() => openEditor(course)}
                >
                  <SettingsIcon className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Delete ${course.title}`}
                  disabled={deleting}
                  onClick={() => setConfirm({ ids: [course.id], title: course.title })}
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>

      <NewCourseDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(id) => {
          setCreating(false)
          void navigate({ to: "/admin/courses/$courseId", params: { courseId: id } })
        }}
      />

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null)
        }}
        title={
          confirm && confirm.ids.length === 1
            ? "Delete this course?"
            : `Delete ${confirm?.ids.length ?? 0} courses?`
        }
        description={
          confirm
            ? `${confirm.ids.length === 1 ? (confirm.title ?? "The course") : `${confirm.ids.length} courses`} go for good, with every chapter, every member's progress and notes, and every question asked in them.`
            : null
        }
        confirmLabel={
          confirm && confirm.ids.length > 1 ? `Delete ${confirm.ids.length} courses` : "Delete course"
        }
        loading={deleting}
        onConfirm={() => void confirmDelete()}
      />
    </>
  )
}

function NewCourseDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const [title, setTitle] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [invalid, setInvalid] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement | null>(null)

  async function create() {
    if (!title.trim()) {
      setInvalid(true)
      showErrorToast("Give the course a name first.")
      return
    }
    setBusy(true)
    try {
      const course = await saveNewCourse(title)
      setTitle("")
      onCreated(course.id)
    } catch (error) {
      showErrorToast(getCourseErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <FormDialog open={open} dirty={title.trim().length > 0} busy={busy} onClose={onClose}>
      {(requestClose) => (
        <DialogContent
          variant="admin"
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            inputRef.current?.focus()
          }}
        >
          <DialogHeader>
            <DialogTitle>New course</DialogTitle>
            <DialogDescription>
              It starts as a draft with one empty chapter. Nobody sees it until you publish it.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault()
              void create()
            }}
          >
            <DialogBody>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Course</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-2">
                    <FieldLabel htmlFor="new-course-title">Name</FieldLabel>
                    <Input
                      id="new-course-title"
                      ref={inputRef}
                      value={title}
                      maxLength={200}
                      aria-invalid={invalid || undefined}
                      placeholder="Notion for beginners"
                      onChange={(event) => {
                        setTitle(event.target.value)
                        setInvalid(false)
                      }}
                    />
                  </div>
                </CardContent>
              </Card>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={requestClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
                Create course
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}
