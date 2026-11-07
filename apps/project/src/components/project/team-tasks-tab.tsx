import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { EllipsisVerticalIcon, ListChecksIcon, Loader2Icon, PlusIcon, SearchIcon } from "lucide-react"

import { NewTaskWithProjectPicker } from "@/components/project/new-task-header"
import { ReasonDialog } from "@/components/project/reason-dialog"
import { SaveViewDialog, SavedViewsControls } from "@/components/project/saved-views"
import { DELETE_TASK_DETAIL, DELETE_TASK_QUESTION, showBinnedToast } from "@/components/project/task-body"
import { TaskFilterPopover, type FilterProject } from "@/components/project/task-filter-popover"
import { SearchToggle } from "@/components/project/task-header-controls"
import { TaskList, type ProjectColumn } from "@/components/project/task-list"
import { PointAnchor, TaskRightClickMenu } from "@/components/project/task-right-click"
import { DashboardCardHeader } from "@/components/shared/dashboard-card-header"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { deleteProjectTask, duplicateProjectTask, saveTask, setStatus, type TaskCard } from "@/lib/api/project/tasks"
import type { TeamTasks } from "@/lib/api/project/teams"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useSyncedDraft } from "@/lib/hooks/use-synced-draft"
import { clientChoices } from "@/lib/project/clients"
import { getProjectErrorMessage } from "@/lib/project/errors"
import type { ListDrop } from "@/lib/project/list-drop"
import { dropChange } from "@/lib/project/my-task-order"
import { TEAM_TASK_FOLDS_KEY, TEAM_TASK_GROUPING_KEY } from "@/lib/project/panel-keys"
import { isTaskPriority, isTaskStatus, type TaskPriority, type TaskStatus } from "@/lib/project/rules"
import { pickedWordsUnder, readRightClick } from "@/lib/project/right-click"
import { viewHasFilters } from "@/lib/project/saved-views"
import { MY_GROUPING_LABEL, TASK_GROUPING_LABEL, canMoveInGroup, groupMyTasks, groupTasks } from "@/lib/project/task-groups"
import { filterTasks, hasTaskFilters, NO_TASK_FILTERS, type TaskFilters } from "@/lib/project/task-filters"
import { useRememberedChoice } from "@/lib/remembered-choice"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * Filter's Group row on the Tasks tab: Status first (Tyler, 7 Nov 2026, "grouped
 * by status"), then the project List's groupings, Project, since the tasks come
 * from every project of the team, and None.
 */
const TEAM_GROUPINGS = ["status", "priority", "due", "assignee", "project", "none"] as const
type TeamGrouping = (typeof TEAM_GROUPINGS)[number]
const TEAM_GROUPING_LABEL: Record<TeamGrouping, string> = {
  status: MY_GROUPING_LABEL.status,
  priority: MY_GROUPING_LABEL.priority,
  due: MY_GROUPING_LABEL.due,
  assignee: MY_GROUPING_LABEL.assignee,
  project: MY_GROUPING_LABEL.project,
  none: TASK_GROUPING_LABEL.none,
}

/**
 * The Team dashboard's Tasks tab, first in its middle panel (task "Team
 * dashboard/admin-3-panel-design", Tyler, 7 Nov 2026: "Middle panel should
 * now show all the tasks from the team. So tasks, calender, activity"): the
 * project page's table of every task the viewer can see in the team's shared
 * projects, with a Project and an Assigned to column, under Status headings.
 * The header has, left to right: the panel's tabs, the "N selected" slot,
 * Filter, Views, New task, and the ⋮ holding Search and Mass select. With Mass
 * select on, a row dragged under another status, priority or due date takes
 * it; a drop that would hand the task over or move it to another project
 * isn't offered.
 */
