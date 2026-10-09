import * as React from "react"
import { Link, useSearch } from "@tanstack/react-router"
import {
  EyeOffIcon,
  FlameIcon,
  Loader2Icon,
  PlusIcon,
  SettingsIcon,
  ShieldAlertIcon,
  Trash2Icon,
  TriangleAlertIcon,
  UserMinusIcon,
  UserRoundIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DatePicker } from "@/components/ui/date-picker"
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
import { Textarea } from "@/components/ui/textarea"
import { MadeUpMark, useIsMadeUp, useMemberWindowLink } from "@/components/pomodoro/admin-member-name"
import { useSafetyActions } from "@/components/pomodoro/admin-safety-dialogs"
import {
  addPomodoroMemberNote,
  deletePomodoroMemberNote,
  editPomodoroMemberNote,
  fixPomodoroStreakDay,
  getMemberWindowErrorMessage,
  hidePomodoroProfiles,
  loadPomodoroMemberWindow,
  removePomodoroFollowsBy,
  type MemberWindow,
} from "@/lib/api/pomodoro/admin-members"
import { formatLongDay, formatShortDay } from "@/lib/format/calendar-day"
import { formatFileSize } from "@/lib/format/format-bytes"
import { formatDate, formatDateTime, formatDuration } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * The member window (admin task 06): one window over any Pomoder admin page
 * that answers "what is going on with this person". It opens from a member's
 * name with `?member=<userId>` in the address, loads its own data so it is
 * the same wherever it opens, and every section links to its full list
 * filtered to them. See `workspace/docs/admin-members.md`.
 */
export function AdminMemberWindow() {
  const search = useSearch({ strict: false }) as { member?: string }
  const memberId = search.member ?? null
  const setMember = useMemberWindowLink()
  // Remounts per person, so nothing from the last one lingers.
  return <MemberDialog key={memberId ?? "closed"} userId={memberId} onClose={() => setMember(undefined)} />
}

