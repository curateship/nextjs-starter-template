import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { AlarmClockIcon, CheckCheckIcon, Loader2Icon, PlusIcon } from "lucide-react"
import { toast } from "sonner"

import { CatchUpDialog } from "@/components/project/catch-up-dialog"
import { MyTaskRows } from "@/components/project/my-task-rows"
import { DELETE_TASK_DETAIL, DELETE_TASK_QUESTION, showBinnedToast } from "@/components/project/task-body"
import { NewTaskWithProjectPicker } from "@/components/project/new-task-header"
import { ReasonDialog } from "@/components/project/reason-dialog"
import { SaveViewDialog, SavedViewsControls } from "@/components/project/saved-views"
import { TaskBoard } from "@/components/project/task-board"
import { TaskCalendar } from "@/components/project/task-calendar"
import { TaskFilterPopover } from "@/components/project/task-filter-popover"
import { TaskList, type ProjectColumn } from "@/components/project/task-list"
import { PointAnchor, TaskRightClickMenu } from "@/components/project/task-right-click"
import { SearchToggle } from "@/components/project/task-header-controls"
import { TaskTimeline } from "@/components/project/task-timeline"
import { DashboardCardHeader } from "@/components/shared/dashboard-card-header"
import { DashboardTabs } from "@/components/shared/dashboard-tabs"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import type { SavedView } from "@/lib/api/project/finding"
import type { Label } from "@/lib/api/project/sorting"
import {
  acceptTasks,
  deleteProjectTask,
  duplicateProjectTask,
  saveMyTaskOrder,
  saveTask,
  setStatus,
  type TaskCard,
} from "@/lib/api/project/tasks"
import { plural } from "@/lib/format/plural"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useSyncedDraft } from "@/lib/hooks/use-synced-draft"
import { clientChoices } from "@/lib/project/clients"
import { getProjectErrorMessage } from "@/lib/project/errors"
import type { ListDrop } from "@/lib/project/list-drop"
import { canMove, dropChange, inMyOrder, isMyHeading, takesDrops, type MyPlace } from "@/lib/project/my-task-order"
import { MY_TASK_FOLDS_KEY, MY_TASK_VIEW_KEY } from "@/lib/project/panel-keys"
import { isOpenStatus, type TaskStatus } from "@/lib/project/rules"
import { pickedWordsUnder, readRightClick } from "@/lib/project/right-click"
import { viewHasFilters } from "@/lib/project/saved-views"
import {
  DUE_GROUPS,
  dueGroupOf,
  filterTasks,
  hasTaskFilters,
  type TaskFilters,
} from "@/lib/project/task-filters"
import type { TaskType } from "@/lib/project/task-types"
import { useRememberedChoice } from "@/lib/remembered-choice"
import { showErrorToast } from "@/lib/toast/error-toast"

const MY_VIEWS = ["list", "board", "calendar", "timeline"] as const
type MyView = (typeof MY_VIEWS)[number]

/**
 * What My tasks draws: an employee's own My dashboard, or the site admin's.
 * The site admin has no check-in, so no picks for today and nothing to order.
 */
export type MyTasksSource = {
  tasks: TaskCard[]
  /** Today's picks from the check-in, in my own order, and how a drag saves that order. */
  picks: TaskCard[]
  orderPicks: ((taskIds: string[]) => Promise<unknown>) | null
  /** My own order on the List, per heading, which a drag saves. */
  myOrder: MyPlace[]
  /** My own day, so "Today" and a snooze's day mean the same as in the check-in. */
  today: string
  /** Who the bulk menu's Hand to offers. */
  people: { id: string; name: string; avatarUrl?: string }[]
  labels: Label[]
  taskTypes: TaskType[]
  views: SavedView[]
  /** The shell's key those views are kept under. */
  viewScreen: string
  statusOrder: TaskStatus[]
  saveStatusOrder: (statusOrder: TaskStatus[]) => Promise<unknown>
  /** Me, and which tasks I may delete: the ones I made, or every one for the site admin. */
  myUserId: string
  canDelete: (task: TaskCard) => boolean
  /**
   * The site admin's List is the project page's table (Tyler, 23 Oct 2026:
   * "The tasks table have to look like the project's tasks table"), with a
   * Project column whose chip moves the task, and no Assigned to or Steps
   * ("remove the assigned to, steps and my team col").
   */
  table?: { project: ProjectColumn }
}

/**
 * My tasks, the middle of My dashboard: List, Board, Calendar and Timeline,
 * with search, Filter, Views and New task, as the project page's header.
 */
