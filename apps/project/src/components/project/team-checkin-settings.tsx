import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { Loader2Icon, PlusIcon, Trash2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DatePicker } from "@/components/ui/date-picker"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { addTeamHoliday, removeTeamHoliday, type Holiday } from "@/lib/api/project/team-running"
import { updateProjectTeam, type TeamSummary } from "@/lib/api/project/teams"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useSyncedDraft } from "@/lib/hooks/use-synced-draft"
import { keyFromDate } from "@/lib/project/dates"
import { dayLabel } from "@/lib/project/days"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { CHECKIN_NOTE_FIELDS, DEFAULT_CHECKIN_QUESTIONS, LIMITS, type CheckinNoteField } from "@/lib/project/rules"
import { showErrorToast } from "@/lib/toast/error-toast"

/** Runs a save and shows Saving…, Saved or Not saved at the top of Team settings. */
type Track = (work: () => Promise<unknown>) => Promise<boolean>

const QUESTION_KEY = {
  yesterday: "questionYesterday",
  today: "questionToday",
  blocker: "questionBlocker",
} as const satisfies Record<CheckinNoteField, string>

/**
 * The team's own words for the check-in's three boxes, such as "Wins" and
 * "Focus". Renaming only (Tyler's choice, 11 Oct 2026): there are always
 * three boxes, the third still marks someone Blocked, and the saved notes
 * keep their places. Past days read under the words in use at the time.
 */
export function CheckinQuestionsCard({
  team,
  canEdit,
  track,
}: {
  team: TeamSummary
  canEdit: boolean
  track: Track
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Check-in boxes</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="text-sm text-muted-foreground">
          Rename the three notes on the check-in to fit how your team works. The third box still
          marks someone Blocked. Leave a box empty to keep its usual name.
        </p>
        {CHECKIN_NOTE_FIELDS.map((field) => (
          <QuestionField
            key={field}
            field={field}
            saved={team.questions[field]}
            canEdit={canEdit}
            track={track}
          />
        ))}
      </CardContent>
    </Card>
  )
}

function QuestionField({
  field,
  saved,
  canEdit,
  track,
}: {
  field: CheckinNoteField
  saved: string | null
  canEdit: boolean
  track: Track
}) {
  const router = useRouter()
  const [draft, setDraft] = useSyncedDraft(saved ?? "")
  const [invalid, setInvalid] = React.useState(false)
  const id = `team-question-${field}`

  async function commit() {
    const next = draft.trim()
    if (next === (saved ?? "")) return
    const ok = await track(() => updateProjectTeam({ [QUESTION_KEY[field]]: next || null }))
    setInvalid(!ok)
    if (ok) await router.invalidate()
  }

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>Box {CHECKIN_NOTE_FIELDS.indexOf(field) + 1}</Label>
      <Input
        id={id}
        value={draft}
        maxLength={LIMITS.checkinQuestion}
        placeholder={DEFAULT_CHECKIN_QUESTIONS[field]}
        disabled={!canEdit}
        aria-invalid={invalid || undefined}
        onChange={(event) => {
          setDraft(event.target.value)
          setInvalid(false)
        }}
        onBlur={() => void commit()}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur()
        }}
      />
    </div>
  )
}

/**
 * Team holidays: a date and a name, such as "Christmas Day". On that day
 * nobody is reminded, nobody shows "Didn't check in", and the calendar reads
 * the holiday's name. Days already saved don't change.
 */
