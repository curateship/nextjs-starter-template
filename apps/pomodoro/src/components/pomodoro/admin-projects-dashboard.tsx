import * as React from "react"
import { getRouteApi, useNavigate } from "@tanstack/react-router"
import { ArchiveIcon, ArchiveRestoreIcon, FolderIcon, Loader2Icon, SettingsIcon, Trash2Icon, XIcon } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ErrorRow } from "@/components/ui/error-row"
import { FieldLabel } from "@/components/ui/field-label"
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import { LoadingRow } from "@/components/ui/loading-row"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TableCell, TableHead, TableRow } from "@/components/ui/table"
import {
  DashboardToolbarButton,
  DashboardToolbarSearch,
  DashboardToolbarSelectTrigger,
} from "@/components/shared/dashboard-toolbar"
import type { TableHeaderColumn } from "@/components/shared/sortable-table-header"
import { AdminListTable, AdminSelectCell, useAdminList } from "@/components/pomodoro/admin-list"
import {
  AdminBulkDeleteButton,
  AdminDeleteConfirm,
  AdminRowDeleteButton,
  useAdminDelete,
} from "@/components/pomodoro/admin-delete"
import { MemberName } from "@/components/pomodoro/admin-member-name"
import { DetailRow, SeeAll, ShortList } from "@/components/pomodoro/admin-member-window"
import {
  deletePomodoroProjects,
  getAdminProjectErrorMessage,
  listPomodoroProjects,
  loadPomodoroAdminProject,
  setPomodoroAdminProjectArchived,
  updatePomodoroAdminProject,
  type AdminProject,
  type AdminProjectRow,
} from "@/lib/api/pomodoro/admin-projects"
import { formatDate, formatDateTime, formatUtcDate } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { useSelection } from "@/lib/hooks/use-selection"
import { useListSearchNavigate, useListSort, useSearchBoxText } from "@/lib/nav/list-search"
import { TASK_STATUS_LOOK, type ProjectSortColumn } from "@/lib/pomodoro/admin-lists"
import { formatFocusDuration } from "@/lib/pomodoro/focus-history"
import { projectInitial, projectToneIndex } from "@/lib/pomodoro/project-initial"
import {
  PROJECT_NAME_MAX_LENGTH,
  TARGET_HOURS_MAX,
  targetPeriodLabels,
  targetPeriods,
  targetProgressLabel,
  type TargetPeriod,
} from "@/lib/pomodoro/project-targets"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

const route = getRouteApi("/_authenticated/admin/pomodoro-projects")
const authenticatedRoute = getRouteApi("/_authenticated")

type SortColumn = ProjectSortColumn
type Column = SortColumn | "target" | "public"
const UNSORTABLE: Column[] = ["target", "public"]

const COLUMNS: TableHeaderColumn<Column>[] = [
  { key: "name", label: "Project", column: "main" },
  { key: "owner", label: "Owner", column: "meta" },
  { key: "tasks", label: "Tasks", column: "meta" },
  { key: "hours", label: "Focused", column: "meta" },
  { key: "target", label: "Target", column: "meta", sortable: false },
  { key: "public", label: "Profile", column: "meta", sortable: false, className: "hidden 2xl:table-cell" },
  { key: "created", label: "Made", column: "meta", className: "hidden 2xl:table-cell" },
]

/**
 * The project's square in the admin palette: the same tint the owner's card
 * picks for the name, readable on a light and a dark admin.
 */
const SQUARE_TONES = [
  "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  "bg-orange-500/15 text-orange-700 dark:text-orange-300",
]

function ProjectSquare({ name }: { name: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-6 shrink-0 place-items-center rounded-md text-xs font-semibold",
        SQUARE_TONES[projectToneIndex(name)]
      )}
    >
      {projectInitial(name)}
    </span>
  )
}

/** "10h a week", or nothing when there is no target. */
function targetLabel(row: { targetHours: number | null; targetPeriod: TargetPeriod | null }) {
  return row.targetHours && row.targetPeriod ? `${row.targetHours}h ${targetPeriodLabels[row.targetPeriod]}` : ""
}

/**
 * "4h of 10h this week", the words under the owner's own bar, or nothing when
 * there is no target.
 */
