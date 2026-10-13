import { ExternalLinkIcon, SettingsIcon } from "lucide-react"

import { PersonAvatar } from "@/components/project/task-bits"
import { Button } from "@/components/ui/button"
import type { Meeting, MeetingOccurrence, MeetingPerson } from "@/lib/api/project/meetings"
import { shortDayLabel } from "@/lib/project/days"
import { MEETING_CHIP, repeatWords, timeRangeLabel, type DayMeeting } from "@/lib/project/meetings"
import { PROJECT_COLOR_DOT } from "@/lib/project/rules"
import { cn } from "@/lib/utils"

const CHIPS_PER_DAY = 2

/**
 * A day square's meetings: a chip per meeting, cut with "…" when the name
 * doesn't fit, and "+2 more" past two. The name is always there, so the
 * colour is never the only way to tell them apart.
 */
export function MeetingChips({ meetings }: { meetings: DayMeeting[] }) {
  if (meetings.length === 0) return null
  const hidden = meetings.length - CHIPS_PER_DAY
  return (
    <>
      {meetings.slice(0, CHIPS_PER_DAY).map(({ occurrence, meeting }) => (
        <span
          key={`${meeting.id}-${occurrence.startsAt}`}
          className={cn("block w-full truncate rounded px-1 py-0.5 sm:px-1.5", MEETING_CHIP[meeting.color])}
        >
          {meeting.title}
        </span>
      ))}
      {hidden > 0 ? <span className="px-1.5 text-muted-foreground">+{hidden} more</span> : null}
    </>
  )
}

/**
 * Under the calendar: the chosen day's meetings, one row each with its time,
 * name, where it happens and who is coming. The row opens the meeting's
 * window for that date, Join opens the video link in a new tab, and the cog
 * changes the meeting for whoever may (Tyler's choice, 12 Oct 2026).
 */
export function DayMeetings({
  day,
  holiday,
  meetings,
  viewerZone,
  onOpen,
  onEdit,
}: {
  day: string
  /** The team holiday's name, which a calendar square has too little room for. */
  holiday?: string
  meetings: DayMeeting[]
  viewerZone: string
  onOpen: (meeting: Meeting, occurrence: MeetingOccurrence) => void
  onEdit: (meeting: Meeting) => void
}) {
  return (
    <section className="grid gap-3 border-t p-4" aria-labelledby="day-meetings-heading">
      <div className="flex items-baseline justify-between gap-2">
        <h3 id="day-meetings-heading" className="min-w-0 font-medium break-words">
          {shortDayLabel(day)}
          {holiday ? <span className="font-normal text-muted-foreground"> · {holiday}</span> : null}
        </h3>
        <span className="shrink-0 text-sm text-muted-foreground">
          {meetings.length === 0
            ? "No meetings"
            : `${meetings.length} ${meetings.length === 1 ? "meeting" : "meetings"}`}
        </span>
      </div>
      {meetings.length ? (
        <ul className="grid gap-2">
          {meetings.map(({ occurrence, meeting }) => (
            <MeetingRow
              key={`${meeting.id}-${occurrence.startsAt}`}
              occurrence={occurrence}
              meeting={meeting}
              viewerZone={viewerZone}
              onOpen={() => onOpen(meeting, occurrence)}
              onEdit={() => onEdit(meeting)}
            />
          ))}
        </ul>
      ) : null}
    </section>
  )
}

function MeetingRow({
  occurrence,
  meeting,
  viewerZone,
  onOpen,
  onEdit,
}: {
  occurrence: MeetingOccurrence
  meeting: Meeting
  viewerZone: string
  onOpen: () => void
  onEdit: () => void
}) {
  const time = timeRangeLabel(occurrence.startsAt, occurrence.endsAt, viewerZone)
  const otherZone = viewerZone !== meeting.timeZone
  const going = meeting.people.filter((person) => person.answer === "going").length
  const details = [
    meeting.service ?? "No video link",
    going ? `${going} going` : null,
    repeatWords(meeting.day, meeting.repeatEvery),
    otherZone ? `your time, ${viewerZone.replaceAll("_", " ")}` : null,
  ].filter(Boolean)

  const body = (
    <>
      <span aria-hidden className={cn("h-9 w-1 shrink-0 rounded-full", PROJECT_COLOR_DOT[meeting.color])} />
      <span className="grid min-w-0 flex-1 gap-0.5 sm:flex sm:items-center sm:gap-4">
        <span className="shrink-0 text-sm tabular-nums sm:w-36">{time}</span>
        <span className="grid min-w-0">
          <span className="truncate font-medium">{meeting.title}</span>
          <span className="truncate text-xs text-muted-foreground">{details.join(" · ")}</span>
        </span>
      </span>
    </>
  )

  return (
    <li className="flex items-center gap-2 rounded-lg border pr-2">
      <button
        type="button"
        aria-label={`${meeting.title}, ${time}, ${details.join(", ")}. Open the meeting`}
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-l-lg p-3 text-left hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        {body}
      </button>
      {meeting.videoUrl ? (
        // Words from 640px up; on a phone the row needs the room.
        <Button asChild variant="outline" className="max-sm:size-8 max-sm:px-0">
          <a
            href={meeting.videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Join ${meeting.title} on ${meeting.service ?? "the video link"} (opens in a new tab)`}
          >
            <ExternalLinkIcon className="size-4" />
            <span className="max-sm:hidden">Join</span>
          </a>
        </Button>
      ) : null}
      <PeopleStack people={meeting.people} />
      {meeting.canEdit ? (
        <Button type="button" variant="ghost" size="icon" aria-label={`Change ${meeting.title}`} onClick={onEdit}>
          <SettingsIcon className="size-4" />
        </Button>
      ) : null}
    </li>
  )
}

const FACES = 4

/** Up to four faces overlapping, then "+3", with every name for a screen reader. */
function PeopleStack({ people }: { people: MeetingPerson[] }) {
  if (people.length === 0) return null
  const extra = people.length - FACES
  return (
    <span
      role="img"
      aria-label={`Invited: ${people.map((person) => person.name).join(", ")}`}
      title={people.map((person) => person.name).join(", ")}
      className="flex shrink-0 items-center -space-x-1"
    >
      {people.slice(0, FACES).map((person) => (
        <PersonAvatar
          key={person.id}
          name={person.name}
          avatarUrl={person.avatarUrl}
          className="bg-card ring-2 ring-card"
        />
      ))}
      {extra > 0 ? (
        <span className="z-10 flex size-6 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground ring-2 ring-card">
          +{extra}
        </span>
      ) : null}
    </span>
  )
}
