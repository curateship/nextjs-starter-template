import * as React from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"
import { ChevronDownIcon, PlusIcon, Trash2Icon } from "lucide-react"

import { BinDialog } from "@/components/project/bin-dialog"
import { FieldColumnsMenu } from "@/components/project/field-columns-menu"
import { NOBODY, NewTaskDialog, type NewTaskStart } from "@/components/project/new-task-dialog"
import { ProjectActivity } from "@/components/project/project-activity"
import { ProjectChat } from "@/components/project/project-chat"
import { ProjectFiles } from "@/components/project/project-files"
import { QuickNewTask } from "@/components/project/quick-new-task"
import { ReasonDialog } from "@/components/project/reason-dialog"
import { SaveViewDialog, SavedViewsControls } from "@/components/project/saved-views"
import { ALL_LANE, NOBODY_LANE, TaskBoard, type BoardLane } from "@/components/project/task-board"
import { TaskCalendar } from "@/components/project/task-calendar"
import { DELETE_TASK_DETAIL, DELETE_TASK_QUESTION, showBinnedToast } from "@/components/project/task-body"
import { TaskFilterPopover } from "@/components/project/task-filter-popover"
import {
  MembersFilterMenu,
  SearchToggle,
  UNDERLINE_TAB_CLASS,
  UnderlineTabs,
} from "@/components/project/task-header-controls"
import { TaskList } from "@/components/project/task-list"
import { TaskTimeline } from "@/components/project/task-timeline"
import { DashboardCardHeader } from "@/components/shared/dashboard-card-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { loadProjectChatUnread } from "@/lib/api/project/chat"
import { saveStatusOrder, type ProjectPage } from "@/lib/api/project/projects"
import { saveTaskOrder } from "@/lib/api/project/sorting"
import {
  assignProjectTask,
  deleteProjectTask,
  duplicateProjectTask,
  saveTask,
  setStatus,
  type NewTaskProject,
  type TaskCard,
} from "@/lib/api/project/tasks"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useSyncedDraft } from "@/lib/hooks/use-synced-draft"
import { useRememberedChoice } from "@/lib/remembered-choice"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { rememberProject } from "@/lib/project/new-task-project"
import { BOARD_GROUP_KEY, PROJECT_TASK_VIEW_KEY, taskGroupingKey } from "@/lib/project/panel-keys"
import { todayKey } from "@/lib/project/dates"
import { runsTheTeam, type TaskPriority, type TaskStatus } from "@/lib/project/rules"
import { filterTasks, hasTaskFilters, type TaskFilters } from "@/lib/project/task-filters"
import { overDoingLimit } from "@/lib/project/doing-limit"
import { TASK_GROUPINGS, groupTasks, type TaskGrouping } from "@/lib/project/task-groups"
import { placesAfterReorder } from "@/lib/project/task-order"
import { offeredTypes } from "@/lib/project/task-types"
import { useFieldColumns } from "@/lib/project/use-field-columns"
import { useProjectLive } from "@/lib/project/use-project-live"
import { viewHasFilters } from "@/lib/project/saved-views"
import { showErrorToast } from "@/lib/toast/error-toast"

const VIEWS = ["list", "board", "calendar", "timeline", "activity", "files", "chat"] as const
type View = (typeof VIEWS)[number]

/** The header's New task, as opposed to a Board column's "+". */
const HEADER_NEW_TASK = "header"

const GROUPS = ["status", "person"] as const
/** The Board's Group row: its status columns alone, or a row of them per person. */
const BOARD_GROUPINGS = ["none", "assignee"] as const satisfies readonly TaskGrouping[]
const noGroups = () => []

/** What a New task dropdown starts on: a Board column's or a List heading's. */
type QuickStart = {
  status?: TaskStatus
  /** A member's id, or `NOBODY`. */
  assignee?: string
  priority?: TaskPriority
  tagIds?: string[]
  due?: string | null
  /** Null is a plain task. */
  typeId?: string | null
  tooltip?: string
}

