import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import {
  CalendarPlusIcon,
  CheckIcon,
  ExternalLinkIcon,
  ListTodoIcon,
  Loader2Icon,
  SettingsIcon,
  XIcon,
} from "lucide-react"

import { WrittenPageBody } from "@/components/pages/written-page-body"
import { PersonAvatar } from "@/components/project/task-bits"
import { TaskNotesField } from "@/components/project/task-notes"
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
import { Label } from "@/components/ui/label"
import { LoadingRow } from "@/components/ui/loading-row"
import {
  answerTheMeeting,
  loadNotesOfMeeting,
  saveNotesOfMeeting,
  type Meeting,
  type MeetingNotes,
  type MeetingOccurrence,
} from "@/lib/api/project/meetings"
import { formatDateTime, formatTimeAgo } from "@/lib/format/format-time"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import type { WrittenPageNode } from "@/lib/pages/written-page-body"
import { localNow, shortDayLabel } from "@/lib/project/days"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { calendarFileName, meetingCalendarFile } from "@/lib/project/meeting-calendar-file"
import { lineKey, noteLines, type NoteLine } from "@/lib/project/meeting-notes"
import { repeatWords, timeRangeLabel } from "@/lib/project/meetings"
import { readTaskNotes } from "@/lib/project/notes"
import type { MeetingAnswer } from "@/lib/project/rules"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/** A line of one date's notes, picked to become a task. */
export type NoteLineToMake = { meetingId: string; day: string; path: number[]; text: string }

/**
 * One date of a meeting, opened from its row under the Team dashboard's
 * calendar: when it is and the way in, Add to my calendar, who's coming with
 * my own Going or Not going, and that date's notes, whose lines can become
 * tasks. Everyone on the team opens it. Only the people who may change the
 * meeting write its notes.
 */
