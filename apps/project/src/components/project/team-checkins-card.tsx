import * as React from "react"
import { Link } from "@tanstack/react-router"
import { HeartIcon, RefreshCwIcon } from "lucide-react"

import { BlockerReplies } from "@/components/project/blocker-replies"
import { TaggedWords } from "@/components/project/tag-textarea"
import { PersonAvatar } from "@/components/project/task-bits"
import { TeamSideCard } from "@/components/project/team-side-card"
import { Button } from "@/components/ui/button"
import type { BlockerReply, TeamDay, TeamDayPerson, TeamDayTask } from "@/lib/api/project/checkins"
import type { TeamDashboard as TeamDashboardData } from "@/lib/api/project/teams"
import { clockIn, shortDayLabel } from "@/lib/project/days"
import { cn } from "@/lib/utils"

/**
 * The day's check-ins, as Tyler drew them on 16 Oct 2026
 * (`workspace/docs/assets/pasted-image-1792198076949402000.png`): a card with
 * "3 of 6 checked in", a bar with one piece per person, and everyone who
 * checked in with their time and notes; then a card of whoever didn't, each
 * with what they picked last time, and one of whoever was away.
 */
export function CheckinsCard({
  day,
  requested,
  myUserId,
  members,
}: {
  day: TeamDay
  /** The day picked on the calendar; a day still to come shows today instead. */
  requested: string | undefined
  myUserId: string
  /** The team, so a tag in a note reads as the person's current name. */
  members: TeamDashboardData["members"]
}) {
  const people = React.useMemo(
    () => members.map((member) => ({ id: member.userId, name: member.name })),
    [members]
  )
  const checkedIn = day.people.filter((row) => row.state === "checked_in")
  const missing = day.people.filter(
    (row) => row.state === "not_yet" || row.state === "missed" || row.state === "no_record"
  )
  const away = day.people.filter((row) => row.state === "away" || row.state === "day_off")
  const late = checkedIn.filter((row) => row.late).length
  const nothingSaved = day.people.every((row) => row.state === "no_record")
  return (
    <>
      <TeamSideCard
        // The block is headed Check-ins, so this card's title is the count, or none.
        title={day.expected ? `${day.checkedIn} of ${day.expected} checked in` : undefined}
        aside={
          day.blocked || late ? (
            <span className="flex items-center gap-1.5">
              {day.blocked ? (
                <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                  {day.blocked} blocked
                </span>
              ) : null}
              {late ? (
                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                  {late} late
                </span>
              ) : null}
            </span>
          ) : null
        }
      >
        {requested && requested > day.today ? (
          <p className="text-sm">{shortDayLabel(requested)} hasn't happened yet. Showing today.</p>
        ) : null}
        {day.expected === 0 ? (
          // A day with no saved rows at all (before the team began, or a day
          // the end-of-day job never ran) isn't a day off; it's a day unknown.
          <p className="text-sm text-muted-foreground">
            {day.holiday
              ? `${day.holiday}, a team holiday.`
              : nothingSaved
                ? "Nothing was saved for this day."
                : "A day off for the team."}
          </p>
        ) : (
          <CheckinPieces checkedIn={checkedIn} expected={day.expected} />
        )}
        {checkedIn.length ? (
          <div className="grid min-w-0">
            {/* The lines between people run to the card's edges. */}
            <ul className="-mx-4 divide-y border-t">
              {checkedIn.map((row) => (
                <li key={row.person.id} className="px-4 py-3 last:pb-0">
                  <PersonCheckin
                    row={row}
                    viewerZone={day.viewerZone}
                    isMe={row.person.id === myUserId}
                    people={people}
                  />
                </li>
              ))}
            </ul>
          </div>
        ) : day.expected ? (
          <p className="text-sm text-muted-foreground">Nobody has checked in yet.</p>
        ) : null}
      </TeamSideCard>
      {missing.length && !nothingSaved ? (
        <TeamSideCard title="Didn't check in" aside={missing.length}>
          <ul className="grid gap-3">
            {missing.map((row) => (
              <OffRow
                key={row.person.id}
                row={row}
                isMe={row.person.id === myUserId}
                line={
                  row.state === "no_record"
                    ? "Nothing saved for this day"
                    : row.before.length
                      ? `${row.questions.yesterday}: ${taskWords(row.before)}`
                      : "No recent check-ins"
                }
              />
            ))}
          </ul>
        </TeamSideCard>
      ) : null}
      {away.length ? (
        <TeamSideCard title="Away" aside={away.length}>
          <ul className="grid gap-3">
            {away.map((row) => (
              <OffRow
                key={row.person.id}
                row={row}
                isMe={row.person.id === myUserId}
                line={row.state === "away" ? "Time off" : "Not a work day for them"}
              />
            ))}
          </ul>
        </TeamSideCard>
      ) : null}
    </>
  )
}

/**
 * One piece of the bar per person expected that day: amber for a late
 * check-in, red for someone blocked, the foreground for on time, and an empty
 * piece for each person still to check in.
 */