function MemberDialog({ userId, onClose }: { userId: string | null; onClose: () => void }) {
  const [data, setData] = React.useState<MemberWindow | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [attempt, setAttempt] = React.useState(0)
  // The notes' typed text lives here, so closing the window can ask first.
  const [draft, setDraft] = React.useState("")
  const [editing, setEditing] = React.useState<{ id: string; body: string } | null>(null)
  const editingNote = editing ? data?.notes.find((note) => note.id === editing.id) : null
  const noteDirty = draft.trim() !== "" || (editing !== null && editing.body !== editingNote?.body)
  const madeUp = useIsMadeUp(userId)

  const reload = React.useCallback(async () => {
    if (!userId) return
    try {
      setData(await loadPomodoroMemberWindow(userId))
      setError(null)
    } catch (loadError) {
      setError(getMemberWindowErrorMessage(loadError))
    }
  }, [userId])

  React.useEffect(() => {
    if (!userId) return
    let live = true
    loadPomodoroMemberWindow(userId)
      .then((result) => {
        if (live) {
          setData(result)
          setError(null)
        }
      })
      .catch((loadError) => {
        if (live) setError(getMemberWindowErrorMessage(loadError))
      })
    return () => {
      live = false
    }
  }, [userId, attempt])

  const safety = useSafetyActions(reload)
  const [fixing, setFixing] = React.useState(false)
  const [confirm, setConfirm] = React.useState<"hide" | "follows" | null>(null)
  const [working, setWorking] = React.useState(false)
  const person = data?.person

  const runConfirmed = async () => {
    if (!person || !confirm) return
    setWorking(true)
    try {
      if (confirm === "hide") {
        await hidePomodoroProfiles([person.id])
        toast.success(`${person.name}'s public profile is hidden. They were told in the bell.`)
      } else {
        const { removed } = await removePomodoroFollowsBy(person.id)
        toast.success(`${removed} ${plural(removed, "follow", "follows")} removed.`)
      }
      setConfirm(null)
      await reload()
    } catch (actionError) {
      showErrorToast(getMemberWindowErrorMessage(actionError))
    } finally {
      setWorking(false)
    }
  }

  return (
    <>
      <FormDialog open={Boolean(userId)} dirty={noteDirty} busy={false} onClose={onClose}>
        {(requestClose) => (
          <DialogContent variant="admin" className="h-[48rem] sm:max-w-2xl">
            <DialogHeader>
              <div className="flex min-w-0 items-center gap-3">
                <Avatar className="size-10">
                  {person?.avatarUrl ? <AvatarImage src={person.avatarUrl} alt="" /> : null}
                  <AvatarFallback>
                    <UserRoundIcon className="size-5" />
                  </AvatarFallback>
                </Avatar>
                <div className="grid min-w-0 gap-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <DialogTitle className="truncate">{person?.name ?? "Member"}</DialogTitle>
                    {madeUp ? <MadeUpMark /> : null}
                  </div>
                  <DialogDescription className="truncate">
                    {person
                      ? [person.handle ? `@${person.handle}` : null, person.email].filter(Boolean).join(" · ")
                      : "Everything about one member."}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
            <DialogBody>
              {error ? (
                <ErrorRow
                  message={error}
                  onRetry={() => {
                    setError(null)
                    setAttempt((count) => count + 1)
                  }}
                />
              ) : !data ? (
                <LoadingRow label="Loading…" className="min-h-96" />
              ) : (
                <MemberSections
                  data={data}
                  onWarn={() => safety.warn({ id: data.person.id, name: data.person.name })}
                  onSuspend={() => safety.suspend({ id: data.person.id, name: data.person.name })}
                  onHide={() => setConfirm("hide")}
                  onFix={() => setFixing(true)}
                  onRemoveFollows={() => setConfirm("follows")}
                  notes={{ draft, setDraft, editing, setEditing, onChanged: reload }}
                />
              )}
            </DialogBody>
            <DialogFooter>
              <Button type="button" onClick={requestClose}>
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </FormDialog>
      {safety.dialogs}
      {data ? (
        <FixStreakDialog
          open={fixing}
          data={data}
          onClose={() => setFixing(false)}
          onDone={reload}
        />
      ) : null}
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null)
        }}
        title={confirm === "hide" ? `Hide ${person?.name}'s public profile?` : `Remove every follow ${person?.name} made?`}
        description={
          confirm === "hide"
            ? "Their page answers like an unknown address, and they are told in the bell. Show it again any time from Bans."
            : `They stop following ${data?.followingCount ?? 0} ${plural(data?.followingCount ?? 0, "person", "people")}. Nobody is told, the same as an unfollow. This cannot be undone.`
        }
        confirmLabel={confirm === "hide" ? "Hide profile" : "Remove follows"}
        loading={working}
        onConfirm={() => void runConfirmed()}
      />
    </>
  )
}

