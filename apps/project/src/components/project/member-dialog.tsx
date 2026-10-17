import * as React from "react"
import { Link, useRouter } from "@tanstack/react-router"
import { ArrowRightLeftIcon } from "lucide-react"

import { WeekLines } from "@/components/project/my-week-card"
import { SaveLine } from "@/components/project/save-line"
import { DueDate, PersonAvatar, StatusBadge } from "@/components/project/task-bits"
import { TimeOffSection } from "@/components/project/time-off-card"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ErrorRow } from "@/components/ui/error-row"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LoadingRow } from "@/components/ui/loading-row"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { TeamMemberRow } from "@/lib/api/project/teams"
import { loadTeammatePage, saveMemberTitle, type Teammate } from "@/lib/api/project/team-running"
import { useSyncedDraft } from "@/lib/hooks/use-synced-draft"
import { dayLabel, dayRangeLabel } from "@/lib/project/days"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { LIMITS, runsTheTeam, type TeamRole } from "@/lib/project/rules"
import { useSaveLine } from "@/lib/project/use-save-line"

/**
 * A teammate's page, opened from their name on the Team dashboard or the
 * Members page: what they have open in projects I can see, their time off and
 * job title. To a teammate it shows only what the app shows elsewhere (Tyler,
 * 13 Oct 2026). The site admin also sees their private things, changes their
 * job title and time off, and hands all their tasks on from here.
 */