function CheckinPieces({ checkedIn, expected }: { checkedIn: TeamDayPerson[]; expected: number }) {
  const shown = checkedIn.slice(0, expected)
  const tone = (row: TeamDayPerson) =>
    row.blocked ? "bg-destructive" : row.late ? "bg-amber-500" : "bg-foreground"
  return (
    <div
      role="img"
      aria-label={`${checkedIn.length} of ${expected} checked in`}
      className="flex h-1.5 gap-1"
    >
      {shown.map((row) => (
        <span key={row.person.id} className={cn("flex-1 rounded-full", tone(row))} />
      ))}
      {Array.from({ length: expected - shown.length }, (_, index) => (
        <span key={`empty-${index}`} className="flex-1 rounded-full bg-muted" />
      ))}
    </div>
  )
}

/** Someone who didn't check in or was away: a dashed photo, the name, one line under it. */
function OffRow({ row, isMe, line }: { row: TeamDayPerson; isMe: boolean; line: string }) {
  return (
    <li className="flex min-w-0 items-center gap-3">
      <PersonAvatar
        name={row.person.name}
        size="default"
        className="after:border-dashed [&_[data-slot=avatar-fallback]]:bg-transparent"
      />
      <span className="grid min-w-0">
        <span className="truncate text-sm font-medium">
          {row.person.name}
          {isMe ? " (you)" : ""}
        </span>
        <span className="truncate text-xs text-muted-foreground">{line}</span>
      </span>
    </li>
  )
}

/** "Brief, Logo, 1 personal task": the titles the viewer may see, the rest counted. */
function taskWords(tasks: TeamDayTask[]) {
  const seen = tasks.flatMap((task) => (task.title !== null ? [task.title] : []))
  const personal = tasks.filter((task) => task.personal).length
  const hidden = tasks.length - seen.length - personal
  return [
    ...seen,
    hidden ? (hidden === 1 ? "1 task in another project" : `${hidden} tasks in other projects`) : null,
    personal ? (personal === 1 ? "1 personal task" : `${personal} personal tasks`) : null,
  ]
    .filter(Boolean)
    .join(", ")
}

/**
 * One person who checked in, as Tyler drew it on 16 Oct 2026
 * (`workspace/docs/assets/pasted-image-1792199207802160000.png`): name, the
 * time in the viewer's clock and Late, then under the team's word for
 * "Today" each task they picked as a card of its own. A task carried over
 * from their last check-in says "Since yesterday". A blocked one turns red
 * with its reason and Reply. Their own words, when they wrote any, sit
 * above the cards, and thanks get one small line.
 */
function PersonCheckin({
  row,
  viewerZone,
  isMe,
  people,
}: {
  row: TeamDayPerson
  viewerZone: string
  isMe: boolean
  people: { id: string; name: string }[]
}) {
  const { questions, notes } = row
  const carried = new Set(row.before.flatMap((task) => (task.taskId ? [task.taskId] : [])))
  const blockerOf = (task: TeamDayTask) =>
    task.taskId ? row.blockers.find((blocker) => blocker.taskId === task.taskId) : undefined
  // A blocked task the viewer can't open has no id to match, so it gets a card of its own.
  const unnamedBlockers = row.blockers.filter((blocker) => !blocker.taskId)
  // Those hidden blocked tasks are among the picks too, so the plain cards leave them out.
  const picked = [
    ...row.picked.filter((task) => task.taskId),
    ...row.picked.filter((task) => !task.taskId).slice(unnamedBlockers.length),
  ]
  const empty = !notes?.yesterday && !notes?.today && !notes?.blocker && row.picked.length === 0 && row.blockers.length === 0
  return (
    <div className="grid min-w-0 gap-2">
      <div className="flex min-w-0 items-center gap-3">
        <PersonAvatar name={row.person.name} avatarUrl={row.person.avatarUrl} size="default" />
        {/* In a narrow panel the time and Late drop under the name rather than out of the card. */}
        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-x-3 gap-y-1">
          <span className="min-w-0 flex-1 basis-24 truncate text-sm font-medium">
            {row.person.name}
            {isMe ? " (you)" : ""}
          </span>
          <span className="flex min-w-0 flex-wrap items-center justify-end gap-2">
            {row.checkedInAt ? (
              <span className="text-sm text-muted-foreground tabular-nums">
                {clockIn(row.checkedInAt, viewerZone)}
              </span>
            ) : null}
            {row.late ? (
              <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                Late
              </span>
            ) : null}
          </span>
        </div>
      </div>
      <div className="grid min-w-0 gap-3 pl-11">
        {empty ? <p className="text-sm text-muted-foreground">No tasks attached</p> : null}
        {notes?.yesterday ? (
          <BoxSection label={questions.yesterday}>
            <p className="text-sm break-words">
              <TaggedWords body={notes.yesterday} people={people} />
            </p>
          </BoxSection>
        ) : null}
        {notes?.today || picked.length || unnamedBlockers.length || notes?.blocker ? (
          <BoxSection label={questions.today}>
            {notes?.today ? (
              <p className="text-sm break-words">
                <TaggedWords body={notes.today} people={people} />
              </p>
            ) : null}
            {picked.map((task, index) => (
              <PickCard
                key={task.taskId ?? `pick-${index}`}
                task={task}
                carried={Boolean(task.taskId && carried.has(task.taskId))}
                blocker={blockerOf(task)}
                row={row}
              />
            ))}
            {unnamedBlockers.map((blocker, index) => (
              <PickCard key={`hidden-${index}`} task={blocker} carried={false} blocker={blocker} row={row} />
            ))}
            {notes?.blocker ? (
              <BlockedCard
                title={null}
                reason={<TaggedWords body={notes.blocker} people={people} />}
                label={questions.blocker}
                replies={row.noteReplies}
                checkinId={row.checkinId}
                taskId={null}
                blockedName={row.person.name}
                canReply
              />
            ) : null}
          </BoxSection>
        ) : null}
        {row.thanks.length ? (
          <p className="flex items-start gap-1.5 text-xs break-words text-muted-foreground">
            <HeartIcon className="mt-0.5 size-3 shrink-0" aria-hidden />
            <span>
              Thanked by{" "}
              {row.thanks.map((line) => `${line.fromName} for ${line.taskTitle ?? "a task"}`).join(", ")}
            </span>
          </p>
        ) : null}
      </div>
    </div>
  )
}

