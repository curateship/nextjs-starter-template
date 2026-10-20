import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { Loader2Icon, Trash2Icon } from "lucide-react"

import { ProjectColorSelect } from "@/components/project/project-form-fields"
import { PersonAvatar } from "@/components/project/task-bits"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
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
import { FormDialog } from "@/components/ui/form-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { changeMeeting, makeMeeting, removeMeeting, type Meeting } from "@/lib/api/project/meetings"
import type { TeamMemberRow } from "@/lib/api/project/teams"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { dateFromKey, keyFromDate } from "@/lib/project/dates"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { MEETING_REPEAT_LABEL } from "@/lib/project/meetings"
import { LIMITS, MEETING_REPEATS, type MeetingRepeat, type ProjectColor } from "@/lib/project/rules"
import { showErrorToast } from "@/lib/toast/error-toast"
import { useTeamId } from "@/lib/project/team-scope"

type Draft = {
  title: string
  color: ProjectColor
  day: string | null
  startTime: string
  endTime: string
  repeat: MeetingRepeat | "none"
  videoUrl: string
  peopleIds: string[]
}

type Field = "title" | "day" | "endTime" | "videoUrl"

function draftOf(meeting: Meeting | null, fresh: { day: string; color: ProjectColor; myUserId: string }): Draft {
  if (meeting) {
    return {
      title: meeting.title,
      color: meeting.color,
      day: meeting.day,
      startTime: meeting.startTime,
      endTime: meeting.endTime,
      repeat: meeting.repeatEvery ?? "none",
      videoUrl: meeting.videoUrl ?? "",
      peopleIds: meeting.people.map((person) => person.id),
    }
  }
  return {
    title: "",
    color: fresh.color,
    day: fresh.day,
    startTime: "10:00",
    endTime: "10:30",
    repeat: "none",
    videoUrl: "",
    peopleIds: [fresh.myUserId],
  }
}

/** What is wrong with the draft, field by field, in the order the window lists them. */
function problemsOf(draft: Draft): [Field, string][] {
  const problems: [Field, string][] = []
  if (!draft.title.trim()) problems.push(["title", "Give the meeting a name."])
  if (!draft.day) problems.push(["day", "Pick the meeting's day."])
  if (draft.endTime <= draft.startTime) problems.push(["endTime", "The meeting has to end after it starts."])
  const link = draft.videoUrl.trim()
  if (link && !/^https:\/\/\S+$/i.test(link)) {
    problems.push(["videoUrl", "The video link must start with https://."])
  }
  return problems
}

/**
 * The New meeting window, and the same window to change or delete one. Times
 * are typed in the meeting's own zone, the team's for a new one, and the
 * window says which.
 */
