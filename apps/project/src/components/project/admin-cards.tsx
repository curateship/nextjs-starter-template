import * as React from "react"
import { Link, useNavigate, useRouter } from "@tanstack/react-router"
import { ChevronDown, CircleAlertIcon, Loader2Icon } from "lucide-react"
import { toast } from "sonner"

import { FoldHeading } from "@/components/project/fold-heading"
import { PanelCard } from "@/components/project/panel-card"
import { ReasonDialog } from "@/components/project/reason-dialog"
import { ProjectDot } from "@/components/project/task-bits"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { AdminDashboard, WaitingAsk } from "@/lib/api/project/admin-dashboard"
import { assignProjectTask, answerMoreTaskTime, type TaskCard } from "@/lib/api/project/tasks"
import { resendTeamInvite } from "@/lib/api/project/teams"
import { plural } from "@/lib/format/plural"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { focusRingInset } from "@/lib/layout/focus-ring"
import { clockIn, dayLabel, localNow } from "@/lib/project/days"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { meetingsByNow } from "@/lib/project/meetings-today"
import { PANEL_FOOTER_PADDING, PANEL_GAP } from "@/lib/project/panel-gutter"
import { TEAM_RIGHT_TAB_KEY } from "@/lib/project/panel-keys"
import { useNow } from "@/lib/project/use-now"
import { collapseStorageKey, useRememberedCollapse } from "@/lib/remembered-choice"
import { cn } from "@/lib/utils"

/**
 * The site admin's cards on the left of their My dashboard, in Tyler's "act
 * first" order (23 Oct 2026), the red ones on top (24 Oct 2026, "red card
 * should be on top"), then amber, blue and green. Each counts across every
 * team and shows its five most urgent rows with "Show all" for the rest. A
 * card with nothing in it is left out, and with all nine empty one "All
 * clear" line stands in for them (24 Oct 2026, "this is way too many cards").
 * A task in a card opens in the right panel. The Inbox, always drawn, comes
 * from the screen.
 */

/** Rows a card shows before "Show all". */
const ROWS = 5

/**
 * Each card's tint by how much it matters (Tyler, 24 Oct 2026: "each card
 * should be a color based on their importance like the done card should have
 * a green card"). Red needs the site admin now, amber soon, blue is to know
 * about, green is done. See-through tints, so both themes work.
 */
const TONE = {
  now: "bg-red-500/10",
  soon: "bg-amber-500/10",
  know: "bg-blue-500/10",
  done: "bg-emerald-500/10",
} as const

type Cards = AdminDashboard["cards"]

export function AdminCards({
  cards,
  zone,
  loadedAt,
  openTaskId,
  projectInfo,
  onOpenTask,
}: {
  cards: Cards
  /** The site admin's own zone, for meeting times. */
  zone: string
  /** The page load's moment, so Meetings today knows which have finished from the first drawing. */
  loadedAt: string
  /** The task open in the right panel, whose row looks picked. */
  openTaskId: string | undefined
  /** Each project's colour, for the dot before a task's title. */
  projectInfo: AdminDashboard["projectInfo"]
  onOpenTask: (taskId: string) => void
}) {
  // How many cards show under the heading: an empty one is not drawn.
  const cardCount = [
    cards.waiting,
    cards.attention,
    cards.unassigned,
    cards.invites,
    cards.meetings,
    cards.dueThisWeek,
    cards.milestones,
    cards.doneToday,
  ].filter((rows) => rows.length > 0).length
  const cardsWithRows = cardCount > 0
  // The heading's fold, remembered in this browser.
  const [shown, setShown, noFlashKey] = useRememberedCollapse(collapseStorageKey.settingsCard("project-admin-attention"))
  // Nothing to act on draws nothing, and the Inbox moves up (Tyler, 25 Oct 2026: "Just dont show anything").
  if (!cardsWithRows) return null
  return (
    // A card in the left panel's footer since 6 Nov 2026 (Tyler: "the need my
    // attention should be a card in the footer too"), folding like the Daily
    // card. Its heading is the greeting's size, and there is none at all while
    // no card has anything (Tyler, 30 Oct 2026: "Add a
    // label that says "Need your attention" here", then "add some padding
    // above. also if there is nothing there (no cards) hide the label"). Its
    // arrow folds every card under it, and the heading stays (Tyler, 31 Oct
    // 2026: "add a toggle here to hide all the cards", then "its arrow toggle").
    <Collapsible open={shown} onOpenChange={setShown} className="grid grid-cols-[minmax(0,1fr)]">
      <FoldHeading band icon={<CircleAlertIcon />} title="Need your attention" count={cardCount} open={shown} />
      <CollapsibleContent data-collapse-key={noFlashKey} className={cn("grid grid-cols-[minmax(0,1fr)]", PANEL_GAP, PANEL_FOOTER_PADDING)}>
        <AttentionCards
          cards={cards}
          zone={zone}
          loadedAt={loadedAt}
          rows={{ openTaskId, projectInfo }}
          onOpenTask={onOpenTask}
        />
      </CollapsibleContent>
    </Collapsible>
  )
}