export function HolidaysCard({ holidays, canEdit }: { holidays: Holiday[]; canEdit: boolean }) {
  const router = useRouter()
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  const [day, setDay] = React.useState<Date | undefined>()
  const [name, setName] = React.useState("")
  const [nameInvalid, setNameInvalid] = React.useState(false)
  const [removing, setRemoving] = React.useState<Holiday | null>(null)

  async function add() {
    const dayKey = keyFromDate(day)
    if (!dayKey) {
      showErrorToast("Pick the holiday's day.")
      return
    }
    if (!name.trim()) {
      setNameInvalid(true)
      showErrorToast("Give the holiday a name.")
      return
    }
    const ok = await run(() => addTeamHoliday({ day: dayKey, name: name.trim() }), "Holiday added.")
    if (!ok) return
    setDay(undefined)
    setName("")
    await router.invalidate()
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Team holidays</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="text-sm text-muted-foreground">
          A day off for everyone. Nobody is reminded to check in or about due dates, and nobody
          shows as missing. Someone abroad marks their own country's days as time off.
        </p>
        {holidays.length ? (
          <ul className="grid gap-2">
            {holidays.map((holiday) => (
              <li key={holiday.id} className="flex items-center gap-2 text-sm">
                <span className="w-24 shrink-0 text-muted-foreground">{dayLabel(holiday.day)}</span>
                <span className="min-w-0 flex-1 break-words">{holiday.name}</span>
                {canEdit ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${holiday.name}`}
                    onClick={() => setRemoving(holiday)}
                  >
                    <Trash2Icon className="size-4" />
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm">No holidays coming up.</p>
        )}
        {canEdit ? (
          <form
            className="grid gap-4 sm:grid-cols-[auto_1fr_auto] sm:items-end sm:gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              void add()
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor="holiday-day">Day</Label>
              <DatePicker id="holiday-day" value={day} onChange={setDay} placeholder="Pick a day" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="holiday-name">Name</Label>
              <Input
                id="holiday-name"
                value={name}
                maxLength={LIMITS.holidayName}
                placeholder="Christmas Day"
                aria-invalid={nameInvalid || undefined}
                onChange={(event) => {
                  setName(event.target.value)
                  setNameInvalid(false)
                }}
              />
            </div>
            <Button type="submit" variant="outline" disabled={busy}>
              {busy ? <Loader2Icon className="size-4 animate-spin" /> : <PlusIcon className="size-4" />}
              Add holiday
            </Button>
          </form>
        ) : null}
        <ConfirmDialog
          open={Boolean(removing)}
          onOpenChange={(open) => (open ? null : setRemoving(null))}
          title={`Remove ${removing?.name ?? "this holiday"}?`}
          description={
            removing
              ? `${dayLabel(removing.day)} becomes an ordinary day again, with reminders as usual.`
              : ""
          }
          confirmLabel="Remove holiday"
          destructive
          loading={busy}
          onConfirm={async () => {
            if (!removing) return
            const ok = await run(() => removeTeamHoliday(removing.id), "Holiday removed.")
            if (!ok) return
            setRemoving(null)
            await router.invalidate()
          }}
        />
      </CardContent>
    </Card>
  )
}

/**
 * Starter tasks: up to 10 titles each new member gets as "Just me" tasks,
 * handed out by the owner, so their first check-in has something real to
 * pick. They're private, so whoever runs the team can't see whether they're
 * done. People already on the team get nothing.
 */
export function StarterTasksCard({ team, track }: { team: TeamSummary; track: Track }) {
  const router = useRouter()
  const [title, setTitle] = React.useState("")
  const titles = team.starterTasks
  const full = titles.length >= LIMITS.starterTasks

  async function save(next: string[]) {
    const ok = await track(() => updateProjectTeam({ starterTasks: next }))
    if (ok) await router.invalidate()
    return ok
  }

  async function add() {
    const next = title.trim()
    if (!next) {
      showErrorToast("Type the task's title first.")
      return
    }
    if (full) {
      showErrorToast(`A team can have at most ${LIMITS.starterTasks} starter tasks.`)
      return
    }
    // A refused save keeps what was typed.
    if (await save([...titles, next])) setTitle("")
  }

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Starter tasks</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <p className="text-sm text-muted-foreground">
          Each person who joins gets these as their own "Just me" tasks, from the team's owner.
          "Just me" tasks are private, so you won't see whether they're done.
        </p>
        {titles.length ? (
          <ol className="grid gap-2">
            {titles.map((starter, index) => (
              <li key={`${index}-${starter}`} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 break-words">{starter}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove the starter task "${starter}"`}
                  onClick={() => void save(titles.filter((_, i) => i !== index))}
                >
                  <Trash2Icon className="size-4" />
                </Button>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm">No starter tasks. New members start with nothing assigned.</p>
        )}
        {full ? (
          <p className="text-sm text-muted-foreground">
            That's {LIMITS.starterTasks}, the most a team can have. Remove one to add another.
          </p>
        ) : (
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              void add()
            }}
          >
            <Input
              aria-label="New starter task"
              placeholder="Read the team handbook"
              value={title}
              maxLength={LIMITS.taskTitle}
              onChange={(event) => setTitle(event.target.value)}
            />
            <Button type="submit" variant="outline">
              <PlusIcon className="size-4" />
              Add
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