/** The window's body, in the order a support question asks it. */
function MemberSections({
  data,
  onWarn,
  onSuspend,
  onHide,
  onFix,
  onRemoveFollows,
  notes,
}: {
  data: MemberWindow
  onWarn: () => void
  onSuspend: () => void
  onHide: () => void
  onFix: () => void
  onRemoveFollows: () => void
  notes: NotesState
}) {
  const { person, totals } = data
  const running = data.suspensions.find((row) => row.running)

  return (
    <div className="grid min-w-0 gap-[var(--shell-modal-padding,1.5rem)]">
      <Card size="sm">
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-2">
            <DetailRow label="Plan" value={person.planName} />
            <DetailRow label="Joined" value={formatDate(person.joinedAt)} />
            <DetailRow
              label="Last focused"
              value={totals.lastFocusedOn ? formatLongDay(totals.lastFocusedOn) : "Never"}
            />
            <DetailRow
              label="Public profile"
              value={
                person.profileHidden ? (
                  <Badge variant="destructive">Hidden by an admin</Badge>
                ) : person.handle && person.profilePublic ? (
                  "Public"
                ) : person.handle ? (
                  "Switched off"
                ) : (
                  "No handle yet"
                )
              }
            />
            <DetailRow
              label="Leaderboard"
              value={
                person.leaderboardHidden
                  ? "Taken off by an admin"
                  : person.leaderboardOptIn
                    ? "Shown"
                    : "Not opted in"
              }
            />
            {running ? (
              <DetailRow
                label="Rooms"
                value={<Badge variant="destructive">{running.endsAt ? `Suspended until ${formatDate(running.endsAt)}` : "Suspended until lifted"}</Badge>}
              />
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={onWarn}>
              <TriangleAlertIcon className="size-4" />
              Warn
            </Button>
            <Button type="button" variant="outline" onClick={onSuspend}>
              <ShieldAlertIcon className="size-4" />
              Suspend
            </Button>
            {person.handle && !person.profileHidden ? (
              <Button type="button" variant="outline" onClick={onHide}>
                <EyeOffIcon className="size-4" />
                Hide profile
              </Button>
            ) : null}
            <Button type="button" variant="outline" asChild>
              <Link to="/admin/users" search={{ open: person.id }}>
                Open in Users
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Focus</CardTitle>
          <CardDescription>All time, from their daily totals.</CardDescription>
          <CardAction>
            <Button type="button" variant="outline" size="sm" onClick={onFix}>
              <FlameIcon className="size-4" />
              Fix a streak day
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-2">
          <DetailRow label="Focus sessions" value={totals.focusSessions.toLocaleString()} />
          <DetailRow label="Focus time" value={formatDuration(totals.focusSeconds * 1000, { zero: "0m" })} />
          <DetailRow label="Tasks done" value={totals.tasksCompleted.toLocaleString()} />
          <DetailRow
            label="Streak"
            value={`${totals.currentStreak} ${plural(totals.currentStreak, "day", "days")} now, best ${totals.bestStreak}`}
          />
          {data.fixes.length ? (
            <DetailRow
              label="Days put back"
              value={data.fixes.map((fix) => formatShortDay(fix.localDate)).join(", ")}
            />
          ) : null}
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Last 10 sessions</CardTitle>
          <CardAction>
            <SeeAll to="/admin/pomodoro-sessions" search={{ user: person.id }} />
          </CardAction>
        </CardHeader>
        <CardContent>
          <ShortList
            empty="No sessions yet."
            rows={data.recentSessions.map((row) => ({
              id: row.id,
              main: `${MODE_LABEL[row.mode] ?? row.mode} · ${formatDuration(row.accumulatedSeconds * 1000, { zero: "0m" })}${row.roomName ? ` · ${row.roomName}` : ""}`,
              meta: `${STATUS_LABEL[row.status] ?? row.status} · ${formatDateTime(row.createdAt)}`,
            }))}
          />
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Open tasks</CardTitle>
          <CardDescription>{countLine(data.openTasks.total, "open task", "open tasks")}</CardDescription>
          <CardAction>
            <SeeAll to="/admin/pomodoro-tasks" search={{ user: person.id }} />
          </CardAction>
        </CardHeader>
        <CardContent>
          <ShortList
            empty="None open."
            rows={data.openTasks.rows.map((row) => ({
              id: row.id,
              main: row.title,
              meta: formatLongDay(row.plannedDate),
            }))}
          />
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Rooms</CardTitle>
          <CardDescription>
            Hosted {data.hosted.total.toLocaleString()}, joined {data.joined.total.toLocaleString()} hosted by others.
          </CardDescription>
          <CardAction>
            <SeeAll to="/admin/pomodoro-rooms" search={{ q: person.email }} label="Rooms they host" />
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-4">
          <ShortList
            empty="Has not hosted a room."
            rows={data.hosted.rows.map((row) => ({ id: row.id, main: row.name, meta: `Hosted · ${formatDate(row.at)}` }))}
          />
          {data.joined.rows.length ? (
            <ShortList
              empty=""
              rows={data.joined.rows.map((row) => ({ id: row.id, main: row.name, meta: `Joined · ${formatDate(row.at)}` }))}
            />
          ) : null}
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Reports</CardTitle>
          <CardAction>
            <SeeAll to="/admin/pomodoro-reports" search={{ person: person.id }} />
          </CardAction>
        </CardHeader>
        <CardContent className="grid gap-2">
          <DetailRow
            label="About them"
            value={`${data.reports.about.toLocaleString()}${data.reports.aboutWaiting ? `, ${data.reports.aboutWaiting} waiting` : ""}`}
          />
          <DetailRow
            label="Filed by them"
            value={`${data.reports.by.toLocaleString()}${data.reports.byDismissed ? `, ${data.reports.byDismissed} dismissed` : ""}`}
          />
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Uploads</CardTitle>
          <CardDescription>
            {countLine(data.uploads.total, "file", "files")}
            {data.uploads.total ? `, ${formatFileSize(data.uploads.bytes)}` : ""}
          </CardDescription>
          <CardAction>
            <SeeAll to="/admin/pomodoro-uploads" search={{ user: person.id }} />
          </CardAction>
        </CardHeader>
        <CardContent>
          <ShortList
            empty="No uploads."
            rows={data.uploads.rows.map((row) => ({
              id: row.mediaId,
              main: row.name,
              meta: `${row.purpose === "sound" ? "Sound" : "Background"} · ${formatFileSize(row.bytes)} · ${formatDate(row.createdAt)}`,
            }))}
          />
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Warnings and suspensions</CardTitle>
          <CardAction>
            <SeeAll to="/admin/pomodoro-bans" search={{ tab: "suspensions", q: person.email }} label="Bans" />
          </CardAction>
        </CardHeader>
        <CardContent>
          <ShortList
            empty="None."
            rows={[
              ...data.warnings.map((row) => ({
                id: row.id,
                at: new Date(row.createdAt).getTime(),
                main: row.message,
                meta: `Warning · ${formatDateTime(row.createdAt)}`,
              })),
              ...data.suspensions.map((row) => ({
                id: row.id,
                at: new Date(row.createdAt).getTime(),
                main: row.reason,
                meta: `Suspension · ${formatDateTime(row.createdAt)} · ${
                  row.running
                    ? row.endsAt
                      ? `until ${formatDate(row.endsAt)}`
                      : "until lifted"
                    : row.liftedAt
                      ? "lifted"
                      : "ended"
                }`,
              })),
            ].sort((left, right) => right.at - left.at)}
          />
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Follows</CardTitle>
          <CardDescription>Follows {countLine(data.followingCount, "person", "people")}.</CardDescription>
          <CardAction className="flex gap-2">
            <SeeAll to="/admin/pomodoro-follows" search={{ user: person.id }} />
          </CardAction>
        </CardHeader>
        {data.followingCount ? (
          <CardContent>
            <Button type="button" variant="outline" onClick={onRemoveFollows}>
              <UserMinusIcon className="size-4" />
              Remove all their follows
            </Button>
          </CardContent>
        ) : null}
      </Card>

      <NotesCard userId={person.id} notes={data.notes} state={notes} />
    </div>
  )
}

const MODE_LABEL: Record<string, string> = { focus: "Focus", short: "Short break", long: "Long break" }
const STATUS_LABEL: Record<string, string> = {
  running: "Running",
  paused: "Paused",
  completed: "Finished",
  cancelled: "Cancelled",
}

function countLine(count: number, one: string, many: string) {
  return `${count.toLocaleString()} ${plural(count, one, many)}`
}

export function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right text-sm font-medium">{value}</span>
    </div>
  )
}

