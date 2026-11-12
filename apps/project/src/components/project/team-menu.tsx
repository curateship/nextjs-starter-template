import * as React from "react"
import { useRouter } from "@tanstack/react-router"
import { PlusIcon, Trash2Icon, XIcon } from "lucide-react"

import { JoinLinkCard } from "@/components/project/join-link-card"
import { TabbedMenu } from "@/components/shared/notes/tabbed-menu"
import { PickChoicesRow, PickGroup, PickRow } from "@/components/project/pick-rows"
import { ZoneChoices } from "@/components/project/time-zone-select"
import { CoverRow } from "@/components/shared/notes/page-rows"
import { Button } from "@/components/ui/button"
import { LockRow } from "@/components/shared/notes/page-rows"
import { Checkbox } from "@/components/ui/checkbox"
import { DatePicker } from "@/components/ui/date-picker"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { addTeamHoliday, removeTeamHoliday, type Holiday } from "@/lib/api/project/team-running"
import { saveTeamCover, saveTeamPageLock, updateProjectTeam, type TeamDashboard, type TeamSummary } from "@/lib/api/project/teams"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { useSyncedDraft } from "@/lib/hooks/use-synced-draft"
import { focusRingInset } from "@/lib/layout/focus-ring"
import { keyFromDate } from "@/lib/project/dates"
import { dayLabel } from "@/lib/project/days"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { CHECKIN_NOTE_FIELDS, DEFAULT_CHECKIN_QUESTIONS, LIMITS, WEEK_DAYS, type CheckinNoteField } from "@/lib/project/rules"
import { useTeamId } from "@/lib/project/team-scope"
import { useZoneRows } from "@/lib/project/zone-rows"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

type TeamPatch = Parameters<typeof updateProjectTeam>[0]

const QUESTION_KEY = {
  yesterday: "questionYesterday",
  today: "questionToday",
  blocker: "questionBlocker",
} as const satisfies Record<CheckinNoteField, keyof TeamPatch>

/**
 * Team settings, the ⋮ at the right of the Team dashboard's left panel
 * header, the site admin's alone (Tyler, 7 Nov 2026: "the teams settings is
 * not following the skill"). The tabbed ⋮ the project's and My settings are,
 * in the Admin 3 panel design: General (the team's name and cover, then its
 * schedule, then Lock the notes), Check-ins (the boxes' words and the team's holidays) and Joining
 * (starter tasks and the join link). Every field saves itself; a pick saves
 * at once, a typed value when it is left. The Teams table still opens the
 * same settings as a window from a row (`TeamSettingsDialog`), as the
 * Projects table does for a project.
 */
export function TeamMenu({ data }: { data: TeamDashboard }) {
  const { team } = data
  const save = useSaveTeam()

  const general = (
    <div className="grid gap-5 px-4 py-3">
      <PickGroup title="Team">
        <PickRow label="Name" value={team.name}>
          <NameField team={team} save={save} />
        </PickRow>
      </PickGroup>
      {/* The page's cover, as every page in the shell's design has it (8 Nov 2026). */}
      <PickGroup title="Page">
        <TeamCoverRow team={team} />
      </PickGroup>
      <PickGroup title="Schedule">
        <ZoneRow zone={team.timeZone} save={save} />
        <PickRow label="Check-in time" value={team.checkinTime}>
          <CheckinTimeField team={team} save={save} />
        </PickRow>
        <PickRow label="Work days" value={workDaysWords(team.workDays)}>
          <WorkDaysField team={team} save={save} />
        </PickRow>
      </PickGroup>
    </div>
  )

  const checkins = (
    <div className="grid gap-5 px-4 py-3">
      {/* Each row is named after the check-in box it renames, with the team's own word on the
          right (Tyler, 7 Nov 2026, of "Box 1": "wht are these for?"). */}
      <PickGroup
        title="Check-in box names"
        after={
          <p className="px-0.5 text-xs text-muted-foreground">
            The words over the three boxes everyone fills in at their morning check-in. The last one still marks
            someone Blocked.
          </p>
        }
      >
        {CHECKIN_NOTE_FIELDS.map((field) => (
          <PickRow
            key={field}
            label={DEFAULT_CHECKIN_QUESTIONS[field]}
            empty={!team.questions[field]}
            value={team.questions[field] ?? "Not renamed"}
          >
            <QuestionField field={field} saved={team.questions[field]} save={save} />
          </PickRow>
        ))}
      </PickGroup>
      <HolidaysGroup holidays={data.holidays} />
    </div>
  )

  const joining = (
    <div className="grid gap-5 px-4 py-3">
      <StarterTasksGroup team={team} save={save} />
      {data.joinLink ? (
        <section className="grid gap-2" aria-label="Join link">
          <h3 className="px-0.5 text-sm font-medium text-muted-foreground">Join link</h3>
          <div className="rounded-xl border bg-muted/50 p-3">
            <JoinLinkCard state={data.joinLink} bare />
          </div>
        </section>
      ) : null}
    </div>
  )

  return (
    <TabbedMenu
      label="Team settings"
      align="start"
      width="20.4rem"
      tabs={[
        // Lock blocks is the General tab's footer, as on the shell's left page ⋮.
        { value: "general", label: "General", content: general, footer: <PageLockButton locked={data.pageLocked} /> },
        { value: "checkins", label: "Check-ins", content: checkins },
        { value: "joining", label: "Joining", content: joining },
      ]}
    />
  )
}