/** The cards under "Need your attention", in Tyler's order; an empty one draws nothing. */
function AttentionCards({
  cards,
  zone,
  loadedAt,
  rows,
  onOpenTask,
}: {
  cards: Cards
  zone: string
  loadedAt: string
  rows: RowLook
  onOpenTask: (taskId: string) => void
}) {
  return (
    <>
      <WaitingCard asks={cards.waiting} onOpenTask={onOpenTask} />
      <AttentionCard teams={cards.attention} />
      <UnassignedCard tasks={cards.unassigned} rows={rows} onOpenTask={onOpenTask} />
      <InvitesCard invites={cards.invites} />
      <TaskListCard
        storageId="project-admin-due-week"
        title="Due this week"
        tasks={cards.dueThisWeek}
        rows={rows}
        line={(task) =>
          [task.projectName, task.dueDate ? dayLabel(task.dueDate) : null, task.assignee?.name ?? "Nobody on it"]
            .filter(Boolean)
            .join(" · ")
        }
        onOpenTask={onOpenTask}
      />
      <MeetingsCard meetings={cards.meetings} zone={zone} loadedAt={loadedAt} />
      <MilestonesCard milestones={cards.milestones} />
      <DoneTodayCard people={cards.doneToday} rows={rows} onOpenTask={onOpenTask} />
    </>
  )
}

/** A card's rows, the first five then the rest behind "Show all". */
function Rows<T>({ items, children }: { items: T[]; children: (item: T) => React.ReactNode }) {
  const [all, setAll] = React.useState(false)
  return (
    <div className="grid gap-1">
      <ul className="-mx-2 grid gap-0.5">{(all ? items : items.slice(0, ROWS)).map(children)}</ul>
      {items.length > ROWS ? (
        <Button type="button" variant="ghost" size="sm" className="-ml-2 justify-self-start" onClick={() => setAll(!all)}>
          {all ? "Show fewer" : `Show all ${items.length}`}
        </Button>
      ) : null}
    </div>
  )
}

const ROW_CLASS = "grid w-full min-w-0 gap-0.5 rounded-md px-2 py-1.5 text-left hover:bg-background"

/** What a task row needs from the screen: which task is open, and each project's colour. */
type RowLook = { openTaskId: string | undefined; projectInfo: AdminDashboard["projectInfo"] }

/**
 * A task's row: its project's dot and title, its muted line under it, as one
 * button. The task open on the right looks picked, the way My tasks marks its
 * open row (polish, Tyler, 6 Nov 2026). The dot is the one Meetings rows have.
 */
function TaskRowButton({
  taskId,
  projectId,
  title,
  line,
  rows,
  onOpenTask,
}: {
  taskId: string
  projectId: string
  title: string
  line: React.ReactNode
  rows: RowLook
  onOpenTask: (taskId: string) => void
}) {
  const open = rows.openTaskId === taskId
  const color = rows.projectInfo[projectId]?.color
  return (
    <button
      type="button"
      aria-current={open ? "true" : undefined}
      className={cn(ROW_CLASS, open && "bg-background shadow-[inset_2px_0_0_var(--foreground)]", focusRingInset)}
      onClick={() => onOpenTask(taskId)}
    >
      <span className="flex min-w-0 items-center gap-2 text-sm">
        {color ? <ProjectDot color={color} /> : null}
        <span className="truncate">{title}</span>
      </span>
      <span className="truncate text-xs text-muted-foreground">{line}</span>
    </button>
  )
}

