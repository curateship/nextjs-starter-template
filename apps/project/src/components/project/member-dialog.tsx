import * as React from "react"
import { Link, useRouter } from "@tanstack/react-router"
import { ArrowRightLeftIcon, Loader2Icon } from "lucide-react"

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  changeTeamMemberRole,
  makeTeamOwner,
  type TeamMemberRow,
} from "@/lib/api/project/teams"
import { loadTeammatePage, saveMemberTitle, type Teammate } from "@/lib/api/project/team-running"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useSyncedDraft } from "@/lib/hooks/use-synced-draft"
import { dayRangeLabel } from "@/lib/project/days"
import { getProjectErrorMessage } from "@/lib/project/errors"
import {
  LIMITS,
  runsTheTeam,
  TEAM_INVITE_ROLES,
  TEAM_ROLE_LABEL,
  type TeamInviteRole,
  type TeamRole,
} from "@/lib/project/rules"
import { useSaveLine } from "@/lib/project/use-save-line"

/**
 * A teammate's page, opened from their name on the Team dashboard or the
 * Members page: what they have open in projects I can see, their time off,
 * job title and role. It shows only what the app shows elsewhere; their
 * check-in record stays theirs alone (Tyler, 13 Oct 2026). The owner and
 * admins also change the role, the job title and the time off here, and the
 * owner can hand the team over. A role saves the moment it is picked.
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
  /** "Hand over all their tasks", for the owner and admins: this window closes first. */
  onHandOver?: (member: TeamMemberRow) => void
}) {
  const router = useRouter()
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  const [confirmOwner, setConfirmOwner] = React.useState(false)
  const canRun = runsTheTeam(myRole)
  const isMe = member?.userId === myUserId

  function close() {
    setConfirmOwner(false)
    onClose()
  }

  async function setRole(role: TeamInviteRole) {
    if (!member || role === member.role) return
    const ok = await run(
      () => changeTeamMemberRole({ userId: member.userId, role }),
      `${member.name} is now ${role === "admin" ? "an admin" : "a member"}.`
    )
    if (ok) await router.invalidate()
  }

  async function handOver() {
    if (!member) return
    const ok = await run(() => makeTeamOwner(member.userId), `${member.name} is now the owner.`)
    if (ok) {
      close()
      await router.invalidate()
    }
  }

  return (
    <Dialog open={Boolean(member)} onOpenChange={(open) => (open ? null : close())}>
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
                {[member.title, TEAM_ROLE_LABEL[member.role], member.email].filter(Boolean).join(" · ")}
              </DialogDescription>
            </DialogHeader>
            <DialogBody>
              <TeammateWork key={member.userId} member={member} editTimeOff={canRun} />
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Role</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  {canRun ? (
                    <div className="grid gap-2">
                      <Label htmlFor="member-role">Role</Label>
                      <Select
                        value={member.role}
                        onValueChange={(value) => void setRole(value as TeamInviteRole)}
                        disabled={busy || member.role === "owner" || isMe}
                      >
                        <SelectTrigger id="member-role" className="w-full sm:w-fit">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {member.role === "owner" ? (
                            <SelectItem value="owner">{TEAM_ROLE_LABEL.owner}</SelectItem>
                          ) : null}
                          {TEAM_INVITE_ROLES.map((role) => (
                            <SelectItem key={role} value={role}>
                              {TEAM_ROLE_LABEL[role]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        Admins can invite and remove people and change the team's settings.
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm">
                      {TEAM_ROLE_LABEL[member.role]}
                      {member.title ? ` · ${member.title}` : ""}
                    </p>
                  )}
                  {canRun ? <JobTitleField member={member} /> : null}
                </CardContent>
              </Card>
              {myRole === "owner" && member.role !== "owner" ? (
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>Ownership</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    <p className="text-sm text-muted-foreground">
                      The owner can hand the team to someone else. You'll become an admin.
                    </p>
                    {confirmOwner ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm">Make {member.name} the owner?</span>
                        <Button type="button" variant="outline" onClick={() => setConfirmOwner(false)}>
                          Cancel
                        </Button>
                        <Button type="button" disabled={busy} onClick={() => void handOver()}>
                          {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
                          Make owner
                        </Button>
                      </div>
                    ) : (
                      <div>
                        <Button type="button" variant="outline" onClick={() => setConfirmOwner(true)}>
                          Make {member.name} the owner
                        </Button>
                      </div>
                    )}
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
                    close()
                    onHandOver(member)
                  }}
                >
                  <ArrowRightLeftIcon className="size-4" />
                  Hand over all their tasks
                </Button>
              ) : null}
              <Button type="button" onClick={close}>
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
 * opening on its project page; and their time off, which the owner and
 * admins can change.
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
    </>
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