/**
 * The task a List heading's "+" starts: one that lands under that heading
 * (Tyler, 19 Oct 2026: "a '+' icon for me to add a task that will slot into
 * that sort"). Only Today and No due date can be started in by date; a new
 * task can't be made Overdue or Earlier, and This week or Later name no one
 * day, so those headings have no "+".
 */
function startInGroup(grouping: TaskGrouping, key: string): QuickStart | null {
  const none = key === "none"
  switch (grouping) {
    case "status":
      return { status: key as TaskStatus }
    case "priority":
      return { priority: key as TaskPriority }
    case "tags":
      return { tagIds: none ? [] : [key] }
    case "assignee":
      return { assignee: none ? NOBODY : key }
    case "type":
      return { typeId: none ? null : key }
    case "due":
      return key === "today" ? { due: todayKey() } : none ? { due: null } : null
    default:
      return null
  }
}
type Group = (typeof GROUPS)[number]

/** A Board drop in another person's row, waiting for "Hand it over?". */
type PendingHandOver = {
  task: TaskCard
  person: { id: string; name: string } | null
  status: TaskStatus
  order: string[]
}

/**
 * The project's tasks, as a Board (one column per status, or a row per person
 * when grouped), a List under Filter's Group row (status, tags, due date and so on), a Calendar of
 * due dates or a Timeline of start and due dates, its Activity, every file in it, and its own Chat. The tab last
 * used is remembered in this browser; the search and filters live in the
 * address. A status change or a new order shows at once and is put back if
 * the server refuses it. A "Just me" list has no Files or Chat, since
 * nobody else can read it.
 *
 * The header, as Tyler drew it on 14 Oct 2026: underlined tabs (List first
 * since 19 Oct 2026), then search, Filter (which holds the due date since
 * 19 Oct 2026), Views, whose tasks show (moved here from the left panel), and New task. New task, and the "+" on each Board column,
 * open a dropdown rather than a window. A card's "..." duplicates or deletes it.
 */