export function MeetingWindow({
  open,
  meeting,
  occurrence,
  viewerZone,
  myUserId,
  onClose,
  onChange,
  onMakeTask,
}: {
  open: boolean
  meeting: Meeting
  occurrence: MeetingOccurrence
  viewerZone: string
  myUserId: string
  onClose: () => void
  /** Opens the window that changes the meeting, for those who may. */
  onChange: (meeting: Meeting) => void
  onMakeTask: (line: NoteLineToMake) => void
}) {
  // The notes belong to the date in the meeting's own calendar, which can be
  // a day away from the viewer's.
  const ownDay = localNow(new Date(occurrence.startsAt), meeting.timeZone).day
  const time = timeRangeLabel(occurrence.startsAt, occurrence.endsAt, viewerZone)
  const otherZone = viewerZone !== meeting.timeZone
  const repeats = repeatWords(meeting.day, meeting.repeatEvery)

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent variant="admin" className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="pr-8 break-words">{meeting.title}</DialogTitle>
          <DialogDescription>
            {shortDayLabel(occurrence.day)}, {time}
            {otherZone ? ` your time` : ""}
            {repeats ? `. ${repeats}` : ""}.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <WhenCard meeting={meeting} viewerZone={viewerZone} />
          <AnswersCard meeting={meeting} myUserId={myUserId} />
          <NotesCard
            meeting={meeting}
            day={ownDay}
            dayLabel={shortDayLabel(occurrence.day)}
            onMakeTask={onMakeTask}
          />
        </DialogBody>
        <DialogFooter>
          {meeting.canEdit ? (
            <Button type="button" variant="outline" className="mr-auto" onClick={() => onChange(meeting)}>
              <SettingsIcon className="size-4" />
              Change meeting
            </Button>
          ) : null}
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Downloads the meeting as a calendar file, made here in the browser. */
function downloadCalendarFile(meeting: Meeting) {
  const file = new Blob([meetingCalendarFile(meeting)], { type: "text/calendar;charset=utf-8" })
  const address = URL.createObjectURL(file)
  const link = document.createElement("a")
  link.href = address
  link.download = calendarFileName(meeting.title)
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(address)
}

function WhenCard({ meeting, viewerZone }: { meeting: Meeting; viewerZone: string }) {
  const zone = meeting.timeZone.replaceAll("_", " ")
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Joining</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="text-sm text-muted-foreground">
          {viewerZone !== meeting.timeZone
            ? `Times are your own, ${viewerZone.replaceAll("_", " ")}. The meeting is set in ${zone}.`
            : `Times are in ${zone}.`}{" "}
          {meeting.service ? `It happens on ${meeting.service}.` : "It has no video link."}
        </p>
        <div className="flex flex-wrap gap-2">
          {meeting.videoUrl ? (
            <Button asChild>
              <a href={meeting.videoUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLinkIcon className="size-4" />
                Join on {meeting.service ?? "the video link"}
              </a>
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={() => downloadCalendarFile(meeting)}>
            <CalendarPlusIcon className="size-4" />
            Add to my calendar
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Add to my calendar downloads a file that Google Calendar, Outlook and Apple Calendar
          open{meeting.repeatEvery ? ", with its repeats" : ""}. It's a copy: if the meeting
          changes here later, add it again.
        </p>
      </CardContent>
    </Card>
  )
}

const ANSWER_WORDS: Record<MeetingAnswer, string> = { going: "Going", not_going: "Not going" }

function AnswersCard({ meeting, myUserId }: { meeting: Meeting; myUserId: string }) {
  const router = useRouter()
  const [run] = useAsyncAction(getProjectErrorMessage)
  const [sending, setSending] = React.useState<MeetingAnswer | null>(null)
  const me = meeting.people.find((person) => person.id === myUserId)
  const going = meeting.people.filter((person) => person.answer === "going").length

  async function answer(next: MeetingAnswer) {
    if (sending || me?.answer === next) return
    setSending(next)
    const ok = await run(() => answerTheMeeting({ meetingId: meeting.id, answer: next }))
    if (ok) await router.invalidate()
    setSending(null)
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Who's coming{going ? ` · ${going} going` : ""}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {me ? (
          <div className="grid gap-2" role="group" aria-labelledby="meeting-my-answer">
            <Label id="meeting-my-answer" asChild>
              <span>Your answer</span>
            </Label>
            <div className="flex flex-wrap gap-2">
              {(["going", "not_going"] as const).map((option) => (
                <Button
                  key={option}
                  type="button"
                  variant={me.answer === option ? "default" : "outline"}
                  aria-pressed={me.answer === option}
                  disabled={sending !== null}
                  onClick={() => void answer(option)}
                >
                  {sending === option ? (
                    <Loader2Icon className="size-4 animate-spin" />
                  ) : option === "going" ? (
                    <CheckIcon className="size-4" />
                  ) : (
                    <XIcon className="size-4" />
                  )}
                  {ANSWER_WORDS[option]}
                </Button>
              ))}
            </div>
            {meeting.repeatEvery ? (
              <p className="text-sm text-muted-foreground">Your answer counts for every time it repeats.</p>
            ) : null}
          </div>
        ) : null}
        {meeting.people.length ? (
          <ul className="grid gap-2">
            {meeting.people.map((person) => (
              <li key={person.id} className="flex items-center gap-3 text-sm">
                <PersonAvatar name={person.name} avatarUrl={person.avatarUrl} />
                <span className="min-w-0 flex-1 truncate">
                  {person.name}
                  {person.id === myUserId ? " (you)" : ""}
                </span>
                <span
                  className={cn(
                    "shrink-0",
                    person.answer === "going" ? "text-foreground" : "text-muted-foreground"
                  )}
                >
                  {person.answer ? ANSWER_WORDS[person.answer] : "No answer yet"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nobody is invited yet.
            {meeting.canEdit ? " Add people with Change meeting." : ""}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

type NotesState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; notes: MeetingNotes }

function NotesCard({
  meeting,
  day,
  dayLabel,
  onMakeTask,
}: {
  meeting: Meeting
  /** The date in the meeting's own calendar. */
  day: string
  /** The same date as the viewer names it. */
  dayLabel: string
  onMakeTask: (line: NoteLineToMake) => void
}) {
  const [state, setState] = React.useState<NotesState>({ kind: "loading" })
  const [tries, setTries] = React.useState(0)

  React.useEffect(() => {
    let live = true
    loadNotesOfMeeting({ meetingId: meeting.id, day }).then(
      (notes) => live && setState({ kind: "ready", notes }),
      (error: unknown) => live && setState({ kind: "error", message: getProjectErrorMessage(error) })
    )
    return () => {
      live = false
    }
  }, [meeting.id, day, tries])

  async function save(notes: WrittenPageNode) {
    try {
      await saveNotesOfMeeting({ meetingId: meeting.id, day, notes })
    } catch (error) {
      showErrorToast(getProjectErrorMessage(error))
      return false
    }
    // Read back, for who changed them and the lines as saved. They are saved
    // either way, so a failed read only tries again.
    try {
      setState({ kind: "ready", notes: await loadNotesOfMeeting({ meetingId: meeting.id, day }) })
    } catch {
      setTries((n) => n + 1)
    }
    return true
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Notes</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {state.kind === "loading" ? (
          <LoadingRow label="Loading the notes…" />
        ) : state.kind === "error" ? (
          <ErrorRow
            message={state.message}
            onRetry={() => {
              setState({ kind: "loading" })
              setTries((n) => n + 1)
            }}
          />
        ) : (
          <>
            <TaskNotesField
              notes={state.notes.notes}
              readOnly={!state.notes.canEdit}
              onSave={save}
              label={dayLabel}
              labelId="meeting-notes-label"
              links={state.notes.links}
              placeholder="What was said and decided. Each line can become a task once you press Done."
              reading={(body) => (
                <NoteLinesView
                  body={body}
                  lines={storedLines(state.notes.notes)}
                  canMake={state.notes.canEdit}
                  onMake={(line) => onMakeTask({ meetingId: meeting.id, day, path: line.path, text: line.text })}
                />
              )}
            />
            {state.notes.updatedAt ? (
              <p className="text-sm text-muted-foreground">
                Last changed by {state.notes.updatedBy ?? "a former member"},{" "}
                <time dateTime={state.notes.updatedAt} title={formatDateTime(state.notes.updatedAt)}>
                  {formatTimeAgo(state.notes.updatedAt)}
                </time>
                .
              </p>
            ) : null}
            {meeting.repeatEvery ? (
              <p className="text-sm text-muted-foreground">Each date the meeting falls on keeps its own notes.</p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * The lines as saved, before links to tasks this reader can't open lose their
 * link for drawing, so a line already made into a task never offers Make a
 * task again.
 */
function storedLines(stored: string) {
  const notes = readTaskNotes(stored)
  return notes.kind === "doc" ? noteLines(notes.body) : []
}

/** The notes drawn line by line, each line with Make a task for those who write them. */
function NoteLinesView({
  body,
  lines,
  canMake,
  onMake,
}: {
  body: WrittenPageNode
  lines: NoteLine[]
  canMake: boolean
  onMake: (line: NoteLine) => void
}) {
  const byPlace = new Map(lines.map((line) => [lineKey(line.path), line]))
  const row = (key: string, nodes: WrittenPageNode[], path: number[]) => (
    <LineRow
      key={key}
      nodes={nodes}
      line={byPlace.get(lineKey(path))}
      canMake={canMake}
      onMake={onMake}
    />
  )

  return (
    <div className="grid gap-2">
      {(body.content ?? []).map((block, i) => {
        if (block.type === "paragraph" || block.type === "heading") return row(`${i}`, [block], [i])
        if (block.type === "bulletList" || block.type === "orderedList") {
          const List = block.type === "bulletList" ? "ul" : "ol"
          return (
            <List
              key={i}
              className={cn(
                "grid gap-1 pl-5 text-sm",
                block.type === "bulletList" ? "[&>li]:list-disc" : "[&>li]:list-decimal"
              )}
            >
              {(block.content ?? []).map((item, j) => (
                <li key={j}>{row(`${i}.${j}`, item.content ?? [], [i, j, 0])}</li>
              ))}
            </List>
          )
        }
        if (block.type === "blockquote") {
          return (
            <blockquote key={i} className="grid gap-2 border-l-2 pl-4 text-muted-foreground">
              {(block.content ?? []).map((child, k) => row(`${i}.${k}`, [child], [i, k]))}
            </blockquote>
          )
        }
        return <WrittenPageBody key={i} body={{ type: "doc", content: [block] }} />
      })}
    </div>
  )
}

function LineRow({
  nodes,
  line,
  canMake,
  onMake,
}: {
  nodes: WrittenPageNode[]
  line: NoteLine | undefined
  canMake: boolean
  onMake: (line: NoteLine) => void
}) {
  return (
    <div className="group flex items-start gap-2">
      <div className="min-w-0 flex-1">
        <WrittenPageBody body={{ type: "doc", content: nodes }} />
      </div>
      {line?.taskId ? (
        <span className="flex h-7 shrink-0 items-center gap-1 text-xs text-muted-foreground">
          <ListTodoIcon className="size-3.5" aria-hidden />
          Task made
        </span>
      ) : canMake && line?.text ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="shrink-0 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100"
          aria-label={`Make a task from "${line.text}"`}
          onClick={() => onMake(line)}
        >
          <ListTodoIcon className="size-4" />
          Make a task
        </Button>
      ) : null}
    </div>
  )
}