/**
 * Which rows are saving, so only those wait while the rest stay usable
 * (polish, Tyler, 6 Nov 2026). Answering one ask no longer greys every ask.
 */
function useRowSave() {
  const [run] = useAsyncAction(getProjectErrorMessage)
  const [saving, setSaving] = React.useState<ReadonlySet<string>>(() => new Set())
  const mark = (rowId: string, on: boolean) =>
    setSaving((current) => {
      const next = new Set(current)
      if (on) next.add(rowId)
      else next.delete(rowId)
      return next
    })
  async function save(rowId: string, work: () => Promise<unknown>, done?: string) {
    mark(rowId, true)
    try {
      return await run(work, done)
    } finally {
      mark(rowId, false)
    }
  }
  return [save, (rowId: string) => saving.has(rowId)] as const
}

function WaitingCard({ asks, onOpenTask }: { asks: WaitingAsk[]; onOpenTask: (taskId: string) => void }) {
  const router = useRouter()
  const [save, isSaving] = useRowSave()
  const [saying, setSaying] = React.useState<WaitingAsk | null>(null)
  if (asks.length === 0) return null

  async function answer(taskId: string, work: () => Promise<unknown>, done: string) {
    const ok = await save(taskId, work, done)
    if (ok) await router.invalidate()
    return ok
  }

  return (
    <PanelCard storageId="project-admin-waiting" className={TONE.now} title="Waiting on you" meta={asks.length}>
      <Rows items={asks}>
        {(ask) => (
          <li key={ask.taskId} className="grid gap-1.5 rounded-md px-2 py-1.5">
            <button
              type="button"
              className={cn("min-w-0 truncate rounded-md text-left text-sm hover:underline", focusRingInset)}
              onClick={() => onOpenTask(ask.taskId)}
            >
              {ask.title}
            </button>
            <p className="text-xs text-muted-foreground">
              {ask.askedByName} asks for {dayLabel(ask.day)}
              {ask.dueDate ? ` instead of ${dayLabel(ask.dueDate)}` : ""} · {ask.projectName}
            </p>
            {ask.reason ? <p className="text-xs break-words">{ask.reason}</p> : null}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isSaving(ask.taskId)}
                onClick={() =>
                  void answer(
                    ask.taskId,
                    () => answerMoreTaskTime({ taskId: ask.taskId, answer: "yes" }),
                    `Yes. It's now due ${dayLabel(ask.day)}.`
                  )
                }
              >
                {isSaving(ask.taskId) ? <Loader2Icon className="size-4 animate-spin" /> : null}
                Yes
              </Button>
              <Button type="button" variant="outline" size="sm" disabled={isSaving(ask.taskId)} onClick={() => setSaying(ask)}>
                No
              </Button>
            </div>
          </li>
        )}
      </Rows>
      <ReasonDialog
        open={Boolean(saying)}
        title="Keep the date?"
        description={saying ? `${saying.askedByName} is told no, and "${saying.title}" stays due as it is.` : ""}
        label="Why not (optional)"
        confirmLabel="Say no"
        optional
        busy={saying ? isSaving(saying.taskId) : false}
        onClose={() => setSaying(null)}
        onConfirm={async (reason) => {
          if (!saying) return false
          const ok = await answer(
            saying.taskId,
            () => answerMoreTaskTime({ taskId: saying.taskId, answer: "no", reason: reason.trim() || null }),
            "No. The date stays."
          )
          if (ok) setSaying(null)
          return ok
        }}
      />
    </PanelCard>
  )
}