/** A section's short list: one line each, newest first. */
export function ShortList({ rows, empty }: { rows: { id: string; main: string; meta: string }[]; empty: string }) {
  if (!rows.length) return empty ? <p className="text-sm text-muted-foreground">{empty}</p> : null
  return (
    <ul className="grid gap-2">
      {rows.map((row) => (
        <li key={row.id} className="grid min-w-0 gap-0.5">
          <span className="truncate text-sm" title={row.main}>
            {row.main}
          </span>
          <span className="truncate text-xs text-muted-foreground">{row.meta}</span>
        </li>
      ))}
    </ul>
  )
}

/** The way from a section to its full list, filtered to this person. */
export function SeeAll({
  to,
  search,
  label = "See all",
}: {
  to: React.ComponentProps<typeof Link>["to"]
  search: Record<string, string>
  label?: string
}) {
  return (
    <Button type="button" variant="ghost" size="sm" asChild>
      <Link to={to} search={search as never}>
        {label}
      </Link>
    </Button>
  )
}

// ---------------------------------------------------------------------------
// Fix a streak day
// ---------------------------------------------------------------------------

function FixStreakDialog({
  open,
  data,
  onClose,
  onDone,
}: {
  open: boolean
  data: MemberWindow
  onClose: () => void
  onDone: () => Promise<void>
}) {
  const [day, setDay] = React.useState<Date | undefined>(undefined)
  const [reason, setReason] = React.useState("")
  const [invalid, setInvalid] = React.useState<"day" | "reason" | null>(null)
  const [saving, setSaving] = React.useState(false)
  const [shownFor, setShownFor] = React.useState(false)
  const dayId = React.useId()
  const reasonId = React.useId()
  // Opening starts fresh.
  if (open !== shownFor) {
    setShownFor(open)
    if (open) {
      setDay(undefined)
      setReason("")
      setInvalid(null)
    }
  }
  const localDate = day ? toLocalDate(day) : null

  const save = async () => {
    if (!localDate) {
      setInvalid("day")
      showErrorToast("Pick the day to put back.")
      return
    }
    if (!reason.trim()) {
      setInvalid("reason")
      showErrorToast("Say why. It goes in the record of who changed what.")
      return
    }
    setSaving(true)
    try {
      await fixPomodoroStreakDay(data.person.id, localDate, reason.trim())
      toast.success(`${formatShortDay(localDate)} is back in ${data.person.name}'s streak. They were told in the bell.`)
      await onDone()
      onClose()
    } catch (error) {
      showErrorToast(getMemberWindowErrorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <FormDialog open={open} dirty={Boolean(day) || reason.trim() !== ""} busy={saving} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>Fix a streak day for {data.person.name}</DialogTitle>
            <DialogDescription>
              The day counts for their streak only. Their hours, the leaderboard and their badges do not change. They get a notice: "We restored {localDate ? formatShortDay(localDate) : "that day"} to your streak."
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault()
              void save()
            }}
          >
            <DialogBody>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Day</CardTitle>
                  <CardDescription>
                    Their own calendar day, in {data.person.timezone}. Today there is {formatLongDay(data.today)}.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-2">
                    <FieldLabel htmlFor={dayId}>Day to put back</FieldLabel>
                    <DatePicker
                      id={dayId}
                      value={day}
                      onChange={(next) => {
                        setInvalid(null)
                        setDay(next)
                      }}
                      placeholder="Pick a day"
                      className={invalid === "day" ? "border-destructive sm:w-56" : "sm:w-56"}
                    />
                  </div>
                  <div className="grid gap-2">
                    <FieldLabel htmlFor={reasonId}>Reason</FieldLabel>
                    <Input
                      id={reasonId}
                      maxLength={200}
                      value={reason}
                      placeholder={`Outage, ${localDate ? formatShortDay(localDate) : "3 Oct"}`}
                      aria-invalid={invalid === "reason" || undefined}
                      onChange={(event) => {
                        setInvalid(null)
                        setReason(event.target.value)
                      }}
                    />
                  </div>
                </CardContent>
              </Card>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={requestClose} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
                Put the day back
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}

/** The picked calendar day as `YYYY-MM-DD`, read off the picker's own date. */
function toLocalDate(day: Date) {
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`
}

// ---------------------------------------------------------------------------
// Private admin notes
// ---------------------------------------------------------------------------

type NotesState = {
  draft: string
  setDraft: (draft: string) => void
  editing: { id: string; body: string } | null
  setEditing: (editing: { id: string; body: string } | null) => void
  onChanged: () => Promise<void>
}

function NotesCard({
  userId,
  notes,
  state: { draft, setDraft, editing, setEditing, onChanged },
}: {
  userId: string
  notes: MemberWindow["notes"]
  state: NotesState
}) {
  const [deleting, setDeleting] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)
  const draftId = React.useId()
  const editId = React.useId()

  const run = async (work: () => Promise<unknown>, done: string, after: () => void) => {
    setBusy(true)
    try {
      await work()
      toast.success(done)
      after()
      await onChanged()
    } catch (error) {
      showErrorToast(getMemberWindowErrorMessage(error))
      await onChanged()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Admin notes</CardTitle>
        <CardDescription>Only admins see these. Every change is logged.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <form
          className="grid gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (!draft.trim()) {
              showErrorToast("Write the note first.")
              return
            }
            void run(() => addPomodoroMemberNote(userId, draft.trim()), "Note added.", () => setDraft(""))
          }}
        >
          <FieldLabel htmlFor={draftId}>New note</FieldLabel>
          <Textarea id={draftId} rows={1} maxLength={2000} value={draft} onChange={(event) => setDraft(event.target.value)} />
          <div>
            <Button type="submit" variant="outline" disabled={busy}>
              <PlusIcon className="size-4" />
              Add note
            </Button>
          </div>
        </form>
        {notes.length ? (
          <ul className="grid gap-4">
            {notes.map((note) => (
              <li key={note.id} className="grid min-w-0 gap-1">
                {editing?.id === note.id ? (
                  <form
                    className="grid gap-2"
                    onSubmit={(event) => {
                      event.preventDefault()
                      if (!editing.body.trim()) {
                        showErrorToast("A note cannot be empty. Delete it instead.")
                        return
                      }
                      void run(() => editPomodoroMemberNote(note.id, editing.body.trim()), "Note saved.", () => setEditing(null))
                    }}
                  >
                    <FieldLabel htmlFor={editId} className="sr-only">
                      Edit note
                    </FieldLabel>
                    <Textarea
                      id={editId}
                      rows={1}
                      maxLength={2000}
                      value={editing.body}
                      onChange={(event) => setEditing({ id: note.id, body: event.target.value })}
                    />
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" onClick={() => setEditing(null)} disabled={busy}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={busy}>
                        Save changes
                      </Button>
                    </div>
                  </form>
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 text-sm break-words whitespace-pre-wrap">{note.body}</p>
                    <div className="flex shrink-0">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Edit note"
                        disabled={busy}
                        onClick={() => setEditing({ id: note.id, body: note.body })}
                      >
                        <SettingsIcon className="size-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Delete note"
                        disabled={busy}
                        onClick={() => setDeleting(note.id)}
                      >
                        <Trash2Icon className="size-4" />
                      </Button>
                    </div>
                  </div>
                )}
                <span className="text-xs text-muted-foreground">
                  {note.writtenBy ?? "A former admin"} · {formatDateTime(note.createdAt)}
                  {note.updatedAt ? ` · edited by ${note.updatedBy ?? "a former admin"} ${formatDateTime(note.updatedAt)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No notes yet.</p>
        )}
      </CardContent>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null)
        }}
        title="Delete this note?"
        description="Every admin loses it. The record of who deleted it stays. This cannot be undone."
        confirmLabel="Delete note"
        loading={busy}
        onConfirm={() => {
          const id = deleting
          if (id) void run(() => deletePomodoroMemberNote(id), "Note deleted.", () => setDeleting(null))
        }}
      />
    </Card>
  )
}
