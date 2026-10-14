import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { ChevronDownIcon, PlusIcon, Trash2Icon } from "lucide-react"

import { BinDialog } from "@/components/project/bin-dialog"
import { FieldColumnsMenu } from "@/components/project/field-columns-menu"
import { NewTaskDialog } from "@/components/project/new-task-dialog"
import { ProjectActivity } from "@/components/project/project-activity"
import { ProjectChat } from "@/components/project/project-chat"
import { ProjectFiles } from "@/components/project/project-files"
import { ReasonDialog } from "@/components/project/reason-dialog"
import { SaveViewDialog, SavedViewsControls } from "@/components/project/saved-views"
import { NOBODY_LANE, TaskBoard, type BoardLane } from "@/components/project/task-board"
import { TaskCalendar } from "@/components/project/task-calendar"
import { TaskFilterPopover } from "@/components/project/task-filter-popover"
import { TaskList } from "@/components/project/task-list"
import { TaskTimeline } from "@/components/project/task-timeline"
import { DashboardCardHeader } from "@/components/shared/dashboard-card-header"
import { DashboardToolbarSearch } from "@/components/shared/dashboard-toolbar"
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
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { loadProjectChatUnread } from "@/lib/api/project/chat"
import type { ProjectPage } from "@/lib/api/project/projects"
import { saveTaskOrder } from "@/lib/api/project/sorting"
import { assignProjectTask, saveTask, setStatus, type TaskCard } from "@/lib/api/project/tasks"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useSyncedDraft } from "@/lib/hooks/use-synced-draft"
import { useRememberedChoice } from "@/lib/remembered-choice"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { rememberProject } from "@/lib/project/new-task-project"
import { BOARD_GROUP_KEY, PROJECT_TASK_VIEW_KEY } from "@/lib/project/panel-keys"
import type { TaskStatus } from "@/lib/project/rules"
import { filterTasks, hasTaskFilters, type TaskFilters } from "@/lib/project/task-filters"
import { overDoingLimit } from "@/lib/project/doing-limit"
import { placesAfterReorder } from "@/lib/project/task-order"
import { offeredTypes } from "@/lib/project/task-types"
import { useFieldColumns } from "@/lib/project/use-field-columns"
import { useProjectLive } from "@/lib/project/use-project-live"
import { useWidthAtLeast } from "@/lib/project/use-width-at-least"
import { viewHasFilters } from "@/lib/project/saved-views"
import { cn } from "@/lib/utils"
import { showErrorToast } from "@/lib/toast/error-toast"

const VIEWS = ["board", "list", "calendar", "timeline", "activity", "files", "chat"] as const
type View = (typeof VIEWS)[number]

const NO_SECTION = "none"

/** The tasks panel's width from which the search box fits in its header beside the tabs. */
const SEARCH_ROOM_PX = 896