export function ProjectTasksPanel({
  page,
  filters,
  onFilters,
  onOpenTask,
  openTaskId,
  openChat,
  onChatOpened,
}: {
  page: ProjectPage
  filters: TaskFilters
  onFilters: (patch: Partial<TaskFilters>) => void
  onOpenTask: (taskId: string) => void
  /** The task open in the right panel, outlined on the Board and List. */
  openTaskId?: string
  /** A chat notice's link asked for the Chat tab. */
  openChat: boolean
  onChatOpened: () => void
}) {
  const router = useRouter()
  const navigate = useNavigate()
  // List first, and where a new browser starts (Tyler, 19 Oct 2026).
  const [chosenView, setView] = useRememberedChoice<View>(PROJECT_TASK_VIEW_KEY, "list", VIEWS)
  // A "Just me" list has no Chat and no Files tab, since nobody else shares it.
  const hasChat = !page.project.personal
  const view = (chosenView === "chat" || chosenView === "files") && !hasChat ? "list" : chosenView

  React.useEffect(() => {
    if (!openChat) return
    if (hasChat) setView("chat")
    onChatOpened()
  }, [openChat, hasChat, setView, onChatOpened])
  const [tasks, setTasks] = useSyncedDraft(page.tasks)
  const [statusOrder, setStatusOrder] = useSyncedDraft(page.project.statusOrder)
  // "3 new" on the Chat tab. Opening the chat reads it, so nothing shows there
  // and nothing is left once I move on; elsewhere it follows new messages.
  const [chatUnread, setChatUnread] = useSyncedDraft(page.chatUnread)
  useProjectLive(
    hasChat ? page.project.id : undefined,
    (change) => change === "chat",
    () => {
      if (view === "chat") return
      loadProjectChatUnread(page.project.id).then(setChatUnread, () => undefined)
    }
  )
  // Which New task dropdown is open: the header's, or a Board column's by its key.
  const [quickOpen, setQuickOpen] = React.useState<string | null>(null)
  // "More options": the full window, with what the dropdown held.
  const [full, setFull] = React.useState<NewTaskStart | null>(null)
  const [deleting, setDeleting] = React.useState<TaskCard | null>(null)
  const [binOpen, setBinOpen] = React.useState(false)
  const [savingView, setSavingView] = React.useState(false)
  // The task waiting for its Stuck reason, and where the Board dropped it.
  const [stuck, setStuck] = React.useState<{ task: TaskCard; order?: string[] } | null>(null)
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  const readOnly = page.project.archived
  // A "Just me" list has one person, so there is nothing to group by.
  const [chosenGroup, setGroup] = useRememberedChoice<Group>(BOARD_GROUP_KEY, "status", GROUPS)
  const byPerson = chosenGroup === "person" && !page.project.personal
  const [handingOver, setHandingOver] = React.useState<PendingHandOver | null>(null)

  const filtered = filterTasks(tasks, filters)
  // Who a task can go to: the members, and the site admin, who can take tasks themselves.
  const assignees = page.siteAdminMe ? [...page.members, page.siteAdminMe] : page.members
  const people = assignees.map((m) => ({ id: m.userId, name: m.name, avatarUrl: m.avatarUrl }))
  // Filtered to one type, the List can show up to 3 of its fields as columns.
  const filteredType = page.taskTypes.find((type) => type.id === filters.type)
  const [columnIds, setColumnIds] = useFieldColumns(filteredType?.id)
  const fieldColumns = React.useMemo(() => {
    const names = new Map(page.members.map((m) => [m.userId, m.name]))
    return columnIds.flatMap((id) => {
      const field = filteredType?.fields.find((f) => f.id === id)
      return field ? [{ field, people: names }] : []
    })
  }, [columnIds, filteredType, page.members])
  const lanes = React.useMemo<BoardLane[]>(() => {
    const members = page.members.map((m) => ({ id: m.userId, name: m.name, avatarUrl: m.avatarUrl }))
    // Someone assigned who has since come off the project still gets a row, so no task goes missing.
    const others = new Map<string, BoardLane>()
    for (const task of tasks) {
      if (task.assignee && !members.some((m) => m.id === task.assignee?.id)) {
        others.set(task.assignee.id, { id: task.assignee.id, name: task.assignee.name, avatarUrl: task.assignee.avatarUrl })
      }
    }
    return [...members, ...others.values(), { id: NOBODY_LANE, name: "Nobody assigned" }]
  }, [page.members, tasks])
  // The List and Timeline's Group row, kept per project in this browser (Tyler, 19 Oct 2026).
  const [grouping, setGrouping] = useRememberedChoice<TaskGrouping>(
    taskGroupingKey(page.project.id),
    "none",
    TASK_GROUPINGS
  )
  const grouped = groupTasks(filtered, grouping)

  async function reorder(taskIds: string[]) {
    const before = tasks
    const places = placesAfterReorder(tasks, taskIds)
    setTasks((current) =>
      current.map((t) => (places.has(t.id) ? { ...t, position: places.get(t.id)! } : t))
    )
    const ok = await run(() => saveTaskOrder(page.project.id, taskIds))
    if (!ok) setTasks(before)
    else await router.invalidate()
  }

  /** A new status, and with `order` (the new column's tasks, from the Board) its place there too. */
  async function changeStatus(
    task: TaskCard,
    status: TaskStatus,
    stuckReason: string | null,
    order?: string[]
  ) {
    if (task.status === status) return true
    const before = tasks
    const places = order ? placesAfterReorder(tasks, order) : new Map<string, number>()
    setTasks((current) =>
      current.map((t) => ({
        ...t,
        ...(t.id === task.id ? { status, stuckReason } : null),
        ...(places.has(t.id) ? { position: places.get(t.id)! } : null),
      }))
    )
    // Only Stuck says so, as it does from the task: a toast on every drag would be noise.
    const ok = await run(
      async () => {
        await setStatus({ taskId: task.id, status, stuckReason })
        if (order) await saveTaskOrder(page.project.id, order)
      },
      status === "stuck" ? "Marked Stuck." : undefined
    )
    if (!ok) setTasks(before)
    await router.invalidate()
    return ok
  }

  /** A Board column dropped in a new place: shown at once, saved for everyone on the project, put back if refused. */
  async function changeStatusOrder(next: TaskStatus[]) {
    const before = statusOrder
    setStatusOrder(next)
    const ok = await run(() => saveStatusOrder({ projectId: page.project.id, statusOrder: next }))
    if (!ok) setStatusOrder(before)
    else await router.invalidate()
  }

  /** A day dropped on the Calendar: the same save as picking the date on the task. */
  async function changeDueDate(task: TaskCard, dueDate: string | null) {
    const before = tasks
    setTasks((current) => current.map((t) => (t.id === task.id ? { ...t, dueDate } : t)))
    const ok = await run(() => saveTask({ taskId: task.id, dueDate }))
    if (!ok) setTasks(before)
    await router.invalidate()
  }

  /** A bar moved or stretched on the Timeline: the same save as picking the dates on the task. */
  async function changeDates(task: TaskCard, dates: { startDate?: string | null; dueDate?: string | null }) {
    const before = tasks
    setTasks((current) => current.map((t) => (t.id === task.id ? { ...t, ...dates } : t)))
    const ok = await run(() => saveTask({ taskId: task.id, ...dates }))
    if (!ok) setTasks(before)
    await router.invalidate()
  }

  /**
   * After "Hand it over?": the same hand-over as the task's person picker,
   * which tells them and waits for them to accept, then the column it was
   * dropped in and its place there.
   */
  async function handOver({ task, person, status, order }: PendingHandOver) {
    const ok = await run(
      async () => {
        await assignProjectTask({ taskId: task.id, assigneeUserId: person?.id ?? null, note: null })
        if (status !== task.status) {
          // Never Stuck here: a drop into another row's Stuck is refused before asking.
          await setStatus({ taskId: task.id, status, stuckReason: null })
        }
        await saveTaskOrder(page.project.id, order)
      },
      person ? `Handed to ${person.name}.` : "Nobody is assigned now."
    )
    if (ok) setHandingOver(null)
    await router.invalidate()
  }

  function pickView(next: View) {
    if (view === "chat") setChatUnread(0)
    setView(next)
  }

  function requestStatus(task: TaskCard, status: TaskStatus, order?: string[]) {
    // Stuck needs its reason first; every other move goes straight through.
    if (status === "stuck") setStuck({ task, order })
    else void changeStatus(task, status, null, order)
  }

  const here = { projectId: page.project.id, people, labels: page.labels, types: page.taskTypes }
  const taskTab = view !== "activity" && view !== "files" && view !== "chat"

  const thisProject: NewTaskProject = {
    id: page.project.id,
    name: page.project.name,
    color: page.project.color,
    members: assignees,
    typeIds: offeredTypes(page.taskTypes, page.project.personal ? [] : page.project.hiddenTypeIds).map(
      (type) => type.id
    ),
    defaultTypeId: page.project.defaultTypeId,
  }

  /** A New task dropdown, opened by `children`. `key` says which one is open. */
  function quickNewTask(
    key: string,
    children: React.ReactNode,
    start?: QuickStart
  ) {
    return (
      <QuickNewTask
        projects={[thisProject]}
        types={page.taskTypes}
        tags={page.labels}
        milestones={page.milestones}
        initialProjectId={page.project.id}
        status={start?.status}
        assignee={start?.assignee}
        priority={start?.priority}
        tagIds={start?.tagIds}
        due={start?.due}
        typeId={start?.typeId}
        tooltip={start?.tooltip}
        align={key === HEADER_NEW_TASK ? "end" : "start"}
        open={quickOpen === key}
        onOpenChange={(open) => setQuickOpen(open ? key : null)}
        onMoreOptions={(_projectId, draft) => setFull(draft)}
        onCreated={rememberProject}
      >
        {children}
      </QuickNewTask>
    )
  }

  /** Duplicate from a card's menu: the copy opens beside the Board, as from the task's own cog. */
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
    // A deleted task can't stay open beside the Board.
    if (task.id === openTaskId) {
      void navigate({
        to: ".",
        replace: true,
        search: (previous: Record<string, unknown>) => ({ ...previous, task: undefined }),
      })
    }
    await router.invalidate()
  }

  const [selectedSlot, setSelectedSlot] = React.useState<HTMLDivElement | null>(null)
  // A task is deleted by whoever made it, or by the site admin.
  const canDelete = (task: TaskCard) => task.createdByUserId === page.myUserId || runsTheTeam(page.myRole)

  // Open tasks for the members dropdown, counted before any filter.
  const openTasks = tasks.filter((task) => task.status !== "done")

  function saveView() {
    if (!viewHasFilters(filters)) {
      showErrorToast("Search or pick a filter first, then save it as a view.")
      return
    }
    setSavingView(true)
  }

  return (
    <>
      {/* Its own stronger line, so the tabs part from the List's grey header (Tyler, 19 Oct 2026:
          "revert to the way it was but make that header divider appear"). Every other line keeps
          Settings > Styling's Divider lines, which is too faint to show against that grey. */}
      <DashboardCardHeader className="@container border-b-muted-foreground/10">
        <UnderlineTabs
          value={view}
          onValueChange={(value) => pickView(value as View)}
          tabs={[
            { value: "list", label: "List" },
            { value: "board", label: "Board" },
            { value: "calendar", label: "Calendar" },
            { value: "timeline", label: "Timeline" },
          ]}
          after={
            <MoreViews
              view={view}
              hasChat={hasChat}
              chatUnread={view === "chat" ? 0 : chatUnread}
              onPick={pickView}
              onBin={readOnly ? null : () => setBinOpen(true)}
            />
          }
        />
        <div className="flex shrink-0 items-center gap-1">
          {taskTab ? (
            <>
              {/* The List's "3 selected" button lands here, left of the search. */}
              {view === "list" ? <div ref={setSelectedSlot} className="contents" /> : null}
              <SearchToggle value={filters.q ?? ""} onChange={(q) => onFilters({ q: q || undefined })} />
              <TaskFilterPopover
                filters={filters}
                onChange={onFilters}
                labels={page.labels}
                types={page.taskTypes}
                buttonVariant="ghost"
                group={
                  view === "board"
                    ? // The Board keeps its status columns; Group only adds a row per person.
                      page.project.personal
                      ? undefined
                      : {
                          value: byPerson ? "assignee" : "none",
                          options: BOARD_GROUPINGS,
                          onChange: (next) => setGroup(next === "assignee" ? "person" : "status"),
                        }
                    : view === "list" || view === "timeline"
                      ? { value: grouping, options: TASK_GROUPINGS, onChange: setGrouping }
                      : undefined
                }
                extra={
                  (view === "list" || view === "board") && filteredType?.fields.length ? (
                    <FieldColumnsMenu
                      fields={filteredType.fields}
                      chosen={fieldColumns.map((column) => column.field.id)}
                      onChange={setColumnIds}
                      label={view === "board" ? "Fields on cards" : "Columns"}
                    />
                  ) : null
                }
                onSaveView={saveView}
              />
              <SavedViewsControls
                views={page.views}
                filters={filters}
                onChange={onFilters}
                here={here}
                saveButton={false}
                buttonVariant="ghost"
              />
              {/* A "Just me" list has one person, so there is nobody to pick. */}
              {page.project.personal ? null : (
                <MembersFilterMenu
                  members={assignees}
                  myUserId={page.myUserId}
                  openTotal={openTasks.length}
                  openUnassigned={openTasks.filter((task) => !task.assignee).length}
                  value={filters.person}
                  onChange={(person) => onFilters({ person })}
                />
              )}
            </>
          ) : null}
          {readOnly
            ? null
            : quickNewTask(
                HEADER_NEW_TASK,
                // Words where there is room; an icon with its name in a narrow panel.
                <Button type="button" className="ml-1 @max-3xl:size-8 @max-3xl:px-0" aria-label="New task">
                  <PlusIcon className="size-4" />
                  <span className="@max-3xl:hidden">New task</span>
                </Button>
              )}
        </div>
      </DashboardCardHeader>
      {view === "chat" ? (
        <ProjectChat page={page} />
      ) : view === "activity" ? (
        <ProjectActivity projectId={page.project.id} onOpenTask={onOpenTask} />
      ) : view === "files" ? (
        <ProjectFiles projectId={page.project.id} onOpenTask={onOpenTask} onOpenChat={() => setView("chat")} />
      ) : hasTaskFilters(filters) && filtered.length === 0 ? (
        <p className="p-4 text-sm text-muted-foreground">
          No tasks match {filters.q?.trim() ? `"${filters.q.trim()}"` : "these filters"}. Clear the
          filters to see every task.
        </p>
      ) : view === "calendar" ? (
        <TaskCalendar
          tasks={filtered}
          milestones={page.milestones}
          readOnly={readOnly || busy}
          onOpenTask={onOpenTask}
          onDueDate={(task, dueDate) => void changeDueDate(task, dueDate)}
        />
      ) : view === "timeline" ? (
        <TaskTimeline
          tasks={filtered}
          groups={grouped?.groups}
          groupsOf={grouped?.groupsOf ?? noGroups}
          readOnly={readOnly || busy}
          onOpenTask={onOpenTask}
          onDates={(task, dates) => void changeDates(task, dates)}
        />
      ) : view === "board" ? (
        <TaskBoard
          tasks={filtered}
          openTaskId={openTaskId}
          readOnly={readOnly || busy}
          onOpenTask={onOpenTask}
          onMove={requestStatus}
          onReorder={(taskIds) => void reorder(taskIds)}
          lanes={byPerson ? lanes : undefined}
          statusOrder={statusOrder}
          onStatusOrder={(next) => void changeStatusOrder(next)}
          addTask={
            readOnly
              ? undefined
              : (key, status, laneId, button, label) =>
                  quickNewTask(key, button, {
                    status,
                    tooltip: label,
                    // On a person's row the task is theirs; "Nobody assigned" makes it nobody's.
                    assignee: laneId === NOBODY_LANE ? NOBODY : laneId === ALL_LANE ? undefined : laneId,
                  })
          }
          cardActions={
            readOnly
              ? undefined
              : {
                  onDuplicate: (task) => void duplicate(task),
                  onDelete: (task) => setDeleting(task),
                  canDelete,
                }
          }
          onHandOver={(task, personId, status, order) => {
            // A move to Stuck in another row still needs its reason, so it is refused here.
            if (status === "stuck" && task.status !== "stuck") {
              showErrorToast("Hand it over first, then mark it Stuck from its own row.")
              return
            }
            const person = personId ? (lanes.find((lane) => lane.id === personId) ?? null) : null
            setHandingOver({ task, person: person && { id: person.id, name: person.name }, status, order })
          }}
          // Counted from every task, so a filter never hides who is over the limit.
          doingWarnings={overDoingLimit(tasks, page.project.doingLimit)}
          // The List's chosen fields, as lines on the cards (Tyler, 16 Oct 2026).
          cardFields={filteredType ? { columns: fieldColumns, fields: filteredType.fields } : undefined}
        />
      ) : (
        <TaskList
          tasks={filtered}
          readOnly={readOnly}
          busy={busy}
          onOpenTask={(task) => onOpenTask(task.id)}
          groups={grouped?.groups}
          groupsOf={grouped?.groupsOf}
          // Grouped by tags a task can sit under several headings, so rows don't drag then.
          onReorder={readOnly || grouping === "tags" ? undefined : (taskIds) => void reorder(taskIds)}
          bulk={{ people, projects: page.otherProjects }}
          fieldColumns={fieldColumns}
          selectedSlot={selectedSlot}
          onDelete={(task) => setDeleting(task)}
          canDelete={canDelete}
          myUserId={page.myUserId}
          addTask={
            readOnly
              ? undefined
              : (groupKey, button) => {
                  const start = startInGroup(grouping, groupKey)
                  return start ? quickNewTask(`group:${grouping}:${groupKey}`, button, start) : null
                }
          }
        />
      )}
      <NewTaskDialog
        projects={[thisProject]}
        types={page.taskTypes}
        tags={page.labels}
        milestones={page.milestones}
        initialProjectId={page.project.id}
        start={full ?? undefined}
        open={Boolean(full)}
        onClose={() => setFull(null)}
        onCreated={rememberProject}
      />
      <BinDialog projectId={page.project.id} open={binOpen} onClose={() => setBinOpen(false)} />
      <SaveViewDialog open={savingView} filters={filters} here={here} onClose={() => setSavingView(false)} />
      <ConfirmDialog
        open={Boolean(handingOver)}
        onOpenChange={(open) => (open || busy ? undefined : setHandingOver(null))}
        destructive={false}
        title={handingOver?.person ? `Hand this task to ${handingOver.person.name}?` : "Take everyone off this task?"}
        description={
          handingOver
            ? handingOver.person
              ? `"${handingOver.task.title}" goes to ${handingOver.person.name}, who is told and has to accept it.`
              : `"${handingOver.task.title}" is left with nobody assigned.`
            : ""
        }
        confirmLabel={handingOver?.person ? "Hand over" : "Unassign"}
        loading={busy}
        onConfirm={() => (handingOver ? void handOver(handingOver) : undefined)}
      />
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
        description={
          stuck
            ? `"${stuck.task.title}" moves to Stuck, and whoever handed it out is told.`
            : ""
        }
        label="Reason"
        confirmLabel="Mark Stuck"
        busy={busy}
        onClose={() => setStuck(null)}
        onConfirm={async (reason) =>
          stuck ? changeStatus(stuck.task, "stuck", reason, stuck.order) : false
        }
      />
    </>
  )
}