/** Saves a change to the team and loads the page again; a refusal says why. */
function useSaveTeam() {
  const teamId = useTeamId()
  const router = useRouter()
  const [run] = useAsyncAction(getProjectErrorMessage)
  return React.useCallback(
    async (patch: TeamPatch) => {
      const ok = await run(() => updateProjectTeam(patch, teamId))
      if (ok) await router.invalidate()
      return ok
    },
    [router, run, teamId]
  )
}

type Save = ReturnType<typeof useSaveTeam>

/** "Mon to Fri" for a run of days, otherwise each day: "Mon, Wed, Fri". */
function workDaysWords(days: number[]) {
  const picked = WEEK_DAYS.filter(({ day }) => days.includes(day))
  const first = WEEK_DAYS.findIndex(({ day }) => day === picked[0]?.day)
  const inARun = picked.length > 2 && picked.every((item, index) => WEEK_DAYS[first + index]?.day === item.day)
  if (inARun) return `${picked[0].short} to ${picked[picked.length - 1].short}`
  return picked.map(({ short }) => short).join(", ") || "None"
}

/** A typed value in a row's box: saved when it is left or on Enter. */
function TypedField({
  id,
  label,
  saved,
  type = "text",
  maxLength,
  placeholder,
  check,
  onSave,
}: {
  id: string
  label: string
  saved: string
  type?: "text" | "time"
  maxLength?: number
  placeholder?: string
  /** The words to show when the value can't be saved, or null. */
  check?: (value: string) => string | null
  onSave: (value: string) => Promise<boolean>
}) {
  const [draft, setDraft] = useSyncedDraft(saved)
  const [invalid, setInvalid] = React.useState(false)
  async function commit() {
    const next = draft.trim()
    if (next === saved) return
    const problem = check?.(next) ?? null
    if (problem) {
      setInvalid(true)
      showErrorToast(problem)
      return
    }
    setInvalid(!(await onSave(next)))
  }
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={draft}
        maxLength={maxLength}
        placeholder={placeholder}
        autoFocus
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

function NameField({ team, save }: { team: TeamSummary; save: Save }) {
  return (
    <TypedField
      id="team-menu-name"
      label="Team name"
      saved={team.name}
      maxLength={LIMITS.teamName}
      check={(value) => (value ? null : "The team name can't be empty.")}
      onSave={(name) => save({ name })}
    />
  )
}

function CheckinTimeField({ team, save }: { team: TeamSummary; save: Save }) {
  return (
    <TypedField
      id="team-menu-checkin"
      label="Daily check-in time"
      type="time"
      saved={team.checkinTime}
      check={(value) => (/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(value) ? null : "Pick a time like 09:00.")}
      onSave={(checkinTime) => save({ checkinTime })}
    />
  )
}

function QuestionField({ field, saved, save }: { field: CheckinNoteField; saved: string | null; save: Save }) {
  return (
    <TypedField
      id={`team-menu-question-${field}`}
      label={`Name for "${DEFAULT_CHECKIN_QUESTIONS[field]}"`}
      saved={saved ?? ""}
      maxLength={LIMITS.checkinQuestion}
      placeholder={DEFAULT_CHECKIN_QUESTIONS[field]}
      onSave={(value) => save({ [QUESTION_KEY[field]]: value || null })}
    />
  )
}

/** The team's zone: the zones with a search box over them, open at once; a pick saves. */
function ZoneRow({ zone, save }: { zone: string; save: Save }) {
  const rows = useZoneRows(zone)
  return (
    <PickChoicesRow label="Time zone" value={zone.replaceAll("_", " ")} contentClassName="w-72">
      {(close) => (
        <ZoneChoices
          rows={rows}
          value={zone}
          onPick={(next) => {
            close()
            if (next !== zone) void save({ timeZone: next })
          }}
        />
      )}
    </PickChoicesRow>
  )
}

/** The days the team works, each a tick that saves at once; at least one stays. */
function WorkDaysField({ team, save }: { team: TeamSummary; save: Save }) {
  function toggle(day: number, on: boolean) {
    const next = on ? [...team.workDays, day] : team.workDays.filter((d) => d !== day)
    if (next.length === 0) {
      showErrorToast("Pick at least one work day.")
      return
    }
    void save({ workDays: next })
  }
  return (
    <fieldset className="grid gap-2">
      <legend className="mb-2 text-sm font-medium">Work days</legend>
      {WEEK_DAYS.map(({ day, short }) => (
        <div key={day} className="flex items-center gap-2">
          <Checkbox
            id={`team-menu-day-${day}`}
            checked={team.workDays.includes(day)}
            onCheckedChange={(checked) => toggle(day, checked === true)}
          />
          <Label htmlFor={`team-menu-day-${day}`} className="font-normal">
            {short}
          </Label>
        </div>
      ))}
    </fieldset>
  )
}

/**
 * The cover behind the left panel's header, as the shell's Cover photo row
 * draws every page's: None, Sky, the pictures it has had, and + to add one
 * from the media library. A pick saves at once.
 */
function TeamCoverRow({ team }: { team: TeamSummary }) {
  const teamId = useTeamId()
  const router = useRouter()
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  return (
    <CoverRow
      cover={{
        url: team.photoUrl,
        images: team.coverImages,
        busy,
        set: ({ url, images }) =>
          void run(() => saveTeamCover({ photoUrl: url ?? "", coverImages: images }, teamId)).then(
            (ok) => (ok ? router.invalidate() : undefined)
          ),
      }}
    />
  )
}

/**
 * Locks the team's page so it reads only, blocks and all, even for the site
 * admin, or unlocks it (Tyler, 7 Nov 2026: "the lock blocks button is
 * missing"). The same row, words and icons as My settings' on My dashboard.
 */
function PageLockButton({ locked }: { locked: boolean }) {
  const teamId = useTeamId()
  const router = useRouter()
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  async function toggle() {
    const ok = await run(
      () => saveTeamPageLock(!locked, teamId)
    )
    if (ok) await router.invalidate()
  }
  return <LockRow locked={locked} busy={busy} onLock={() => void toggle()} />
}

/** A list's last line, "+ Add …", which turns into its own small form. */
function AddLine({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <button
      type="button"
      onClick={onPress}
      className={cn(
        "flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground",
        focusRingInset
      )}
    >
      <PlusIcon className="size-4" aria-hidden />
      {label}
    </button>
  )
}

/**
 * Team holidays: each a row with its day and name, and a bin; the last line
 * adds one. On a holiday nobody is reminded or shows as missing.
 */
function HolidaysGroup({ holidays }: { holidays: Holiday[] }) {
  const teamId = useTeamId()
  const router = useRouter()
  const [run, busy] = useAsyncAction(getProjectErrorMessage)
  const [adding, setAdding] = React.useState(false)
  const [day, setDay] = React.useState<Date | undefined>()
  const [name, setName] = React.useState("")

  async function add(event: React.FormEvent) {
    event.preventDefault()
    const dayKey = keyFromDate(day)
    if (!dayKey) return showErrorToast("Pick the holiday's day.")
    if (!name.trim()) return showErrorToast("Give the holiday a name.")
    const ok = await run(() => addTeamHoliday({ day: dayKey, name: name.trim() }, teamId))
    if (!ok) return
    setDay(undefined)
    setName("")
    setAdding(false)
    await router.invalidate()
  }

  async function remove(holiday: Holiday) {
    const ok = await run(() => removeTeamHoliday(holiday.id, teamId))
    if (ok) await router.invalidate()
  }

  return (
    <PickGroup title="Holidays">
      {holidays.map((holiday) => (
        <div key={holiday.id} className="flex min-h-11 items-center gap-3 px-3 py-1 text-sm">
          <span className="shrink-0 text-muted-foreground">{dayLabel(holiday.day)}</span>
          <span className="min-w-0 flex-1 truncate text-right">{holiday.name}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove ${holiday.name}`}
            disabled={busy}
            onClick={() => void remove(holiday)}
          >
            <Trash2Icon className="size-4" />
          </Button>
        </div>
      ))}
      {adding ? (
        // Escape here closes this box only, not the menu around it.
        <form
          data-own-escape=""
          className="grid gap-2 px-3 py-2"
          onSubmit={(event) => void add(event)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setAdding(false)
          }}
        >
          <DatePicker value={day} onChange={setDay} placeholder="Pick a day" />
          <div className="flex items-center gap-2">
            <Input
              aria-label="Holiday name"
              placeholder="Christmas Day"
              value={name}
              maxLength={LIMITS.holidayName}
              autoFocus
              className="h-8 min-w-0 flex-1"
              onChange={(event) => setName(event.target.value)}
            />
            <Button type="submit" size="sm" disabled={busy}>
              Add
            </Button>
          </div>
        </form>
      ) : (
        <AddLine label="Add holiday" onPress={() => setAdding(true)} />
      )}
    </PickGroup>
  )
}

/**
 * Starter tasks: up to 10 titles each new member gets as "Just me" tasks.
 * Each row has its × ; the last line adds one.
 */
function StarterTasksGroup({ team, save }: { team: TeamSummary; save: Save }) {
  const [adding, setAdding] = React.useState(false)
  const [title, setTitle] = React.useState("")
  const titles = team.starterTasks
  const full = titles.length >= LIMITS.starterTasks

  async function add(event: React.FormEvent) {
    event.preventDefault()
    const next = title.trim()
    if (!next) return showErrorToast("Type the task's title first.")
    // A refused save keeps what was typed.
    if (await save({ starterTasks: [...titles, next] })) {
      setTitle("")
      setAdding(false)
    }
  }

  return (
    <PickGroup
      title="Starter tasks"
      after={
        <p className="px-0.5 text-xs text-muted-foreground">
          {full
            ? `That's ${LIMITS.starterTasks}, the most a team can have.`
            : "Each person who joins gets these as their own Just me tasks."}
        </p>
      }
    >
      {titles.map((starter, index) => (
        <div key={`${index}-${starter}`} className="flex min-h-11 items-center gap-3 px-3 py-1 text-sm">
          <span className="min-w-0 flex-1 break-words">{starter}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove the starter task "${starter}"`}
            onClick={() => void save({ starterTasks: titles.filter((_, i) => i !== index) })}
          >
            <XIcon className="size-4" />
          </Button>
        </div>
      ))}
      {full ? null : adding ? (
        <form
          data-own-escape=""
          className="flex items-center gap-2 px-3 py-2"
          onSubmit={(event) => void add(event)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setAdding(false)
          }}
        >
          <Input
            aria-label="New starter task"
            placeholder="Read the team handbook"
            value={title}
            maxLength={LIMITS.taskTitle}
            autoFocus
            className="h-8 min-w-0 flex-1"
            onChange={(event) => setTitle(event.target.value)}
          />
          <Button type="submit" size="sm">
            Add
          </Button>
        </form>
      ) : (
        <AddLine label="Add starter task" onPress={() => setAdding(true)} />
      )}
    </PickGroup>
  )
}