export function MemberDialog({
  member,
  myRole,
  myUserId,
  onClose,
  onHandOver,
}: {
  member: TeamMemberRow | null
  myRole: TeamRole
  myUserId: string
  onClose: () => void
  /** "Hand over all their tasks", for the site admin: this window closes first. */
  onHandOver?: (member: TeamMemberRow) => void
}) {
  const canRun = runsTheTeam(myRole)
  const isMe = member?.userId === myUserId

  return (
    <Dialog open={Boolean(member)} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent variant="admin" className="sm:max-w-lg">
        {member ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <PersonAvatar name={member.name} avatarUrl={member.avatarUrl} />
                {member.name}
                {isMe ? " (you)" : ""}
              </DialogTitle>
              <DialogDescription>
                {[member.title, member.invited ? "Hasn't set a password yet" : null, member.email]
                  .filter(Boolean)
                  .join(" · ")}
              </DialogDescription>
            </DialogHeader>
            <DialogBody>
              <TeammateWork key={member.userId} member={member} editTimeOff={canRun} />
              {canRun ? (
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>Job title</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <JobTitleField member={member} />
                  </CardContent>
                </Card>
              ) : null}
            </DialogBody>
            <DialogFooter>
              {canRun && onHandOver && !isMe ? (
                <Button
                  type="button"
                  variant="outline"
                  className="sm:mr-auto"
                  onClick={() => {
                    onClose()
                    onHandOver(member)
                  }}
                >
                  <ArrowRightLeftIcon className="size-4" />
                  Hand over all their tasks
                </Button>
              ) : null}
              <Button type="button" onClick={onClose}>
                Done
              </Button>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

type Loaded = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; page: Teammate }

/**
 * Their open tasks in shared projects I can see, soonest due first, each
 * opening on its project page; their time off, which the site admin can
 * change; and, for the site admin alone, their private things.
 */
function TeammateWork({ member, editTimeOff }: { member: TeamMemberRow; editTimeOff: boolean }) {
  const [loaded, setLoaded] = React.useState<Loaded>({ state: "loading" })
  const [tries, setTries] = React.useState(0)

  React.useEffect(() => {
    let live = true
    loadTeammatePage(member.userId).then(
      (page) => live && setLoaded({ state: "ready", page }),
      (error: unknown) => live && setLoaded({ state: "error", message: getProjectErrorMessage(error) })
    )
    return () => {
      live = false
    }
  }, [member.userId, tries])

  const retry = () => {
    setLoaded({ state: "loading" })
    setTries((count) => count + 1)
  }
  const tasks = loaded.state === "ready" ? loaded.page.openTasks : []

  return (
    <>
      <Card size="sm">
        <CardHeader>
          <CardTitle>Open tasks{loaded.state === "ready" ? ` (${tasks.length})` : ""}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          {loaded.state === "loading" ? (
            <LoadingRow label="Loading their tasks…" />
          ) : loaded.state === "error" ? (
            <ErrorRow message={loaded.message} onRetry={retry} />
          ) : tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing open in the projects you can see.</p>
          ) : (
            <ScrollArea viewportClassName="max-h-72">
              <ul className="grid gap-1.5 pr-3">
                {tasks.map((task) => (
                  <li key={task.id}>
                    <Link
                      to="/projects/$projectId"
                      params={{ projectId: task.projectId }}
                      search={{ task: task.id }}
                      className="flex min-w-0 items-center gap-3 rounded-md border p-2 text-sm hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <span className="grid min-w-0 flex-1">
                        <span className="truncate font-medium">{task.title}</span>
                        <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="truncate">{task.projectName}</span>
                          <span aria-hidden>·</span>
                          <DueDate dueDate={task.dueDate} dueAt={task.dueAt} status={task.status} className="shrink-0" />
                        </span>
                      </span>
                      <StatusBadge status={task.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
      <Card size="sm">
        <CardHeader>
          <CardTitle>Time off</CardTitle>
        </CardHeader>
        <CardContent>
          {editTimeOff ? (
            <TimeOffSection userId={member.userId} idPrefix="member-time-off" />
          ) : loaded.state !== "ready" ? null : loaded.page.timeOff.length === 0 ? (
            <p className="text-sm text-muted-foreground">No time off coming up.</p>
          ) : (
            <ul className="grid gap-1 text-sm">
              {loaded.page.timeOff.map((entry) => (
                <li key={entry.id}>{dayRangeLabel(entry.firstDay, entry.lastDay)}</li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      {loaded.state === "ready" && loaded.page.private ? <PrivateThings things={loaded.page.private} /> : null}
    </>
  )
}

/**
 * What only the person and the site admin see (Tyler, 16 Oct 2026: "Tyler
 * sees private things too"): their check-in record, this week's check-ins and
 * the notes they left at check-out.
 */
function PrivateThings({ things }: { things: NonNullable<Teammate["private"]> }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Private</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 text-sm">
        <p className="text-xs text-muted-foreground">Only they and you see this.</p>
        <p>
          {things.record.of
            ? `On time ${things.record.onTime} of the last ${things.record.of} work ${things.record.of === 1 ? "day" : "days"}`
            : "No work days saved yet"}
        </p>
        <WeekLines week={things.week} />
        <div className="grid gap-1">
          <span className="text-muted-foreground">Notes left at check-out</span>
          {things.notesLeft.length ? (
            <ul className="grid gap-1">
              {things.notesLeft.map((entry) => (
                <li key={entry.day} className="break-words">
                  <span className="text-muted-foreground">{dayLabel(entry.day)}: </span>
                  {entry.note}
                </li>
              ))}
            </ul>
          ) : (
            <span>None yet</span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

/** Their job title, beside their name everywhere. Saves when the field is left. */
function JobTitleField({ member }: { member: TeamMemberRow }) {
  const router = useRouter()
  const [title, setTitle] = useSyncedDraft(member.title ?? "")
  const [saveState, track] = useSaveLine()

  async function save() {
    const next = title.trim()
    if (next === (member.title ?? "")) return
    if (await track(() => saveMemberTitle({ userId: member.userId, title: next || null }))) {
      await router.invalidate()
    }
  }

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="member-title">Job title</Label>
        <SaveLine state={saveState} />
      </div>
      <Input
        id="member-title"
        value={title}
        maxLength={LIMITS.memberTitle}
        placeholder="Copywriter, Designer…"
        onChange={(event) => setTitle(event.target.value)}
        onBlur={() => void save()}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur()
        }}
      />
    </div>
  )
}
