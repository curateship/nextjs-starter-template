import * as React from "react"
import { getRouteApi } from "@tanstack/react-router"
import { ArchiveIcon, ArchiveRestoreIcon, FolderIcon, ListChecksIcon, Loader2Icon, Trash2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ErrorRow } from "@/components/ui/error-row"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { LoadingRow } from "@/components/ui/loading-row"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { TableCell } from "@/components/ui/table"
import { SelectedMenuRow } from "@/components/shared/mass-select"
import { PickGroup, PickRow } from "@/components/shared/notes/pick-rows"
import { TabbedMenu } from "@/components/shared/notes/tabbed-menu"
import { PanelCard } from "@/components/shared/panel-card"
import type { TableHeaderColumn } from "@/components/shared/sortable-table-header"
import { Chip, MainCell } from "@/components/crm/crm-table"
import { FooterState, RecordFrame } from "@/components/crm/record-frame"
import { AdminListTable, AdminRow, useAdminList } from "@/components/pomodoro/admin-list"
import { AdminDeleteConfirm, useAdminDelete } from "@/components/pomodoro/admin-delete"
import { MemberName } from "@/components/pomodoro/admin-member-name"
import { DetailRow, SeeAll, ShortList } from "@/components/pomodoro/admin-member-record"
import { NoRecord } from "@/components/pomodoro/flowfly/detail-record"
import { FilterPick } from "@/components/pomodoro/flowfly/filter-pick"
import { useFlowflySearch } from "@/components/pomodoro/flowfly/flowfly-context"
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
import { useListSearchNavigate, useListSort } from "@/lib/nav/list-search"
import {
  TASK_STATUS_LOOK,
  type PROJECT_STATE_FILTERS,
  type PROJECT_TARGET_FILTERS,
  type PROJECT_VISIBILITY_FILTERS,
  type ProjectSortColumn,
} from "@/lib/pomodoro/admin-lists"
import { formatFocusDuration } from "@/lib/pomodoro/focus-history"
import { ADMIN_PROJECT_TONES, projectInitial, projectToneIndex } from "@/lib/pomodoro/project-initial"
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

const authenticatedRoute = getRouteApi("/_authenticated")

type SortColumn = ProjectSortColumn
type Column = SortColumn | "target" | "public"
const UNSORTABLE: Column[] = ["target", "public"]

type ProjectsSearch = {
  q?: string
  user?: string
  state?: (typeof PROJECT_STATE_FILTERS)[number]
  visibility?: (typeof PROJECT_VISIBILITY_FILTERS)[number]
  target?: (typeof PROJECT_TARGET_FILTERS)[number]
  sort?: SortColumn
  direction?: "asc" | "desc"
  page?: number
}

const COLUMNS: TableHeaderColumn<Column>[] = [
  { key: "name", label: "Project", column: "main" },
  { key: "owner", label: "Owner", column: "meta", className: "hidden md:hidden @2xl:table-cell" },
  { key: "tasks", label: "Tasks", column: "meta", className: "hidden md:hidden @4xl:table-cell" },
  { key: "hours", label: "Focused", column: "meta" },
  { key: "target", label: "Target", column: "meta", sortable: false, className: "hidden md:hidden @5xl:table-cell" },
  { key: "public", label: "Profile", column: "meta", sortable: false, className: "hidden md:hidden @6xl:table-cell" },
  { key: "created", label: "Made", column: "meta", className: "hidden md:hidden @7xl:table-cell" },
]