export function TeamTasksTab({
  source,
  tabs,
  below,
  today,
  teamId,
  myUserId,
  canRun,
  people,
  filters,
  onFilters,
  onOpenTask,
  onRows,
}: {
  source: TeamTasks
  /** The panel's Tasks, Calendar and Activity tabs, first in the header. */
  tabs: React.ReactNode
  /** What sits under the header on every tab, the announcement. */
  below: React.ReactNode
  /** The team's own today, which a drop under Today or Tomorrow dates from. */
  today: string
  teamId: string | undefined
  myUserId: string
  /** The site admin, who may delete any task. */
  canRun: boolean
  /** Who Assigned to and the bulk menu's Hand to offer. */
  people: { id: string; name: string; avatarUrl?: string }[]
  filters: TaskFilters
  onFilters: (patch: Partial<TaskFilters>) => void
  onOpenTask: (taskId: string) => void
  /** The rows in order, so the first one can open on arrival. */
  onRows: (ids: string[]) => void
}) {
  const router = useRouter()
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  // A change shows at once and is put back if the server refuses it.
  const [tasks, setTasks] = useSyncedDraft(source.tasks)
  const [grouping, setGrouping] = useRememberedChoice<TeamGrouping>(TEAM_TASK_GROUPING_KEY, "status", TEAM_GROUPINGS)
  const [selectedSlot, setSelectedSlot] = React.useState<HTMLDivElement | null>(null)
  const [searchOpen, setSearchOpen] = React.useState(false)
  const searchFromMenu = React.useRef(false)
  const [massSelectOn, setMassSelectOn] = React.useState(false)
  // The row whose right-click turned Mass select on, ticked as it starts.
  const [tickOnStart, setTickOnStart] = React.useState<string | null>(null)
  const [stuck, setStuck] = React.useState<TaskCard | null>(null)
  const [deleting, setDeleting] = React.useState<TaskCard | null>(null)
  const [taskMenu, setTaskMenu] = React.useState<{ x: number; y: number; task: TaskCard } | null>(null)
  const [pointNew, setPointNew] = React.useState<{ x: number; y: number } | null>(null)
  const rightPress = React.useRef(false)
  const [savingView, setSavingView] = React.useState(false)

  // A task is deleted by whoever made it, or by the site admin, as on a project's List.
  const canDelete = (task: TaskCard) => canRun || task.createdByUserId === myUserId
  const color = React.useMemo(() => new Map(source.projects.map((project) => [project.id, project.color])), [source.projects])
  const projectColumn = React.useMemo<ProjectColumn>(
    () => ({ of: (task) => ({ name: task.projectName, color: color.get(task.projectId) ?? "slate" }) }),
    [color]
  )
  const filterProjects = React.useMemo<FilterProject[]>(
    () => source.projects.map((project) => ({ id: project.id, name: project.name, color: project.color })),
    [source.projects]
  )
  const clients = clientChoices(tasks.map((task) => task.projectClient))
  const here = { screen: source.viewScreen, clients, projects: filterProjects }
  const bulk = { people, projects: [] }

  const filtered = hasTaskFilters(filters)
  const rows = filterTasks(tasks, filters)
  const grouped =
    grouping === "none" ? null : grouping === "project" ? groupMyTasks(rows, "project") : groupTasks(rows, grouping)
  // Only where a drop changes the task itself; Assigned to and Project would hand it over or move it.
  const drags = grouping === "status" || grouping === "priority" || grouping === "due"
  const onDrop = filtered || busy || !grouped || !drags ? undefined : (drop: ListDrop) => void dropRow(drop)

  async function moveField(task: TaskCard, patch: Partial<TaskCard>, save: () => Promise<unknown>) {
    const before = tasks
    setTasks((current) => current.map((t) => (t.id === task.id ? { ...t, ...patch } : t)))
    const ok = await run(save)
    if (!ok) setTasks(before)
    await router.invalidate()
  }

  async function changeStatus(task: TaskCard, status: TaskStatus, stuckReason: string | null) {
    if (task.status === status) return true
    const before = tasks
    setTasks((current) => current.map((t) => (t.id === task.id ? { ...t, status, stuckReason } : t)))
    const ok = await run(() => setStatus({ taskId: task.id, status, stuckReason }), status === "stuck" ? "Marked Stuck." : undefined)
    if (!ok) setTasks(before)
    await router.invalidate()
    return ok
  }

  /** A row let go under another heading takes that heading's status, priority or due date. */
  async function dropRow(drop: ListDrop) {
    const task = tasks.find((t) => t.id === drop.taskId)
    if (!task || drop.from === drop.to) return
    if (grouping === "status" && isTaskStatus(drop.to)) {
      if (drop.to === "stuck") return setStuck(task)
      return void changeStatus(task, drop.to, null)
    }
    if (grouping === "priority" && isTaskPriority(drop.to)) {
      const priority: TaskPriority = drop.to
      return moveField(task, { priority }, () => saveTask({ taskId: task.id, priority }))
    }
    if (grouping === "due") {
      const change = dropChange(drop.to, today)
      if (!change || !("dueDate" in change)) return
      return moveField(task, { dueDate: change.dueDate, dueAt: null }, () => saveTask({ taskId: task.id, dueDate: change.dueDate }))
    }
  }

  /** A heading's "+": the new task starts in that heading's status, priority or project. */
  function addUnder(heading: string, button: React.ReactNode) {
    return (
      <NewTaskWithProjectPicker
        align="start"
        teamId={teamId}
        start={
          grouping === "status" && isTaskStatus(heading) && heading !== "archived"
            ? { status: heading }
            : grouping === "priority" && isTaskPriority(heading)
              ? { priority: heading }
              : undefined
        }
        projectId={grouping === "project" ? heading : filters.project}
      >
        {() => button}
      </NewTaskWithProjectPicker>
    )
  }

  /** A task's Duplicate and Delete, or New task at the mouse on empty space. */
  function rightClick(event: React.MouseEvent) {
    const onPickedWords = rightPress.current
    rightPress.current = false
    if (!(event.target instanceof Element) || !event.currentTarget.contains(event.target)) return
    const target = readRightClick(event.target, onPickedWords)
    if (!target) return
    const box = event.target.getBoundingClientRect()
    const at = event.clientX || event.clientY ? { x: event.clientX, y: event.clientY } : { x: box.left, y: box.bottom }
    if (!onPickedWords) window.getSelection()?.removeAllRanges()
    event.preventDefault()
    if (target.kind === "task") {
      const task = tasks.find((t) => t.id === target.taskId)
      if (!task) return
      setPointNew(null)
      setTaskMenu({ ...at, task })
      return
    }
    setTaskMenu(null)
    setPointNew(at)
  }

  async function duplicate(task: TaskCard) {
    let copyId = ""
    const ok = await run(async () => {
      copyId = (await duplicateProjectTask(task.id)).id
    }, "Task copied. This is the copy.")
    if (!ok) return
    await router.invalidate()
    onOpenTask(copyId)
  }

  async function remove(task: TaskCard) {
    const ok = await run(() => deleteProjectTask(task.id))
    if (!ok) return
    setDeleting(null)
    showBinnedToast(task.id, router)
    await router.invalidate()
  }

  function saveView() {
    if (!viewHasFilters(filters)) {
      showErrorToast("Search or pick a filter first, then save it as a view.")
      return
    }
    setSavingView(true)
  }

  const toggleMassSelect = () => {
    setTickOnStart(null)
    setMassSelectOn(!massSelectOn)
  }
  const noMatch = (
    <span className="grid justify-items-start gap-2">
      <span>No tasks match {filters.q?.trim() ? `"${filters.q.trim()}"` : "these filters"}.</span>
      <Button type="button" variant="outline" size="sm" onClick={() => onFilters(NO_TASK_FILTERS)}>
        Clear filters
      </Button>
    </span>
  )

  return (
    <>
      <DashboardCardHeader className="@container">
        {tabs}
        {/* The buttons sit at the header's right end, as on My dashboard and the Calendar tab. */}
        <span className="flex-1" />
        <div className="flex shrink-0 items-center gap-1">
          <div ref={setSelectedSlot} className="contents" />
          <SearchToggle
            value={filters.q ?? ""}
            onChange={(q) => onFilters({ q: q || undefined })}
            open={searchOpen}
            onOpenChange={setSearchOpen}
          />
          <TaskFilterPopover
            filters={filters}
            onChange={onFilters}
            buttonVariant="ghost"
            group={{
              value: grouping,
              options: TEAM_GROUPINGS,
              labels: TEAM_GROUPING_LABEL,
              onChange: (next) => setGrouping(next as TeamGrouping),
            }}
            onSaveView={saveView}
            clients={clients}
            projects={filterProjects}
          />
          <SavedViewsControls
            views={source.views}
            filters={filters}
            onChange={onFilters}
            here={here}
            saveButton={false}
            buttonVariant="ghost"
          />
          <NewTaskWithProjectPicker align="end" teamId={teamId} projectId={filters.project}>
            {(loading) => (
              // Words where there is room; an icon with its name in a narrow panel.
              <Button
                type="button"
                className="ml-1 @max-3xl:size-8 @max-3xl:px-0"
                aria-label="New task"
                disabled={loading}
              >
                {loading ? <Loader2Icon className="size-4 animate-spin" /> : <PlusIcon className="size-4" />}
                <span className="@max-3xl:hidden">New task</span>
              </Button>
            )}
          </NewTaskWithProjectPicker>
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" aria-label="More for Tasks" className="size-8">
                    <EllipsisVerticalIcon className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>Search and Mass select</TooltipContent>
            </Tooltip>
            <DropdownMenuContent
              align="end"
              // Search opens once the menu has closed, so the cursor lands in its box.
              onCloseAutoFocus={(event) => {
                if (!searchFromMenu.current) return
                event.preventDefault()
                searchFromMenu.current = false
                setSearchOpen(true)
              }}
            >
              <DropdownMenuItem
                onSelect={() => {
                  searchFromMenu.current = true
                }}
              >
                <SearchIcon className="size-4" />
                Search tasks
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={toggleMassSelect}>
                <ListChecksIcon className="size-4" />
                {massSelectOn ? "Hide select" : "Mass select"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </DashboardCardHeader>
      {below}
      <SaveViewDialog open={savingView} filters={filters} here={here} onClose={() => setSavingView(false)} />
      <div
        className="flex min-h-0 flex-1 flex-col"
        onPointerDown={(event) => {
          if (event.button === 2) rightPress.current = pickedWordsUnder(event.target)
        }}
        onContextMenu={rightClick}
      >
        <TaskList
          tasks={rows}
          readOnly={busy}
          onOpenTask={(task) => onOpenTask(task.id)}
          showProject
          showAssignee
          projectColumn={projectColumn}
          groups={grouped?.groups}
          groupsOf={grouped?.groupsOf}
          onDrop={onDrop}
          canMove={(from, to) => from !== to && grouping !== "none" && grouping !== "project" && canMoveInGroup(grouping, to)}
          foldsKey={`${TEAM_TASK_FOLDS_KEY}-${grouping}`}
          bulk={bulk}
          selectedSlot={selectedSlot}
          onDelete={(task) => setDeleting(task)}
          canDelete={canDelete}
          myUserId={myUserId}
          addTask={grouped ? addUnder : undefined}
          massSelect={{ on: massSelectOn, onToggle: toggleMassSelect, tick: tickOnStart }}
          // The rows as the table shows them, sort and headings applied, so the first one opens on arrival.
          onRows={onRows}
          emptyText={filtered ? noMatch : "No tasks in the team's projects yet."}
        />
      </div>
      {taskMenu ? (
        <TaskRightClickMenu
          at={taskMenu}
          onClose={() => setTaskMenu(null)}
          canDelete={canDelete(taskMenu.task)}
          onDuplicate={() => void duplicate(taskMenu.task)}
          onDelete={() => setDeleting(taskMenu.task)}
          massSelect={{
            on: massSelectOn,
            onToggle: () => {
              setTickOnStart(massSelectOn ? null : taskMenu.task.id)
              setMassSelectOn(!massSelectOn)
            },
          }}
        />
      ) : null}
      {pointNew ? (
        <NewTaskWithProjectPicker
          key={`${pointNew.x}:${pointNew.y}`}
          align="start"
          teamId={teamId}
          projectId={filters.project}
          openAtOnce
          onClosed={() => setPointNew(null)}
        >
          {() => <PointAnchor x={pointNew.x} y={pointNew.y} />}
        </NewTaskWithProjectPicker>
      ) : null}
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => (open || busy ? undefined : setDeleting(null))}
        title={DELETE_TASK_QUESTION}
        description={deleting ? `"${deleting.title}". ${DELETE_TASK_DETAIL}` : DELETE_TASK_DETAIL}
        confirmLabel="Delete task"
        destructive
        loading={busy}
        onConfirm={() => (deleting ? void remove(deleting) : undefined)}
      />
      <ReasonDialog
        open={Boolean(stuck)}
        title="Why is it stuck?"
        description={stuck ? `"${stuck.title}" moves to Stuck, and whoever handed it out is told.` : ""}
        label="Reason"
        confirmLabel="Mark Stuck"
        busy={busy}
        onClose={() => setStuck(null)}
        onConfirm={async (reason) => (stuck ? changeStatus(stuck, "stuck", reason) : false)}
      />
    </>
  )
}