function progressLabel(row: {
  targetHours: number | null
  targetPeriod: TargetPeriod | null
  periodSeconds: number | null
}) {
  return row.targetHours && row.targetPeriod && row.periodSeconds !== null
    ? targetProgressLabel(row.periodSeconds, row.targetHours, row.targetPeriod)
    : ""
}

/** What the delete window needs to know about a project it is asked about. */
type AskedProject = { id: string; name: string; taskCount: number; ownerId: string; ownerName: string }

/**
 * " Ana is told in the bell.", or nothing when the admin is the owner, who is
 * never told about their own change.
 */
function toldLine(project: { ownerId: string; ownerName: string }, me: string) {
  return project.ownerId === me ? "" : ` ${project.ownerName} is told in the bell.`
}

/** True when an unhandled failure means the project was deleted meanwhile. */
function isGone(error: unknown) {
  return error instanceof Error && error.message.includes("PROJECT_NOT_FOUND")
}

/**
 * Every member's projects (admin task 07): owner, tasks, hours, target and
 * where it stands. The name or the cog opens the project's window, and Delete
 * sits on a row, over ticked rows and in the window. See
 * `workspace/docs/admin-sections.md`.
 */
export function AdminProjectsDashboard({
  initial,
  initialPageSize,
}: {
  initial: { rows: AdminProjectRow[]; total: number }
  initialPageSize: number
}) {
  const search = route.useSearch()
  const me = authenticatedRoute.useLoaderData().user.id
  const setListSearch = useListSearchNavigate()
  const query = search.q ?? ""
  const userId = search.user
  const state = search.state ?? "all"
  const visibility = search.visibility ?? "all"
  const target = search.target ?? "all"
  const sort: SortColumn = search.sort ?? "created"
  const direction = search.direction ?? "desc"
  const page = search.page ?? 1
  const setPage = React.useCallback(
    (next: number) => setListSearch({ page: next > 1 ? next : undefined }),
    [setListSearch]
  )
  const [searchText, setSearchText] = useSearchBoxText(query, (text) =>
    setListSearch({ q: text.trim() ? text : undefined, page: undefined })
  )
  const load = React.useCallback(
    (pageSize: number) =>
      listPomodoroProjects({ search: query, user: userId, state, visibility, target, sort, direction, page, pageSize }),
    [direction, page, query, sort, state, target, userId, visibility]
  )
  const list = useAdminList({ initial, initialPageSize, page, onPageChange: setPage, load })
  const toggleSort = useListSort<SortColumn>({ sort, direction }, (column) =>
    column === "name" || column === "owner" ? "asc" : "desc"
  )
  const selection = useSelection()
  const rowIds = React.useMemo(() => list.rows.map((row) => row.id), [list.rows])
  const selectedIds = rowIds.filter((id) => selection.selected.has(id))

  const del = useAdminDelete({
    one: "project",
    many: "projects",
    run: deletePomodoroProjects,
    keptReason: "already gone",
    selection,
    onDone: list.refresh,
  })
  // A project deleted from its window may not be on the page on screen, so
  // the window hands over what the confirm needs to say about it.
  const [fromWindow, setFromWindow] = React.useState<AskedProject | null>(null)
  const asked = del.ids.flatMap((id) => {
    const row = list.rows.find((entry) => entry.id === id)
    if (row) return [row]
    return fromWindow?.id === id ? [fromWindow] : []
  })

  const navigate = useNavigate()
  const setOpen = React.useCallback(
    (id: string | undefined) => {
      // Not `replace`: Back closes the window, the way every record window does.
      void navigate({
        to: ".",
        search: (previous: Record<string, unknown>) => {
          const next = { ...previous }
          if (id) next.open = id
          else delete next.open
          return next
        },
      })
    },
    [navigate]
  )
  const setFilter = (key: "state" | "visibility" | "target", value: string) =>
    setListSearch({ [key]: value === "all" ? undefined : value, page: undefined })

  return (
    <>
      <AdminListTable
        title="Projects"
        icon={<FolderIcon />}
        noun="projects"
        columns={COLUMNS}
        sort={sort}
        direction={direction}
        onSort={(column) => {
          if (!UNSORTABLE.includes(column)) toggleSort(column as SortColumn)
        }}
        trailing={<TableHead column="meta">Actions</TableHead>}
        selection={{ noun: "projects", rowIds, state: selection }}
        list={list}
        page={page}
        onPageChange={setPage}
        controls={
          <>
            <AdminBulkDeleteButton del={del} ids={selectedIds} />
            {userId ? (
              <DashboardToolbarButton
                type="button"
                variant="outline"
                onClick={() => setListSearch({ user: undefined, page: undefined })}
              >
                <XIcon className="size-4" />
                One member's projects
              </DashboardToolbarButton>
            ) : null}
            <DashboardToolbarSearch
              name="project-search"
              aria-label="Search projects"
              placeholder="Search project or owner…"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
            />
            <Select value={state} onValueChange={(value) => setFilter("state", value)}>
              <DashboardToolbarSelectTrigger aria-label="Filter by live or archived">
                <SelectValue placeholder="State" />
              </DashboardToolbarSelectTrigger>
              <SelectContent>
                <SelectItem value="all">Live and archived</SelectItem>
                <SelectItem value="live">Live</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
            <Select value={visibility} onValueChange={(value) => setFilter("visibility", value)}>
              <DashboardToolbarSelectTrigger aria-label="Filter by public or private">
                <SelectValue placeholder="Profile" />
              </DashboardToolbarSelectTrigger>
              <SelectContent>
                <SelectItem value="all">Public and private</SelectItem>
                <SelectItem value="public">On their profile</SelectItem>
                <SelectItem value="private">Private</SelectItem>
              </SelectContent>
            </Select>
            <Select value={target} onValueChange={(value) => setFilter("target", value)}>
              <DashboardToolbarSelectTrigger aria-label="Filter by target">
                <SelectValue placeholder="Target" />
              </DashboardToolbarSelectTrigger>
              <SelectContent>
                <SelectItem value="all">With or without a target</SelectItem>
                <SelectItem value="target">Has a target</SelectItem>
                <SelectItem value="none">No target</SelectItem>
              </SelectContent>
            </Select>
          </>
        }
      >
        {list.rows.map((row) => (
          <TableRow key={row.id} className="group" rowAction={() => setOpen(row.id)}>
            <AdminSelectCell selection={selection} id={row.id} label={`Select ${row.name}`} />
            <TableCell column="main">
              <div className="flex min-w-0 items-center gap-2">
                <ProjectSquare name={row.name} />
                <button
                  type="button"
                  className="block max-w-72 truncate text-left font-medium group-hover:underline"
                  title={row.name}
                  onClick={() => setOpen(row.id)}
                >
                  {row.name}
                </button>
                {/* Archived is said beside the name rather than in a column of
                    its own, so the list fits a 1280px screen. */}
                {row.archivedAt ? <Badge variant="outline">Archived</Badge> : null}
              </div>
            </TableCell>
            <TableCell column="meta" className="max-w-56">
              <MemberName id={row.ownerId} name={row.ownerName} title={row.ownerEmail} className="max-w-full font-normal" />
            </TableCell>
            <TableCell column="meta">{row.taskCount.toLocaleString()}</TableCell>
            <TableCell column="meta">{formatFocusDuration(row.focusSeconds)}</TableCell>
            <TableCell column="meta">
              {row.targetHours ? (
                <div className="min-w-0">
                  <span className="block">{targetLabel(row)}</span>
                  <span className="block text-xs text-muted-foreground">{progressLabel(row)}</span>
                </div>
              ) : null}
            </TableCell>
            <TableCell column="meta" className="hidden 2xl:table-cell">
              {row.isPublic ? <Badge variant="secondary">Public</Badge> : <Badge variant="outline">Private</Badge>}
            </TableCell>
            <TableCell column="mutedMeta" className="hidden 2xl:table-cell">
              {formatDateTime(row.createdAt)}
            </TableCell>
            <TableCell column="actions">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Settings for ${row.name}`}
                onClick={() => setOpen(row.id)}
              >
                <SettingsIcon className="size-4" />
              </Button>
              <AdminRowDeleteButton del={del} id={row.id} label={`Delete ${row.name}`} />
            </TableCell>
          </TableRow>
        ))}
      </AdminListTable>
      <AdminProjectDialog
        openId={search.open}
        me={me}
        onClose={() => setOpen(undefined)}
        onChanged={list.refresh}
        onDelete={(project) => {
          setFromWindow(project)
          setOpen(undefined)
          del.ask([project.id])
        }}
      />
      <AdminDeleteConfirm
        del={del}
        title={
          asked.length === 1 && del.ids.length === 1
            ? `Delete ${asked[0].name}?`
            : `Delete ${del.ids.length} ${plural(del.ids.length, "project", "projects")}?`
        }
        description={describeProjectDeletion(asked, del.ids.length, me)}
        confirmLabel={plural(del.ids.length, "Delete project", "Delete projects")}
      />
    </>
  )
}

/**
 * "2 projects will be deleted. Their 14 tasks are kept with no project, and
 * the focus time stays in each person's History." The task count is the one
 * the Tasks column shows, so the window and the row agree.
 */
function describeProjectDeletion(asked: AskedProject[], count: number, me: string) {
  const known = asked.length === count
  const tasks = asked.reduce((sum, project) => sum + project.taskCount, 0)
  if (count === 1 && known) {
    const [project] = asked
    return `${project.name} will be deleted. ${
      tasks ? `Its ${tasks} ${plural(tasks, "task is", "tasks are")} kept with no project, and the` : "It has no tasks. The"
    } focus time stays in ${project.ownerName}'s History.${toldLine(project, me)} This cannot be undone.`
  }
  const taskLine = !known
    ? "Their tasks are kept with no project"
    : tasks
      ? `Their ${tasks} ${plural(tasks, "task is", "tasks are")} kept with no project`
      : "They have no tasks"
  const mine = asked.filter((project) => project.ownerId === me).length
  const told = !known || mine === 0 ? " Each owner is told in the bell." : mine < count ? " Every owner but you is told in the bell." : ""
  return `${count} ${plural(count, "project", "projects")} will be deleted. ${taskLine}, and the focus time stays in each person's History.${told} This cannot be undone.`
}

type Draft = { name: string; hours: string; period: TargetPeriod }

/**
 * A draft as it would be saved: with no hours the period means nothing, so a
 * period picked and then left without hours does not count as an edit.
 */
function savedForm(draft: Draft) {
  return draft.hours.trim() === "" ? { name: draft.name, hours: "" } : draft
}

function draftOf(project: AdminProject["project"]): Draft {
  return {
    name: project.name,
    hours: project.targetHours === null ? "" : String(project.targetHours),
    period: project.targetPeriod ?? "week",
  }
}

/** A blank box is no target; anything else must be whole hours from 1 to 744. */
function readHours(hours: string) {
  if (hours.trim() === "") return { valid: true, value: null }
  const value = Number(hours)
  return { valid: Number.isInteger(value) && value >= 1 && value <= TARGET_HOURS_MAX, value }
}

/**
 * One project: its figures, its newest tasks, and the same Name and Target
 * hours fields the owner's settings window has, with the same rules. Archive
 * and Bring back act at once, apart from Save. Delete sits hard left.
 */
function AdminProjectDialog({
  openId,
  me,
  onClose,
  onChanged,
  onDelete,
}: {
  openId: string | undefined
  /** The signed-in admin, who is never told about their own change. */
  me: string
  onClose: () => void
  onChanged: () => Promise<void>
  onDelete: (project: AskedProject) => void
}) {
  const [loaded, setLoaded] = React.useState<AdminProject | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [attempt, setAttempt] = React.useState(0)
  const [draft, setDraft] = React.useState<Draft | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [switching, setSwitching] = React.useState(false)
  const [invalid, setInvalid] = React.useState<{ name?: boolean; hours?: boolean }>({})
  const nameId = React.useId()
  const hoursId = React.useId()

  // Closing clears nothing, so the window fades out as it was.
  const [shownFor, setShownFor] = React.useState<string | undefined>(undefined)
  if (shownFor !== openId && openId === undefined) setShownFor(undefined)
  else if (shownFor !== openId) {
    setShownFor(openId)
    setLoaded(null)
    setLoadError(null)
    setDraft(null)
    setInvalid({})
  }

  React.useEffect(() => {
    if (!openId) return
    let live = true
    loadPomodoroAdminProject(openId).then(
      (answer) => {
        if (!live) return
        setLoaded(answer)
        setDraft(draftOf(answer.project))
      },
      (error) => {
        if (live) setLoadError(getAdminProjectErrorMessage(error))
      }
    )
    return () => {
      live = false
    }
  }, [openId, attempt])

  const project = loaded?.project ?? null
  const dirty =
    project !== null &&
    draft !== null &&
    JSON.stringify(savedForm(draft)) !== JSON.stringify(savedForm(draftOf(project)))
  const update = (patch: Partial<Draft>) => setDraft((current) => (current ? { ...current, ...patch } : current))
  const hours = draft ? readHours(draft.hours) : { valid: true, value: null }

  const save = async () => {
    if (!draft || !project) return
    const name = draft.name.trim()
    const problems = { name: !name, hours: !hours.valid }
    if (problems.name || problems.hours) {
      setInvalid(problems)
      showErrorToast(problems.name ? "A project needs a name." : `A whole number of hours from 1 to ${TARGET_HOURS_MAX}.`)
      return
    }
    setSaving(true)
    try {
      const { changed } = await updatePomodoroAdminProject(
        project.id,
        name,
        hours.value === null ? null : { hours: hours.value, period: draft.period }
      )
      toast.success(changed ? `Saved.${toldLine(project, me)}` : "Nothing had changed.")
      await onChanged()
      onClose()
    } catch (error) {
      if (error instanceof Error && error.message.includes("PROJECT_NAME_TAKEN")) setInvalid({ name: true })
      showErrorToast(getAdminProjectErrorMessage(error))
      // The message says the list was refreshed, so it is.
      if (isGone(error)) {
        await onChanged()
        onClose()
      }
    } finally {
      setSaving(false)
    }
  }

  // Archive and Bring back take effect at once and keep anything typed.
  const setArchived = async (archived: boolean) => {
    if (!project) return
    setSwitching(true)
    try {
      await setPomodoroAdminProjectArchived(project.id, archived)
      // Only the state moved, so the window changes it in place rather than
      // reading the project again, which could fail after the archive landed.
      setLoaded((current) =>
        current ? { ...current, project: { ...current.project, archivedAt: archived ? new Date() : null } } : current
      )
      toast.success(`${project.name} ${archived ? "is archived" : "is back"}.${toldLine(project, me)}`)
      await onChanged()
    } catch (error) {
      showErrorToast(getAdminProjectErrorMessage(error))
      if (isGone(error)) {
        await onChanged()
        onClose()
      }
    } finally {
      setSwitching(false)
    }
  }

  const busy = saving || switching

  return (
    <FormDialog open={openId !== undefined} dirty={dirty} busy={busy} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>{project?.name ?? "Project"}</DialogTitle>
            <DialogDescription>
              {project
                ? `${project.archivedAt ? "Archived" : "Live"}, owned by ${project.ownerName}.${
                    project.ownerId === me ? "" : " The owner is told about every change, never by whom."
                  }`
                : "Reading the project…"}
            </DialogDescription>
          </DialogHeader>
          {/* noValidate: the browser's own bubble would refuse a 0 in the
              hours box before Save runs, and the rule is reported by the
              error toast instead. */}
          <form
            noValidate
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault()
              void save()
            }}
          >
            <DialogBody>
              {loadError ? (
                <ErrorRow
                  message={loadError}
                  onRetry={() => {
                    setLoadError(null)
                    setAttempt((count) => count + 1)
                  }}
                />
              ) : !loaded || !project || !draft ? (
                <LoadingRow label="Loading…" className="min-h-48" />
              ) : (
                <>
                  <Card size="sm">
                    <CardHeader>
                      <CardTitle>Figures</CardTitle>
                      <CardDescription>The same sums the owner's Projects card shows.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-2">
                      <DetailRow
                        label="Owner"
                        value={<MemberName id={project.ownerId} name={project.ownerName} title={project.ownerEmail} />}
                      />
                      <DetailRow label="Tasks" value={project.taskCount.toLocaleString()} />
                      <DetailRow label="Focused, all time" value={formatFocusDuration(project.focusSeconds)} />
                      <DetailRow label="Target" value={targetLabel(project) || "None"} />
                      {project.targetPeriod ? (
                        <DetailRow label="So far" value={progressLabel(project)} />
                      ) : null}
                      <DetailRow label="On their public profile" value={project.isPublic ? "Yes" : "No"} />
                      <DetailRow
                        label="State"
                        value={project.archivedAt ? `Archived ${formatDate(project.archivedAt)}` : "Live"}
                      />
                      <DetailRow label="Made" value={formatDate(project.createdAt)} />
                    </CardContent>
                  </Card>

                  <Card size="sm">
                    <CardHeader>
                      <CardTitle>Settings</CardTitle>
                    </CardHeader>
                    <CardContent className="grid gap-4">
                      <div className="grid gap-2">
                        <FieldLabel htmlFor={nameId}>Name</FieldLabel>
                        <Input
                          id={nameId}
                          maxLength={PROJECT_NAME_MAX_LENGTH}
                          value={draft.name}
                          autoComplete="off"
                          aria-invalid={invalid.name || undefined}
                          onChange={(event) => {
                            setInvalid((current) => ({ ...current, name: false }))
                            update({ name: event.target.value })
                          }}
                          onBlur={() => setInvalid((current) => ({ ...current, name: !draft.name.trim() }))}
                        />
                      </div>
                      <div className="grid gap-2">
                        <FieldLabel htmlFor={hoursId} hint={`Leave it blank for no target. Whole hours from 1 to ${TARGET_HOURS_MAX}.`}>
                          Target hours
                        </FieldLabel>
                        <div className="flex items-center gap-2">
                          <Input
                            id={hoursId}
                            type="number"
                            inputMode="numeric"
                            min={1}
                            max={TARGET_HOURS_MAX}
                            step={1}
                            value={draft.hours}
                            placeholder="None"
                            className="w-24"
                            aria-invalid={invalid.hours || undefined}
                            onChange={(event) => {
                              setInvalid((current) => ({ ...current, hours: false }))
                              update({ hours: event.target.value })
                            }}
                            onBlur={() => setInvalid((current) => ({ ...current, hours: !readHours(draft.hours).valid }))}
                          />
                          <Select
                            value={draft.period}
                            onValueChange={(value) => update({ period: value as TargetPeriod })}
                            disabled={draft.hours.trim() === ""}
                          >
                            <SelectTrigger aria-label="How often the target resets">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {targetPeriods.map((value) => (
                                <SelectItem key={value} value={value}>
                                  {targetPeriodLabels[value]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card size="sm">
                    <CardHeader>
                      <CardTitle>Newest tasks</CardTitle>
                      <CardDescription>
                        {loaded.tasks.length < project.taskCount
                          ? `The last ${loaded.tasks.length} of ${project.taskCount}.`
                          : `${project.taskCount} ${plural(project.taskCount, "task", "tasks")}.`}
                      </CardDescription>
                      <CardAction>
                        <SeeAll
                          to="/admin/pomodoro-tasks"
                          search={{ user: project.ownerId }}
                          label="Owner's tasks"
                        />
                      </CardAction>
                    </CardHeader>
                    <CardContent>
                      <ShortList
                        empty="No tasks in this project."
                        rows={loaded.tasks.map((task) => ({
                          id: task.id,
                          main: task.title,
                          meta: `${TASK_STATUS_LOOK[task.status]?.label ?? task.status} · ${formatUtcDate(task.plannedDate)} · ${task.pomodoroCount} ${plural(task.pomodoroCount, "session", "sessions")}`,
                        }))}
                      />
                    </CardContent>
                  </Card>
                </>
              )}
            </DialogBody>
            <DialogFooter>
              {project ? (
                <div className="mr-auto flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={busy}
                    onClick={() =>
                      onDelete({
                        id: project.id,
                        name: project.name,
                        taskCount: project.taskCount,
                        ownerId: project.ownerId,
                        ownerName: project.ownerName,
                      })
                    }
                  >
                    <Trash2Icon className="size-4" />
                    Delete
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void setArchived(!project.archivedAt)}
                  >
                    {switching ? (
                      <Loader2Icon className="size-4 animate-spin" />
                    ) : project.archivedAt ? (
                      <ArchiveRestoreIcon className="size-4" />
                    ) : (
                      <ArchiveIcon className="size-4" />
                    )}
                    {project.archivedAt ? "Bring back" : "Archive"}
                  </Button>
                </div>
              ) : null}
              <Button type="button" variant="outline" onClick={requestClose} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || !draft}>
                {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
                Save changes
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}