function AttentionCard({ teams }: { teams: Cards["attention"] }) {
  const navigate = useNavigate()
  if (teams.length === 0) return null
  // Called Urgent here (Tyler, 30 Oct 2026: "rename the card "Need your attention" to "Urgent"").
  // A count opens that team on its Needs attention tab, as the Teams dashboard's numbers do.
  const openAttention = (teamId: string) => {
    try {
      window.localStorage.setItem(TEAM_RIGHT_TAB_KEY, "attention")
    } catch {
      // Without storage the team opens on the tab it last had.
    }
    void navigate({ to: "/teams/$teamId", params: { teamId } })
  }
  return (
    <PanelCard storageId="project-admin-attention" className={TONE.now} title="Urgent" meta={teams.length}>
      <Rows items={teams}>
        {(team) => (
          <li key={team.teamId} className="grid gap-1 rounded-md px-2 py-1.5">
            <span className="truncate text-sm">{team.teamName}</span>
            <span className="flex flex-wrap gap-1">
              {(
                [
                  ["Stuck", team.stuck],
                  ["Overdue", team.overdue],
                  ["Untouched", team.untouched],
                ] as const
              )
                .filter(([, n]) => n > 0)
                .map(([label, n]) => (
                  <Button key={label} type="button" variant="outline" size="sm" onClick={() => openAttention(team.teamId)}>
                    {n} {label}
                  </Button>
                ))}
            </span>
          </li>
        )}
      </Rows>
    </PanelCard>
  )
}