const MORE_VIEW_LABEL: Partial<Record<View, string>> = { activity: "Activity", files: "Files", chat: "Chat" }

/**
 * Activity, Files and Chat, and the bin, behind More beside the four tabs,
 * as Tyler drew the page on 13 Oct 2026, and drawn as a tab since 14 Oct. While one of the three is showing,
 * the button wears its name. "3 new" on the project's chat shows on the
 * button and on Chat.
 */
function MoreViews({
  view,
  hasChat,
  chatUnread,
  onPick,
  onBin,
}: {
  view: View
  hasChat: boolean
  chatUnread: number
  onPick: (view: View) => void
  /** Null on an archived project. */
  onBin: (() => void) | null
}) {
  const showing = MORE_VIEW_LABEL[view]
  const unread =
    chatUnread > 0 ? (
      <Badge className="h-4 px-1.5">
        {chatUnread} new<span className="sr-only"> {chatUnread === 1 ? "message" : "messages"}</span>
      </Badge>
    ) : null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {/* Drawn as a fifth tab, underlined while one of its views shows. */}
        <button
          type="button"
          className={UNDERLINE_TAB_CLASS}
          data-state={showing ? "active" : "inactive"}
          aria-current={showing ? "page" : undefined}
        >
          {showing ?? "More"}
          {unread}
          <ChevronDownIcon className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        <DropdownMenuItem onSelect={() => onPick("activity")}>Activity</DropdownMenuItem>
        {hasChat ? (
          <>
            <DropdownMenuItem onSelect={() => onPick("files")}>Files</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onPick("chat")}>
              Chat
              {unread}
            </DropdownMenuItem>
          </>
        ) : null}
        {onBin ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onBin}>
              <Trash2Icon className="size-4" />
              Bin
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