export function MyTasksPanel({
  source,
  openTaskId,
  filters,
  onFilters,
  onOpenTask,
  onRows,
}: {
  source: MyTasksSource
  /** The task open in the right panel, whose row is marked. */
  openTaskId: string | undefined
  filters: TaskFilters
  onFilters: (patch: Partial<TaskFilters>) => void
  onOpenTask: (taskId: string) => void
  /** The List's rows in order, so the first one can open on arrival. */
  onRows: (ids: string[]) => void
}) {
  const router = useRouter()
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  // A status or date changed on the Board, Calendar or Timeline shows at once
  // and is put back if the server refuses it.
  const [tasks, setTasks] = useSyncedDraft(source.tasks)
  // Today's picks can include a carried-over task since handed to someone else,
  // so they are read from the check-in rather than from my own tasks. They come
  // in my own order; a drag shows at once and goes back if the save fails.
  const { picks, orderPicks } = source
  const savedOrder = picks.map((task) => task.id).join(",")
  const [order, setOrder] = React.useState<{ from: string; ids: string[] } | null>(null)
  const ids = order && order.from === savedOrder ? order.ids : picks.map((task) => task.id)
  const today = ids.flatMap((id, position) => {
    const task = picks.find((pick) => pick.id === id)
    return task ? [{ ...task, position }] : []
  })
  const myDay = source.today
  const [myOrder, setMyOrder] = useSyncedDraft(source.myOrder)
  const [selectedSlot, setSelectedSlot] = React.useState<HTMLDivElement | null>(null)
  const notDone = tasks.filter((task) => isOpenStatus(task.status))
  // A snoozed task stays out of Open until the morning of its day.
  const open = notDone.filter((task) => !task.snoozedUntil || task.snoozedUntil <= myDay)
  const snoozed = notDone.length - open.length
  const done = tasks.filter((task) => task.status === "done")
  const [view, setView] = useRememberedChoice<MyView>(MY_TASK_VIEW_KEY, "list", MY_VIEWS)
  const [statusOrder, setStatusOrder] = useSyncedDraft(source.statusOrder)
  // The task waiting for its Stuck reason, from a Board drop.
  const [stuck, setStuck] = React.useState<TaskCard | null>(null)
  // The task whose bin was pressed, waiting for the confirm.
  const [deleting, setDeleting] = React.useState<TaskCard | null>(null)
  // A right-click's menu on a task, or New task opened at the mouse.
  const [taskMenu, setTaskMenu] = React.useState<{ x: number; y: number; task: TaskCard } | null>(null)
  const [pointNew, setPointNew] = React.useState<{ x: number; y: number } | null>(null)
  // Whether the right button went down on words already picked; read before a Mac picks the word under it.
  const rightPress = React.useRef(false)
  const waitingTasks = open.filter((task) => task.waiting)
  const waiting = waitingTasks.length
  // The same tasks as the List's Overdue group, by my own day.
  const overdueTasks = open.filter((task) => dueGroupOf({ ...task, waiting: false }, myDay) === "overdue")
  const overdue = overdueTasks.length
  const [catchingUp, setCatchingUp] = React.useState(false)
  const [savingView, setSavingView] = React.useState(false)
  // Tasks here come from many projects, so every live type is offered and a
  // project that doesn't offer one refuses it for its own tasks.
  const bulk = {
    people: source.people,
    projects: [],
    tags: source.labels,
    types: source.taskTypes.filter((type) => !type.archived),
  }
  const clients = clientChoices([...open, ...done].map((task) => task.projectClient))
  const here = { screen: source.viewScreen, labels: source.labels, types: source.taskTypes, clients }

  async function reorder(save: (taskIds: string[]) => Promise<unknown>, next: string[]) {
    setOrder({ from: savedOrder, ids: next })
    const ok = await run(() => save(next))
    if (!ok) setOrder(null)
    else await router.invalidate()
  }

  /**
   * A row let go on the List. Inside its heading it takes a new place in my
   * order (today's picks keep their own, from the check-in). Under another
   * heading it takes that heading's date, or Done, then its place there. Both
   * show at once and go back if the server refuses.
   */
  async function dropRow(drop: ListDrop) {
    const moved = drop.from !== drop.to
    if (!moved && drop.to === PICKED_GROUP) {
      if (orderPicks) await reorder(orderPicks, drop.taskIds)
      return
    }
    const heading = drop.to
    const change = moved ? dropChange(heading, myDay) : null
    if (!isMyHeading(heading) || (moved && !change)) return
    const beforeTasks = tasks
    const beforeOrder = myOrder
    if (change) {
      setTasks((current) =>
        current.map((t) => {
          if (t.id !== drop.taskId) return t
          // A new date drops the "Due by" time, as the server does.
          return "status" in change ? { ...t, status: change.status } : { ...t, dueDate: change.dueDate, dueAt: null }
        })
      )
    }
    setMyOrder((current) => [
      ...current.filter((place) => !drop.taskIds.includes(place.taskId) && place.heading !== heading),
      ...drop.taskIds.map((taskId, position) => ({ taskId, heading, position })),
    ])
    const ok = await run(async () => {
      if (change) {
        await ("status" in change
          ? setStatus({ taskId: drop.taskId, status: change.status, stuckReason: null })
          : saveTask({ taskId: drop.taskId, dueDate: change.dueDate }))
      }
      await saveMyTaskOrder(heading, drop.taskIds)
    })
    if (!ok) {
      setTasks(beforeTasks)
      setMyOrder(beforeOrder)
    }
    await router.invalidate()
  }

  /** Each waiting task is accepted on its own; one that changed hands is refused alone. */
  async function acceptAll() {
    let result = { accepted: [] as string[], refused: [] as { title: string; reason: string }[] }
    const ok = await run(async () => {
      result = await acceptTasks(waitingTasks.map((task) => task.id))
    })
    if (!ok) return
    const accepted = `${result.accepted.length} accepted`
    if (result.refused.length) {
      const first = result.refused[0]
      showErrorToast(
        `${accepted}, ${result.refused.length} refused. ${first.title ? `"${first.title}": ` : ""}${first.reason}`
      )
    } else {
      toast.success(`${accepted}.`)
    }
    await router.invalidate()
  }

  /** A Board drop in another column: the same status change as on the task. */
  async function changeStatus(task: TaskCard, status: TaskStatus, stuckReason: string | null) {
    if (task.status === status) return true
    const before = tasks
    setTasks((current) => current.map((t) => (t.id === task.id ? { ...t, status, stuckReason } : t)))
    const ok = await run(() => setStatus({ taskId: task.id, status, stuckReason }), status === "stuck" ? "Marked Stuck." : undefined)
    if (!ok) setTasks(before)
    await router.invalidate()
    return ok
  }

  /**
   * A heading's "+", as on a project's List (Tyler, 24 Oct 2026: "My dashboard
   * is missing the "+" icon in the section like project dashboard"). The new
   * task starts as a drop under that heading would leave it: Today due today,
   * This week tomorrow, Later eight days on, No date with none, Done done.
   * Overdue, Waiting and today's picks can't be started in, so have no "+".
   */
  function addUnder(heading: string, button: React.ReactNode) {
    const change = dropChange(heading, myDay)
    if (!change) return null
    return (
      <NewTaskWithProjectPicker
        align="start"
        start={"status" in change ? { status: change.status } : { due: change.dueDate }}
      >
        {() => button}
      </NewTaskWithProjectPicker>
    )
  }

  /**
   * A task's Duplicate and Delete, or New task at the mouse on empty space. A
   * text box, a link or picked words keep the browser's own menu.
   */
  function rightClick(event: React.MouseEvent) {
    const onPickedWords = rightPress.current
    rightPress.current = false
    if (!(event.target instanceof Element) || !event.currentTarget.contains(event.target)) return
    const target = readRightClick(event.target, onPickedWords)
    if (!target) return
    // The keyboard's menu key has no mouse position, so the menu opens under what has focus.
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

  /** A task put in the bin, with Undo in its message. */
  async function remove(task: TaskCard) {
    const ok = await run(() => deleteProjectTask(task.id))
    if (!ok) return
    setDeleting(null)
    showBinnedToast(task.id, router)
    await router.invalidate()
  }

  /** A Board column dropped in a new place: my own order, shown at once, put back if refused. */
  async function changeStatusOrder(next: TaskStatus[]) {
    const before = statusOrder
    setStatusOrder(next)
    const ok = await run(() => source.saveStatusOrder(next))
    if (!ok) setStatusOrder(before)
    else await router.invalidate()
  }

  /** A day dropped on the Calendar, or a bar moved on the Timeline: the same save as on the task. */
  async function changeDates(task: TaskCard, dates: { startDate?: string | null; dueDate?: string | null }) {
    const before = tasks
    setTasks((current) => current.map((t) => (t.id === task.id ? { ...t, ...dates } : t)))
    const ok = await run(() => saveTask({ taskId: task.id, ...dates }))
    if (!ok) setTasks(before)
    await router.invalidate()
  }

  function saveView() {
    if (!viewHasFilters(filters)) {
      showErrorToast("Search or pick a filter first, then save it as a view.")
      return
    }
    setSavingView(true)
  }

  const filtered = hasTaskFilters(filters)
  // The List: today's picks first, in my own order, then my open tasks under
  // when they are due, then Done. Under each heading the tasks I placed come
  // in my order and the rest after them by due date. A pick is listed once,
  // under the picks.
  const picked = new Set(today.map((task) => task.id))
  const headingOf = (task: TaskCard) =>
    picked.has(task.id) ? PICKED_GROUP : task.status === "done" ? "done" : dueGroupOf(task, myDay)
  const unpicked = [...open.filter((task) => !picked.has(task.id)).sort(byDueDate), ...done]
  const listRows = filterTasks(
    LIST_GROUPS.flatMap((group) =>
      group.key === PICKED_GROUP
        ? today
        : inMyOrder(
            unpicked.filter((task) => headingOf(task) === group.key),
            group.key,
            myOrder
          )
    ),
    filters
  )
  // Dragging is off while a search or filter hides rows, and while a change saves.
  const onDrop = filtered || busy ? undefined : (drop: ListDrop) => void dropRow(drop)
  const rowIds = listRows.map((task) => task.id).join(",")
  React.useEffect(() => {
    onRows(rowIds ? rowIds.split(",") : [])
  }, [rowIds, onRows])
  // The Board, Calendar and Timeline: every task of mine they can show, snoozed ones still hidden.
  const shown = filterTasks([...open, ...done], filters)
  const projects = [...new Map(shown.map((task) => [task.projectId, task.projectName])).entries()].map(
    ([key, label]) => ({ key, label })
  )

  return (
    <>
      {/* The project page's header, copied here (Tyler, 14 Oct 2026): underlined tabs,
          then search, Filter, Views and New task. No members
          dropdown, since every task here is mine. */}
      <DashboardCardHeader className="@container">
        <DashboardTabs
          value={view}
          onValueChange={(value) => setView(value as MyView)}
          tabs={[
            { value: "list", label: "List" },
            { value: "board", label: "Board" },
            { value: "calendar", label: "Calendar" },
            { value: "timeline", label: "Timeline" },
          ]}
        />
        <div className="flex shrink-0 items-center gap-1">
          {/* The site admin's List puts its "3 selected" button here, left of the search, as a project page does. */}
          {view === "list" && source.table ? <div ref={setSelectedSlot} className="contents" /> : null}
          <SearchToggle value={filters.q ?? ""} onChange={(q) => onFilters({ q: q || undefined })} />
          <TaskFilterPopover
            filters={filters}
            onChange={onFilters}
            labels={source.labels}
            types={source.taskTypes}
            buttonVariant="ghost"
            onSaveView={saveView}
            clients={clients}
          />
          <SavedViewsControls
            views={source.views}
            filters={filters}
            onChange={onFilters}
            here={here}
            saveButton={false}
            buttonVariant="ghost"
          />
          <NewTaskWithProjectPicker align="end">
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
        </div>
      </DashboardCardHeader>
      {overdue && !filtered ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-destructive/10 px-4 py-2 text-destructive">
          <p className="flex items-center gap-2 text-sm">
            <AlarmClockIcon className="size-4 shrink-0" aria-hidden />
            {overdue === 1 ? "1 task is overdue." : `${overdue} tasks are overdue.`}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="bg-background text-destructive hover:text-destructive"
            onClick={() => setCatchingUp(true)}
          >
            Catch up
          </Button>
        </div>
      ) : null}
      {waiting && !filtered ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-4 py-2">
          <p className="text-sm">
            {waiting === 1
              ? "1 task is waiting for you to accept it or hand it back."
              : `${waiting} tasks are waiting for you to accept them or hand them back.`}
          </p>
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void acceptAll()}>
            <CheckCheckIcon className="size-4" />
            Accept all {waiting} {plural(waiting, "task")}
          </Button>
        </div>
      ) : null}
      <CatchUpDialog open={catchingUp} tasks={overdueTasks} onClose={() => setCatchingUp(false)} />
      <SaveViewDialog open={savingView} filters={filters} here={here} onClose={() => setSavingView(false)} />
      {snoozed ? (
        <p className="border-b px-4 py-2 text-sm text-muted-foreground">
          {snoozed === 1
            ? "1 snoozed task is hidden until its day."
            : `${snoozed} snoozed tasks are hidden until their day.`}
        </p>
      ) : null}
      {/* Right-click (Tyler, 23 Oct 2026, as on the project page): a task's
          Duplicate and Delete, or New task at the mouse on empty space. */}
      <div
        className="flex min-h-0 flex-1 flex-col"
        onPointerDown={(event) => {
          if (event.button === 2) rightPress.current = pickedWordsUnder(event.target)
        }}
        onContextMenu={rightClick}
      >
        {view !== "list" && filtered && shown.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            No tasks match {filters.q?.trim() ? `"${filters.q.trim()}"` : "these filters"}. Clear the filters to see
            them all.
          </p>
        ) : view === "board" ? (
          <TaskBoard
            tasks={shown}
            openTaskId={openTaskId}
            readOnly={busy}
            onOpenTask={onOpenTask}
            onMove={(task, status) => (status === "stuck" ? setStuck(task) : void changeStatus(task, status, null))}
            onReorder={() => undefined}
            cardOrder="due"
            showProject
            // Archived tasks never come to My dashboard, so neither does their column.
            statusOrder={statusOrder.filter((status) => status !== "archived")}
            onStatusOrder={(next) => void changeStatusOrder([...next, "archived"])}
          />
        ) : view === "calendar" ? (
          <TaskCalendar
            tasks={shown}
            readOnly={busy}
            onOpenTask={onOpenTask}
            onDueDate={(task, dueDate) => void changeDates(task, { dueDate })}
          />
        ) : view === "timeline" ? (
          <TaskTimeline
            tasks={shown}
            groups={projects.length > 1 ? projects : undefined}
            groupsOf={(task) => [task.projectId]}
            readOnly={busy}
            onOpenTask={onOpenTask}
            onDates={(task, dates) => void changeDates(task, dates)}
          />
        ) : source.table ? (
          <TaskList
            // The table's first sort keeps the List's own order, my order under each heading.
            tasks={listRows.map((task, position) => ({ ...task, position }))}
            readOnly={busy}
            ordered
            onDrop={onDrop}
            canMove={canMove}
            showsEmpty={takesDrops}
            foldsKey={MY_TASK_FOLDS_KEY}
            orderLabel="my order"
            selectedSlot={selectedSlot}
            onOpenTask={(task) => onOpenTask(task.id)}
            groups={TABLE_GROUPS}
            groupsOf={(task) => [headingOf(task)]}
            bulk={bulk}
            showProject
            projectColumn={source.table.project}
            showSteps={false}
            addTask={addUnder}
            myUserId={source.myUserId}
            onDelete={(task) => setDeleting(task)}
            canDelete={source.canDelete}
            emptyText={
              filtered
                ? `No tasks match ${filters.q?.trim() ? `"${filters.q.trim()}"` : "these filters"}. Clear the filters to see them all.`
                : "Nothing assigned to you right now."
            }
          />
        ) : (
          <MyTaskRows
            openTaskId={openTaskId}
            tasks={listRows}
            bulk={bulk}
            onDrop={onDrop}
            onOpenTask={(task) => onOpenTask(task.id)}
            groups={LIST_GROUPS}
            groupOf={headingOf}
            addTask={addUnder}
            emptyText={
              filtered
                ? `No tasks match ${filters.q?.trim() ? `"${filters.q.trim()}"` : "these filters"}. Clear the filters to see them all.`
                : "Nothing assigned to you right now."
            }
          />
        )}
      </div>
      {taskMenu ? (
        <TaskRightClickMenu
          at={taskMenu}
          onClose={() => setTaskMenu(null)}
          canDelete={source.canDelete(taskMenu.task)}
          onDuplicate={() => void duplicate(taskMenu.task)}
          onDelete={() => setDeleting(taskMenu.task)}
        />
      ) : null}
      {pointNew ? (
        <NewTaskWithProjectPicker
          key={`${pointNew.x}:${pointNew.y}`}
          align="start"
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

const PICKED_GROUP = "picked"

/** The List's groups: today's picks, then when the rest are due, then Done. */
const LIST_GROUPS = [{ key: PICKED_GROUP, label: "Picked for today" }, ...DUE_GROUPS, { key: "done", label: "Done" }]
/** The site admin's table has no picks for today. */
const TABLE_GROUPS = LIST_GROUPS.filter((group) => group.key !== PICKED_GROUP)

/** Soonest first; tasks with no date last, then by title. */
function byDueDate(a: TaskCard, b: TaskCard) {
  return (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || a.title.localeCompare(b.title)
}