/** "TODAY" in small capitals, the team's own word, over what goes with it. */
function BoxSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section aria-label={label} className="grid min-w-0 gap-1.5">
      <h4 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</h4>
      {children}
    </section>
  )
}

/** One picked task as a card; a blocked one is the red card with its reason and Reply. */
function PickCard({
  task,
  carried,
  blocker,
  row,
}: {
  task: TeamDayTask
  carried: boolean
  blocker: (TeamDayTask & { reason: string | null; replies: BlockerReply[] }) | undefined
  row: TeamDayPerson
}) {
  const since = carried ? (
    <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
      <RefreshCwIcon className="size-3" aria-hidden />
      Since yesterday
    </span>
  ) : null
  if (blocker) {
    return (
      <BlockedCard
        title={<TaskTitle task={task} />}
        since={since}
        reason={blocker.reason}
        label="Blocked"
        replies={blocker.replies}
        checkinId={row.checkinId}
        taskId={blocker.taskId}
        blockedName={row.person.name}
        // Only someone who can open the task replies about it; its title is private to them.
        canReply={Boolean(blocker.taskId)}
      />
    )
  }
  return (
    <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1 rounded-lg border bg-background px-3 py-2.5 text-sm">
      <TaskTitle task={task} />
      {since}
    </div>
  )
}

/** The red card: what is blocked, the word "Blocked", the reason, Reply, and the replies. */
function BlockedCard({
  title,
  since,
  label,
  reason,
  replies,
  checkinId,
  taskId,
  blockedName,
  canReply,
}: {
  title: React.ReactNode
  since?: React.ReactNode
  label: string
  reason: React.ReactNode
  replies: BlockerReply[]
  checkinId: string | null
  taskId: string | null
  blockedName: string
  canReply: boolean
}) {
  const [replying, setReplying] = React.useState(false)
  return (
    <div className="grid min-w-0 gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2.5 text-sm">
      {title ? (
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1">
          {title}
          {since}
        </div>
      ) : null}
      <div className="flex min-w-0 items-end justify-between gap-3">
        <div className="grid min-w-0 gap-0.5">
          <span className="text-xs font-medium text-destructive">{label}</span>
          {reason ? <span className="break-words text-destructive">{reason}</span> : null}
        </div>
        {canReply && checkinId && !replying ? (
          <Button type="button" variant="outline" size="sm" className="shrink-0 bg-background" onClick={() => setReplying(true)}>
            Reply
          </Button>
        ) : null}
      </div>
      <BlockerReplies
        replies={replies}
        checkinId={checkinId}
        taskId={taskId}
        blockedName={blockedName}
        canReply={canReply}
        open={replying}
        onOpenChange={setReplying}
        className=""
      />
    </div>
  )
}

/** A task's title, opening it; one the viewer can't see is named for what it is. */
function TaskTitle({ task }: { task: TeamDayTask }) {
  if (task.title === null) {
    return (
      <span className="min-w-0 flex-1 basis-36 text-muted-foreground">
        {task.personal ? "A personal task" : "A task in another project"}
      </span>
    )
  }
  if (!task.taskId) return <span className="min-w-0 flex-1 basis-36 break-words">{task.title} (deleted)</span>
  return (
    <Link
      // The page it is on: an employee's /team, or a team's page under Teams.
      to="."
      search={(previous: Record<string, unknown>) => ({ ...previous, task: task.taskId ?? undefined })}
      className="min-w-0 flex-1 basis-36 break-words hover:underline focus-visible:underline focus-visible:outline-none"
    >
      {task.title}
    </Link>
  )
}