export function MeetingDialog({
  open,
  meeting,
  day,
  color,
  members,
  myUserId,
  teamZone,
  onClose,
}: {
  open: boolean
  /** Null for a new meeting. */
  meeting: Meeting | null
  /** The day a new meeting starts on: the one chosen on the calendar. */
  day: string
  /** A new meeting's colour: the first the team isn't using yet. */
  color: ProjectColor
  members: TeamMemberRow[]
  myUserId: string
  teamZone: string
  onClose: () => void
}) {
  const teamId = useTeamId()
  const router = useRouter()
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  const [draft, setDraft] = React.useState(() => draftOf(meeting, { day, color, myUserId }))
  const [invalid, setInvalid] = React.useState<Set<Field>>(() => new Set())
  const [deleting, setDeleting] = React.useState(false)

  // Each opening starts from the meeting as saved, or a clean new one.
  const [openedFor, setOpenedFor] = React.useState<string | null>(null)
  const key = open ? (meeting?.id ?? `new:${day}`) : null
  if (openedFor !== key) {
    setOpenedFor(key)
    if (key) {
      setDraft(draftOf(meeting, { day, color, myUserId }))
      setInvalid(new Set())
    }
  }

  const initial = React.useMemo(() => draftOf(meeting, { day, color, myUserId }), [meeting, day, color, myUserId])
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial)
  const zone = (meeting?.timeZone ?? teamZone).replaceAll("_", " ")
  const zoneIsTeams = !meeting || meeting.timeZone === teamZone

  function change(patch: Partial<Draft>, cleared?: Field) {
    setDraft((current) => ({ ...current, ...patch }))
    if (cleared && invalid.has(cleared)) {
      setInvalid((current) => {
        const next = new Set(current)
        next.delete(cleared)
        return next
      })
    }
  }

  function togglePerson(userId: string, on: boolean) {
    setDraft((current) => ({
      ...current,
      peopleIds: on
        ? [...current.peopleIds, userId]
        : current.peopleIds.filter((id) => id !== userId),
    }))
  }

  async function save() {
    const problems = problemsOf(draft)
    if (problems.length) {
      setInvalid(new Set(problems.map(([field]) => field)))
      showErrorToast(problems[0][1])
      return
    }
    const input = {
      title: draft.title.trim(),
      color: draft.color,
      day: draft.day as string,
      startTime: draft.startTime,
      endTime: draft.endTime,
      repeatEvery: draft.repeat === "none" ? null : draft.repeat,
      videoUrl: draft.videoUrl.trim(),
      peopleIds: draft.peopleIds,
    }
    const ok = await run(
      () => (meeting ? changeMeeting({ meetingId: meeting.id, meeting: input }, teamId) : makeMeeting(input, teamId)),
      meeting ? "Meeting saved." : "Meeting created."
    )
    if (!ok) return
    await router.invalidate()
    onClose()
  }

  return (
    <FormDialog open={open} dirty={dirty} busy={busy} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin" className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{meeting ? meeting.title : "New meeting"}</DialogTitle>
            <DialogDescription>
              Everyone on the team sees it on the Team dashboard. People you add hear about it in
              the bell.
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
                  <CardTitle>Meeting</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="meeting-title">Name</Label>
                    <Input
                      id="meeting-title"
                      value={draft.title}
                      maxLength={LIMITS.meetingTitle}
                      placeholder="Weekly planning"
                      aria-invalid={invalid.has("title") || undefined}
                      onChange={(event) => change({ title: event.target.value }, "title")}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="meeting-color">Colour</Label>
                    <ProjectColorSelect
                      id="meeting-color"
                      value={draft.color}
                      onChange={(next) => change({ color: next })}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card size="sm">
                <CardHeader>
                  <CardTitle>When</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor="meeting-day">Day</Label>
                      <DatePicker
                        id="meeting-day"
                        value={dateFromKey(draft.day)}
                        onChange={(date) => change({ day: keyFromDate(date) }, "day")}
                        placeholder="Pick a day"
                        aria-invalid={invalid.has("day")}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="meeting-repeat">Repeats</Label>
                      <Select
                        value={draft.repeat}
                        onValueChange={(next) => change({ repeat: next as Draft["repeat"] })}
                      >
                        <SelectTrigger id="meeting-repeat" className="w-full sm:w-fit">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(["none", ...MEETING_REPEATS] as const).map((repeat) => (
                            <SelectItem key={repeat} value={repeat}>
                              {MEETING_REPEAT_LABEL[repeat]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-2">
                      <Label htmlFor="meeting-start">Starts</Label>
                      <Input
                        id="meeting-start"
                        type="time"
                        value={draft.startTime}
                        onChange={(event) => change({ startTime: event.target.value }, "endTime")}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="meeting-end">Ends</Label>
                      <Input
                        id="meeting-end"
                        type="time"
                        value={draft.endTime}
                        aria-invalid={invalid.has("endTime") || undefined}
                        onChange={(event) => change({ endTime: event.target.value }, "endTime")}
                      />
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Times are in {zone}
                    {zoneIsTeams ? ", the team's time zone" : ", where the meeting was set"}. Anyone
                    in another zone sees them in their own time.
                  </p>
                </CardContent>
              </Card>

              <Card size="sm">
                <CardHeader>
                  <CardTitle>People · {draft.peopleIds.length}</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="grid gap-3">
                    {members.map((member) => {
                      const boxId = `meeting-person-${member.userId}`
                      return (
                        <li key={member.userId} className="flex items-center gap-3">
                          <Checkbox
                            id={boxId}
                            checked={draft.peopleIds.includes(member.userId)}
                            onCheckedChange={(value) => togglePerson(member.userId, value === true)}
                          />
                          <Label htmlFor={boxId} className="flex min-w-0 flex-1 items-center gap-3 font-normal">
                            <span aria-hidden className="contents">
                              <PersonAvatar name={member.name} avatarUrl={member.avatarUrl} />
                            </span>
                            <span className="truncate">
                              {member.name}
                              {member.userId === myUserId ? " (you)" : ""}
                            </span>
                          </Label>
                        </li>
                      )
                    })}
                  </ul>
                </CardContent>
              </Card>

              <Card size="sm">
                <CardHeader>
                  <CardTitle>Video link</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-2">
                  <Label htmlFor="meeting-video">Link to join</Label>
                  <Input
                    id="meeting-video"
                    type="url"
                    inputMode="url"
                    value={draft.videoUrl}
                    maxLength={LIMITS.videoUrl}
                    placeholder="https://meet.google.com/abc-defg-hij"
                    aria-invalid={invalid.has("videoUrl") || undefined}
                    onChange={(event) => change({ videoUrl: event.target.value }, "videoUrl")}
                  />
                </CardContent>
              </Card>
            </DialogBody>
            <DialogFooter>
              {meeting ? (
                <Button
                  type="button"
                  variant="destructive"
                  className="mr-auto"
                  disabled={busy}
                  onClick={() => setDeleting(true)}
                >
                  <Trash2Icon className="size-4" />
                  Delete
                </Button>
              ) : null}
              <Button type="button" variant="outline" onClick={requestClose} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2Icon className="size-4 animate-spin" /> : null}
                {meeting ? "Save changes" : "Create meeting"}
              </Button>
            </DialogFooter>
          </form>
          {meeting ? (
            <ConfirmDialog
              open={deleting}
              onOpenChange={setDeleting}
              title={`Delete "${meeting.title}"?`}
              description={
                meeting.repeatEvery
                  ? "Every repeat goes with it, past and future. This can't be undone."
                  : "This can't be undone."
              }
              confirmLabel="Delete meeting"
              destructive
              loading={busy}
              onConfirm={async () => {
                const ok = await run(() => removeMeeting(meeting.id, teamId), "Meeting deleted.")
                if (!ok) return
                setDeleting(false)
                await router.invalidate()
                onClose()
              }}
            />
          ) : null}
        </DialogContent>
      )}
    </FormDialog>
  )
}