function ProjectSquare({ name }: { name: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-6 shrink-0 place-items-center rounded-md text-xs font-semibold",
        ADMIN_PROJECT_TONES[projectToneIndex(name)]
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
 * Tasks → Projects on the Flowfly dashboard: every member's projects (admin
 * task 07), owner, tasks, hours, target and where it stands. A project opens
 * on the right, where its window used to: its figures and newest tasks,
 * Archive or Bring back at the foot, and its name and target hours in the ⋮,
 * each saving as it is left. Delete sits on a row, over ticked rows and in
 * the ⋮. See `workspace/docs/admin-sections.md`.
 */
export function AdminProjectsDashboard({
  initial,
  initialPageSize,
}: {
  initial: { rows: AdminProjectRow[]; total: number }
  initialPageSize: number
}) {
  const search = useFlowflySearch<ProjectsSearch>()
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
  const load = React.useCallback(
    (pageSize: number) => listPomodoroProjects({ search: query, user: userId, state, visibility, target, sort, direction, page, pageSize }),
    [direction, page, query, sort, state, target, userId, visibility]
  )
  const list = useAdminList({ initial, initialPageSize, page, onPageChange: setPage, load })
  const toggleSort = useListSort<SortColumn>({ sort, direction }, (column) =>
    column === "name" || column === "owner" ? "asc" : "desc"
  )
  const selection = useSelection()
  const rowIds = React.useMemo(() => list.rows.map((row) => row.id), [list.rows])

  const del = useAdminDelete({
    one: "project",
    many: "projects",
    run: deletePomodoroProjects,
    keptReason: "already gone",
    selection,
    onDone: list.refresh,
  })
  const asked: AskedProject[] = del.ids.flatMap((id) => list.rows.filter((row) => row.id === id))
  const setFilter = (key: "state" | "visibility" | "target", value: string | undefined) =>
    setListSearch({ [key]: value, page: undefined })
  // Each record remembers its read; a change reads the open one again.
  const [refreshes, setRefreshes] = React.useState(0)
  const changed = async () => {
    await list.refresh()
    setRefreshes((count) => count + 1)
  }

  return (
    <AdminListTable
      noun="projects"
      columns={COLUMNS}
      sort={sort}
      direction={direction}
      onSort={(column) => {
        if (!UNSORTABLE.includes(column)) toggleSort(column as SortColumn)
      }}
      selection={{ noun: "projects", rowIds, state: selection }}
      list={list}
      page={page}
      onPageChange={setPage}
      search={{
        name: "project-search",
        label: "Search projects",
        placeholder: "Search project or owner",
        value: query,
        onChange: (text) => setListSearch({ q: text.trim() ? text : undefined, page: undefined }),
      }}
      person={
        userId
          ? {
              name: list.rows.find((row) => row.ownerId === userId)?.ownerName ?? null,
              onClear: () => setListSearch({ user: undefined, page: undefined }),
            }
          : undefined
      }
      filter={{
        count: [state, visibility, target].filter((value) => value !== "all").length,
        onClear: () => setListSearch({ state: undefined, visibility: undefined, target: undefined, page: undefined }),
        children: (
          <>
            <FilterPick
              id="projects-state"
              label="State"
              value={state === "all" ? undefined : state}
              any="Live and archived"
              options={[
                ["live", "Live"],
                ["archived", "Archived"],
              ]}
              onChange={(next) => setFilter("state", next)}
            />
            <FilterPick
              id="projects-visibility"
              label="Profile"
              value={visibility === "all" ? undefined : visibility}
              any="Public and private"
              options={[
                ["public", "On their profile"],
                ["private", "Private"],
              ]}
              onChange={(next) => setFilter("visibility", next)}
            />
            <FilterPick
              id="projects-target"
              label="Target"
              value={target === "all" ? undefined : target}
              any="With or without a target"
              options={[
                ["target", "Has a target"],
                ["none", "No target"],
              ]}
              onChange={(next) => setFilter("target", next)}
            />
          </>
        ),
      }}
      bulk={(ids, menu) => (
        <SelectedMenuRow
          className="text-destructive"
          onClick={() => {
            menu.close()
            del.ask(ids)
          }}
        >
          <Trash2Icon className="size-4" />
          Delete
        </SelectedMenuRow>
      )}
      bulkBusy={del.deleting}
      rowIds={rowIds}
      record={{
        label: "Project",
        content: (openId) =>
          openId ? (
            <ProjectRecord key={`${openId}-${refreshes}`} projectId={openId} me={me} onChanged={changed} onDelete={() => del.ask([openId])} />
          ) : (
            <NoRecord title="Project" icon={<FolderIcon aria-hidden />} line="No member has made a project yet." />
          ),
      }}
      windows={
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
      }
    >
      {list.rows.map((row) => (
        <AdminRow key={row.id} id={row.id} label={row.name} onDelete={() => del.ask([row.id])}>
          <MainCell name={row.name} lead={<ProjectSquare name={row.name} />}>
            {/* Archived is said beside the name rather than in a column of its own. */}
            {row.archivedAt ? <Chip muted>Archived</Chip> : null}
          </MainCell>
          <TableCell column="meta" className="hidden max-w-56 md:hidden @2xl:table-cell">
            <MemberName id={row.ownerId} name={row.ownerName} title={row.ownerEmail} className="max-w-full font-normal" />
          </TableCell>
          <TableCell column="meta" className="hidden md:hidden @4xl:table-cell">
            {row.taskCount.toLocaleString()}
          </TableCell>
          <TableCell column="meta">{formatFocusDuration(row.focusSeconds)}</TableCell>
          <TableCell column="meta" className="hidden md:hidden @5xl:table-cell">
            {row.targetHours ? (
              <div className="min-w-0">
                <span className="block">{targetLabel(row)}</span>
                <span className="block text-xs text-muted-foreground">{progressLabel(row)}</span>
              </div>
            ) : null}
          </TableCell>
          <TableCell column="meta" className="hidden md:hidden @6xl:table-cell">
            <Chip muted>{row.isPublic ? "Public" : "Private"}</Chip>
          </TableCell>
          <TableCell column="mutedMeta" className="hidden md:hidden @7xl:table-cell">
            {formatDateTime(row.createdAt)}
          </TableCell>
        </AdminRow>
      ))}
    </AdminListTable>
  )
}

/**
 * "2 projects will be deleted. Their 14 tasks are kept with no project, and
 * the focus time stays in each person's Stats." The task count is the one
 * the Tasks column shows, so the window and the row agree.
 */
function describeProjectDeletion(asked: AskedProject[], count: number, me: string) {
  const known = asked.length === count
  const tasks = asked.reduce((sum, project) => sum + project.taskCount, 0)
  if (count === 1 && known) {
    const [project] = asked
    return `${project.name} will be deleted. ${
      tasks ? `Its ${tasks} ${plural(tasks, "task is", "tasks are")} kept with no project, and the` : "It has no tasks. The"
    } focus time stays in ${project.ownerName}'s Stats.${toldLine(project, me)} This cannot be undone.`
  }
  const taskLine = !known
    ? "Their tasks are kept with no project"
    : tasks
      ? `Their ${tasks} ${plural(tasks, "task is", "tasks are")} kept with no project`
      : "They have no tasks"
  const mine = asked.filter((project) => project.ownerId === me).length
  const told = !known || mine === 0 ? " Each owner is told in the bell." : mine < count ? " Every owner but you is told in the bell." : ""
  return `${count} ${plural(count, "project", "projects")} will be deleted. ${taskLine}, and the focus time stays in each person's Stats.${told} This cannot be undone.`
}

/** A blank box is no target; anything else must be whole hours from 1 to 744. */
function readHours(hours: string) {
  if (hours.trim() === "") return { valid: true, value: null }
  const value = Number(hours)
  return { valid: Number.isInteger(value) && value >= 1 && value <= TARGET_HOURS_MAX, value }
}

/**
 * One project on the right (admin task 07), where its window used to be:
 * its figures and its newest tasks, Archive or Bring back at the foot, and
 * the same Name and Target hours the owner's settings window has, with the
 * same rules, in the ⋮. A field saves when it is left; Archive and Bring
 * back act at once. The owner is told about every change, never by whom.
 */
function ProjectRecord({
  projectId,
  me,
  onChanged,
  onDelete,
}: {
  projectId: string
  /** The signed-in admin, who is never told about their own change. */
  me: string
  onChanged: () => Promise<void>
  onDelete: () => void
}) {
  const [loaded, setLoaded] = React.useState<AdminProject | null>(null)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [attempt, setAttempt] = React.useState(0)
  const [switching, setSwitching] = React.useState(false)
  const [menuOpen, setMenuOpen] = React.useState(false)
  const ids = { name: React.useId(), hours: React.useId() }

  React.useEffect(() => {
    let live = true
    loadPomodoroAdminProject(projectId).then(
      (answer) => {
        if (live) setLoaded(answer)
      },
      (error) => {
        if (live) setLoadError(getAdminProjectErrorMessage(error))
      }
    )
    return () => {
      live = false
    }
  }, [projectId, attempt])

  const project = loaded?.project ?? null

  /** Saves the name and target together, as the server takes them, and says what went wrong. */
  const save = async (next: { name: string; hours: string; period: TargetPeriod }) => {
    if (!project) return
    const name = next.name.trim()
    const hours = readHours(next.hours)
    if (!name) return showErrorToast("A project needs a name.")
    if (!hours.valid) return showErrorToast(`A whole number of hours from 1 to ${TARGET_HOURS_MAX}.`)
    const same =
      name === project.name &&
      (hours.value ?? null) === project.targetHours &&
      (hours.value === null || next.period === project.targetPeriod)
    if (same) return
    try {
      await updatePomodoroAdminProject(project.id, name, hours.value === null ? null : { hours: hours.value, period: next.period })
      await onChanged()
    } catch (error) {
      showErrorToast(getAdminProjectErrorMessage(error))
      if (isGone(error)) await onChanged()
    }
  }

  // Archive and Bring back take effect at once.
  const setArchived = async (archived: boolean) => {
    if (!project) return
    setSwitching(true)
    try {
      await setPomodoroAdminProjectArchived(project.id, archived)
      setLoaded((current) =>
        current ? { ...current, project: { ...current.project, archivedAt: archived ? new Date() : null } } : current
      )
      await onChanged()
    } catch (error) {
      showErrorToast(getAdminProjectErrorMessage(error))
      if (isGone(error)) await onChanged()
    } finally {
      setSwitching(false)
    }
  }

  if (!project || !loaded) {
    return (
      <RecordFrame
        avatar={<FolderIcon aria-hidden />}
        title="Project"
        hideLabel="Hide the project"
        body={
          loadError ? (
            <ErrorRow
              message={loadError}
              onRetry={() => {
                setLoadError(null)
                setAttempt((count) => count + 1)
              }}
            />
          ) : (
            <LoadingRow label="Reading the project…" />
          )
        }
      />
    )
  }

  const current = { name: project.name, hours: project.targetHours === null ? "" : String(project.targetHours), period: project.targetPeriod ?? "week" }

  return (
    <RecordFrame
      avatar={<ProjectSquare name={project.name} />}
      title={project.name}
      line={`Owned by ${project.ownerName}${project.ownerId === me ? " (you)" : ""}`}
      hideLabel="Hide the project"
      actions={
        <TabbedMenu
          label="Project menu"
          align="end"
          width="20.4rem"
          open={menuOpen}
          onOpenChange={setMenuOpen}
          tabs={[
            {
              value: "general",
              label: "General",
              content: (
                <div className="grid gap-4 p-3">
                  <PickGroup title="Project">
                    <PickRow label="Name" value={project.name}>
                      <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
                        <FieldLabel htmlFor={ids.name}>Name</FieldLabel>
                        <Input
                          id={ids.name}
                          maxLength={PROJECT_NAME_MAX_LENGTH}
                          defaultValue={project.name}
                          autoComplete="off"
                          onBlur={(event) => void save({ ...current, name: event.target.value })}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") event.currentTarget.blur()
                          }}
                        />
                      </div>
                    </PickRow>
                    <PickRow label="Target" value={targetLabel(project) || "None"} empty={!project.targetHours}>
                      <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
                        <FieldLabel htmlFor={ids.hours} hint={`Leave it blank for no target. Whole hours from 1 to ${TARGET_HOURS_MAX}.`}>
                          Target hours
                        </FieldLabel>
                        <div className="flex items-center gap-2">
                          <Input
                            id={ids.hours}
                            type="number"
                            inputMode="numeric"
                            min={1}
                            max={TARGET_HOURS_MAX}
                            step={1}
                            defaultValue={current.hours}
                            placeholder="None"
                            className="w-24"
                            onBlur={(event) => void save({ ...current, hours: event.target.value })}
                          />
                          <Select
                            defaultValue={current.period}
                            onValueChange={(value) => void save({ ...current, period: value as TargetPeriod })}
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
                    </PickRow>
                  </PickGroup>
                  <div className="grid">
                    <div className="-mx-3 mb-1 border-t" />
                    <Button
                      type="button"
                      variant="ghost"
                      className="w-full justify-start gap-2 px-2 font-normal text-destructive hover:text-destructive [&_svg]:size-4"
                      onClick={() => {
                        setMenuOpen(false)
                        onDelete()
                      }}
                    >
                      <Trash2Icon />
                      Delete project
                    </Button>
                  </div>
                </div>
              ),
            },
          ]}
        />
      }
      body={
        <>
          <PanelCard storageId="pomodoro-flowfly-project-figures" icon={<FolderIcon />} title="Figures">
            <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
              <DetailRow label="Owner" value={<MemberName id={project.ownerId} name={project.ownerName} title={project.ownerEmail} />} />
              <DetailRow label="Tasks" value={project.taskCount.toLocaleString()} />
              <DetailRow label="Focused, all time" value={formatFocusDuration(project.focusSeconds)} />
              <DetailRow label="Target" value={targetLabel(project) || "None"} />
              {project.targetPeriod ? <DetailRow label="So far" value={progressLabel(project)} /> : null}
              <DetailRow label="On their public profile" value={project.isPublic ? "Yes" : "No"} />
              <DetailRow label="Made" value={formatDate(project.createdAt)} />
            </div>
          </PanelCard>
          <PanelCard
            storageId="pomodoro-flowfly-project-tasks"
            icon={<ListChecksIcon />}
            title="Newest tasks"
            meta={loaded.tasks.length < project.taskCount ? `The last ${loaded.tasks.length} of ${project.taskCount}` : undefined}
          >
            <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
              <ShortList
                empty="No tasks in this project."
                rows={loaded.tasks.map((task) => ({
                  id: task.id,
                  main: task.title,
                  meta: `${TASK_STATUS_LOOK[task.status]?.label ?? task.status} · ${formatUtcDate(task.plannedDate)} · ${task.pomodoroCount} ${plural(task.pomodoroCount, "session", "sessions")}`,
                }))}
              />
              <SeeAll tab="tasks" search={{ user: project.ownerId }} label="Owner's tasks" />
            </div>
          </PanelCard>
        </>
      }
      footer={
        <>
          <FooterState>
            <span className="truncate text-muted-foreground">
              {project.archivedAt ? `Archived ${formatDate(project.archivedAt)}` : "Live"}
            </span>
          </FooterState>
          <Button type="button" variant="outline" disabled={switching} onClick={() => void setArchived(!project.archivedAt)}>
            {switching ? <Loader2Icon className="animate-spin" /> : project.archivedAt ? <ArchiveRestoreIcon /> : <ArchiveIcon />}
            {project.archivedAt ? "Bring back" : "Archive"}
          </Button>
        </>
      }
    />
  )
}