const GROUPS = ["status", "person"] as const
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
 * when grouped), a List grouped under the project's sections, a Calendar of
 * due dates or a Timeline of start and due dates, its Activity, every file in it, and its own Chat. The tab last
 * used is remembered in this browser; the search and filters live in the
 * address. A status change or a new order shows at once and is put back if
 * the server refuses it. A "Just me" list has no Files or Chat, since
 * nobody else can read it.
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
  const [chosenView, setView] = useRememberedChoice<View>(PROJECT_TASK_VIEW_KEY, "board", VIEWS)
  // A "Just me" list has no Chat and no Files tab, since nobody else shares it.
  const hasChat = !page.project.personal
  const view = (chosenView === "chat" || chosenView === "files") && !hasChat ? "board" : chosenView

  React.useEffect(() => {
    if (!openChat) return
    if (hasChat) setView("chat")
    onChatOpened()
  }, [openChat, hasChat, setView, onChatOpened])
  const [tasks, setTasks] = useSyncedDraft(page.tasks)
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
  const [creating, setCreating] = React.useState(false)
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
  const people = page.members.map((m) => ({ id: m.userId, name: m.name }))
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
  const sectionGroups = React.useMemo(
    () => [
      ...page.sections.map((section) => ({ key: section.id, label: section.name })),
      { key: NO_SECTION, label: "No section" },
    ],
    [page.sections]
  )

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
  // The search box needs the panel's width; below it, the box is the Filter popover's first row.
  const [header, roomForSearch] = useWidthAtLeast<HTMLDivElement>(SEARCH_ROOM_PX)
  const taskTab = view !== "activity" && view !== "files" && view !== "chat"

  function saveView() {
    if (!viewHasFilters(filters)) {
      showErrorToast("Search or pick a filter first, then save it as a view.")
      return
    }
    setSavingView(true)
  }

  return (
    <>
      <DashboardCardHeader ref={header} className="@container">
        <Tabs
          value={view}
          onValueChange={(value) => pickView(value as View)}
          className="min-w-0 flex-1"
        >
          {/* The tabs scroll sideways rather than sliding under the buttons. */}
          <ScrollArea className="min-w-0">
            <div className="flex w-max items-center gap-1">
              <TabsList className="justify-start">
                <TabsTrigger value="board">Board</TabsTrigger>
                <TabsTrigger value="list">List</TabsTrigger>
                <TabsTrigger value="calendar">Calendar</TabsTrigger>
                <TabsTrigger value="timeline">Timeline</TabsTrigger>
              </TabsList>
              <MoreViews
                view={view}
                hasChat={hasChat}
                chatUnread={view === "chat" ? 0 : chatUnread}
                onPick={pickView}
                onBin={readOnly ? null : () => setBinOpen(true)}
              />
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </Tabs>
        <div className="flex shrink-0 items-center gap-2">
          {taskTab ? (
            <>
              {roomForSearch ? (
                <DashboardToolbarSearch
                inputClassName="sm:w-44 lg:w-48"
                name="task-search"
                aria-label="Search tasks by title and notes"
                placeholder="Search tasks"
                value={filters.q ?? ""}
                onChange={(event) => onFilters({ q: event.target.value || undefined })}
                />
              ) : null}
              <TaskFilterPopover
                filters={filters}
                onChange={onFilters}
                people={people}
                labels={page.labels}
                types={page.taskTypes}
                search={!roomForSearch}
                groupByPerson={
                  view === "board" && !page.project.personal
                    ? { on: byPerson, onChange: (on) => setGroup(on ? "person" : "status") }
                    : undefined
                }
                extra={
                  view === "list" && filteredType?.fields.length ? (
                    <FieldColumnsMenu
                      fields={filteredType.fields}
                      chosen={fieldColumns.map((column) => column.field.id)}
                      onChange={setColumnIds}
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
              />
            </>
          ) : null}
          {readOnly ? null : (
            // Words where there is room; an icon with its name in a narrow panel.
            <Button
              type="button"
              className="@max-2xl:size-8 @max-2xl:px-0"
              aria-label="New task"
              onClick={() => setCreating(true)}
            >
              <PlusIcon className="size-4" />
              <span className="@max-2xl:hidden">New task</span>
            </Button>
          )}
        </div>
      </DashboardCardHeader>
      {taskTab && !roomForSearch && filters.q?.trim() ? (
        // The search box is inside Filter in a narrow panel, so the words being searched show here.
        <p className="flex items-center gap-2 border-b px-3 py-2 text-sm text-muted-foreground">
          Searching for "{filters.q.trim()}"
          <Button type="button" variant="ghost" size="sm" onClick={() => onFilters({ q: undefined })}>
            Clear search
          </Button>
        </p>
      ) : null}
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
          readOnly={readOnly || busy}
          onOpenTask={onOpenTask}
          onDueDate={(task, dueDate) => void changeDueDate(task, dueDate)}
        />
      ) : view === "timeline" ? (
        <TaskTimeline
          tasks={filtered}
          groups={page.sections.length ? sectionGroups : undefined}
          groupOf={(task) => task.section?.id ?? NO_SECTION}
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
        />
      ) : (
        <TaskList
          tasks={filtered}
          readOnly={readOnly || busy}
          onOpenTask={(task) => onOpenTask(task.id)}
          groups={page.sections.length ? sectionGroups : undefined}
          groupOf={(task) => task.section?.id ?? NO_SECTION}
          showEmptyGroups={!hasTaskFilters(filters)}
          onReorder={readOnly ? undefined : (taskIds) => void reorder(taskIds)}
          bulk={{ people, projects: page.otherProjects }}
          fieldColumns={fieldColumns}
        />
      )}
      <NewTaskDialog
        projects={[
          {
            id: page.project.id,
            name: page.project.name,
            color: page.project.color,
            members: page.members,
            typeIds: offeredTypes(page.taskTypes, page.project.personal ? [] : page.project.hiddenTypeIds).map(
              (type) => type.id
            ),
            defaultTypeId: page.project.defaultTypeId,
          },
        ]}
        types={page.taskTypes}
        initialProjectId={page.project.id}
        open={creating}
        onClose={() => setCreating(false)}
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
 * as Tyler drew the page on 13 Oct 2026. While one of the three is showing,
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
        <Button
          type="button"
          variant="ghost"
          className={cn(showing ? "bg-muted text-foreground" : "text-muted-foreground")}
          aria-current={showing ? "page" : undefined}
        >
          {showing ?? "More"}
          {unread}
          <ChevronDownIcon className="size-4" />
        </Button>
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