function UnassignedCard({
  tasks,
  rows,
  onOpenTask,
}: {
  tasks: Cards["unassigned"]
  rows: RowLook
  onOpenTask: (taskId: string) => void
}) {
  const router = useRouter()
  const [save, isSaving] = useRowSave()
  if (tasks.length === 0) return null
  return (
    <PanelCard storageId="project-admin-unassigned" className={TONE.soon} title="No one on it" meta={tasks.length}>
      <Rows items={tasks}>
        {(task) => (
          <li key={task.taskId} className="grid gap-1.5">
            <TaskRowButton
              taskId={task.taskId}
              projectId={task.projectId}
              title={task.title}
              line={[task.projectName, task.dueDate ? dayLabel(task.dueDate) : null].filter(Boolean).join(" · ")}
              rows={rows}
              onOpenTask={onOpenTask}
            />
            <div className="px-2 pb-1">
              <Select
                value=""
                disabled={isSaving(task.taskId)}
                onValueChange={(assigneeUserId) => {
                  const name = task.people.find((person) => person.userId === assigneeUserId)?.name ?? "them"
                  void save(
                    task.taskId,
                    () => assignProjectTask({ taskId: task.taskId, assigneeUserId }),
                    `Handed to ${name}.`
                  ).then((ok) => (ok ? router.invalidate() : undefined))
                }}
              >
                <SelectTrigger aria-label={`Hand "${task.title}" to`} className="w-full">
                  <SelectValue placeholder="Hand to" />
                </SelectTrigger>
                <SelectContent>
                  {task.people.map((person) => (
                    <SelectItem key={person.userId} value={person.userId}>
                      {person.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </li>
        )}
      </Rows>
    </PanelCard>
  )
}

function InvitesCard({ invites }: { invites: Cards["invites"] }) {
  const [save, isSaving] = useRowSave()
  if (invites.length === 0) return null
  return (
    <PanelCard storageId="project-admin-invites" className={TONE.soon} title="Invites not taken" meta={invites.length}>
      <Rows items={invites}>
        {(invite) => (
          <li key={`${invite.teamId}:${invite.userId}`} className="flex items-center gap-2 rounded-md px-2 py-1.5">
            <span className="grid min-w-0 flex-1 gap-0.5">
              <span className="truncate text-sm">{invite.name}</span>
              <span className="truncate text-xs text-muted-foreground">
                {invite.email} · {invite.teamName}
              </span>
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isSaving(`${invite.teamId}:${invite.userId}`)}
              onClick={() =>
                void save(`${invite.teamId}:${invite.userId}`, async () => {
                  const sent = await resendTeamInvite(invite.userId, invite.teamId)
                  // With email off on this server, the link went to the server's log.
                  toast.success(sent.emailed ? `Sent again to ${invite.email}.` : "Made a new link. Email is off here, so it's in the server log.")
                })
              }
            >
              {isSaving(`${invite.teamId}:${invite.userId}`) ? <Loader2Icon className="size-4 animate-spin" /> : null}
              Resend
            </Button>
          </li>
        )}
      </Rows>
    </PanelCard>
  )
}

/**
 * Today's meetings, the one on now first with "Now" beside it, then the ones
 * still to come, then the finished ones faded at the bottom. The card looks
 * at the clock every 30 seconds, so a meeting moves down as it ends.
 */
function MeetingsCard({ meetings, zone, loadedAt }: { meetings: Cards["meetings"]; zone: string; loadedAt: string }) {
  const nowMs = useNow(loadedAt)
  if (meetings.length === 0) return null
  return (
    <PanelCard storageId="project-admin-meetings" className={TONE.know} title="Meetings today" meta={meetings.length}>
      <Rows items={meetingsByNow(meetings, nowMs)}>
        {({ meeting, when }) => {
          const day = localNow(new Date(meeting.startsAt), zone).day
          return (
            <li key={`${meeting.meetingId}-${meeting.startsAt}`}>
              <Link
                to="/teams/$teamId"
                params={{ teamId: meeting.teamId }}
                search={{ month: day.slice(0, 7), day }}
                className={cn(ROW_CLASS, when === "done" && "opacity-60", focusRingInset)}
              >
                <span className="flex min-w-0 items-center gap-2 text-sm">
                  <ProjectDot color={meeting.color} />
                  <span className="truncate">{meeting.title}</span>
                  {when === "now" ? <Badge variant="secondary">Now</Badge> : null}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {clockIn(meeting.startsAt, zone)} to {clockIn(meeting.endsAt, zone)} · {meeting.teamName}
                </span>
              </Link>
            </li>
          )
        }}
      </Rows>
    </PanelCard>
  )
}

function TaskListCard({
  storageId,
  title,
  tasks,
  rows,
  line,
  onOpenTask,
}: {
  storageId: string
  title: string
  tasks: TaskCard[]
  rows: RowLook
  line: (task: TaskCard) => string
  onOpenTask: (taskId: string) => void
}) {
  if (tasks.length === 0) return null
  return (
    <PanelCard storageId={storageId} title={title} meta={tasks.length} className={TONE.soon}>
      <Rows items={tasks}>
        {(task) => (
          <li key={task.id}>
            <TaskRowButton
              taskId={task.id}
              projectId={task.projectId}
              title={task.title}
              line={line(task)}
              rows={rows}
              onOpenTask={onOpenTask}
            />
          </li>
        )}
      </Rows>
    </PanelCard>
  )
}

function MilestonesCard({ milestones }: { milestones: Cards["milestones"] }) {
  if (milestones.length === 0) return null
  return (
    <PanelCard storageId="project-admin-milestones" className={TONE.know} title="Milestones this month" meta={milestones.length}>
      <Rows items={milestones}>
        {(milestone) => (
          <li key={milestone.id}>
            <Link
              to="/projects/$projectId"
              params={{ projectId: milestone.projectId }}
              className={cn(ROW_CLASS, focusRingInset)}
            >
              <span className="truncate text-sm">{milestone.name}</span>
              <span className="truncate text-xs text-muted-foreground">
                {milestone.projectName} · {dayLabel(milestone.dueDate)} ·{" "}
                {milestone.openTasks ? `${milestone.openTasks} ${plural(milestone.openTasks, "task")} left` : "All done"}
              </span>
            </Link>
          </li>
        )}
      </Rows>
    </PanelCard>
  )
}

function DoneTodayCard({
  people,
  rows,
  onOpenTask,
}: {
  people: Cards["doneToday"]
  rows: RowLook
  onOpenTask: (taskId: string) => void
}) {
  if (people.length === 0) return null
  const total = people.reduce((sum, person) => sum + person.tasks.length, 0)
  return (
    <PanelCard storageId="project-admin-done" className={TONE.done} title="Done today" meta={total}>
      <Rows items={people}>
        {(person) => (
          <li key={person.userId ?? "nobody"}>
            <Collapsible className="group/person">
              <CollapsibleTrigger asChild>
                <button type="button" className={cn(ROW_CLASS, "flex items-center gap-2", focusRingInset)}>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {person.name}
                    <span className="text-muted-foreground"> · {person.tasks.length}</span>
                  </span>
                  <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=closed]/person:-rotate-90" />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <ul className="grid gap-0.5 pl-3">
                  {person.tasks.map((task) => (
                    <li key={task.taskId}>
                      <TaskRowButton
                        taskId={task.taskId}
                        projectId={task.projectId}
                        title={task.title}
                        line={task.projectName}
                        rows={rows}
                        onOpenTask={onOpenTask}
                      />
                    </li>
                  ))}
                </ul>
              </CollapsibleContent>
            </Collapsible>
          </li>
        )}
      </Rows>
    </PanelCard>
  )
}
