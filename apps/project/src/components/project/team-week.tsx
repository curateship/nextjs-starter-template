import { CircleAlertIcon, ListTodoIcon, PartyPopperIcon } from "lucide-react"

import type { TeamDueTask, TeamMonth } from "@/lib/api/project/checkins"
import { clockLabel, longDayLabel, weekdayOf } from "@/lib/project/days"
import { dueWords } from "@/lib/project/due-days"
import { MEETING_CHIP, meetingWords, timeRangeLabel, type DayMeeting } from "@/lib/project/meetings"
import { dayBlocks, weekDays, weekHours, type WeekBlock } from "@/lib/project/week-view"
import { cn } from "@/lib/utils"

/** One hour's height in the time grid. */
const HOUR_PX = 48

/**
 * The Team calendar's Week view: Monday to Sunday of the chosen day's week,
 * each day's check-in count at the top (and its due tasks' count while
 * "Due dates" is on) and its meetings at their times, in
 * the viewer's own time zone and on the viewer's own day. Clicking a day, or
 * a meeting on it, picks that day, so its check-ins show on the right and its
 * meetings under the calendar. On a phone the days stack as a list instead.
 */
export function TeamWeek({
  selected,
  month,
  meetingDays,
  holidays,
  dueDays,
  viewerZone,
  onSelect,
}: {
  selected: string
  month: TeamMonth
  meetingDays: Map<string, DayMeeting[]>
  holidays: Map<string, string>
  /** Each day's due tasks; empty while "Due dates" is off. */
  dueDays: Map<string, TeamDueTask[]>
  viewerZone: string
  onSelect: (day: string) => void
}) {
  const days = weekDays(selected)
  const counts = new Map(month.days.map((day) => [day.day, day]))
  const blocks = new Map(days.map((day) => [day, dayBlocks(meetingDays.get(day) ?? [], viewerZone)]))
  const hours = weekHours([...blocks.values()].flat())
  const hourList = Array.from({ length: hours.last - hours.first }, (_, index) => hours.first + index)

  const header = (day: string) => {
    const square = counts.get(day)
    const holiday = holidays.get(day)
    const dayMeetings = meetingDays.get(day) ?? []
    const words = [
      holiday ? `${holiday}, a team holiday` : null,
      square?.expected
        ? `${square.checkedIn} of ${square.expected} checked in${square.blocked ? `, ${square.blocked} blocked` : ""}`
        : null,
      meetingWords(dayMeetings, viewerZone),
      dueWords(dueDays.get(day) ?? []),
    ].filter(Boolean)
    const due = dueDays.get(day)?.length ?? 0
    return {
      label: `${longDayLabel(day)}${words.length ? `: ${words.join(". ")}` : ""}`,
      content: (
        <>
          <span className="flex items-baseline gap-1.5">
            <span className="text-xs text-muted-foreground">{weekdayShort(day)}</span>
            <span
              className={cn(
                "flex size-6 items-center justify-center rounded-full text-sm",
                day === month.today && "bg-primary font-semibold text-primary-foreground"
              )}
            >
              {Number(day.slice(8))}
            </span>
          </span>
          {holiday ? (
            <span className="flex max-w-full items-center gap-0.5 rounded bg-muted px-1 py-0.5 text-muted-foreground">
              <PartyPopperIcon className="size-3 shrink-0" aria-hidden />
              <span className="truncate">{holiday}</span>
            </span>
          ) : null}
          {square?.expected ? (
            <span className="max-w-full truncate rounded bg-muted px-1 py-0.5">
              {square.checkedIn} of {square.expected} in
            </span>
          ) : null}
          {square?.blocked ? (
            <span className="flex max-w-full items-center gap-0.5 rounded bg-destructive/10 px-1 py-0.5 text-destructive">
              <CircleAlertIcon className="size-3 shrink-0" aria-hidden />
              {square.blocked} blocked
            </span>
          ) : null}
          {due ? (
            <span className="flex max-w-full items-center gap-0.5 rounded border px-1 py-0.5 text-muted-foreground">
              <ListTodoIcon className="size-3 shrink-0" aria-hidden />
              {due} due
            </span>
          ) : null}
        </>
      ),
    }
  }

  return (
    <>
      {/* From 640px up: seven columns with a time grid. */}
      <div className="p-3 max-sm:hidden">
        <div className="grid grid-cols-[3rem_repeat(7,minmax(0,1fr))] gap-x-1.5">
          <span aria-hidden />
          {days.map((day) => {
            const { label, content } = header(day)
            return (
              <button
                key={day}
                type="button"
                aria-pressed={day === selected}
                aria-current={day === month.today ? "date" : undefined}
                aria-label={label}
                onClick={() => onSelect(day)}
                className={cn(
                  "flex min-h-16 min-w-0 flex-col items-start gap-1 rounded-md border p-1.5 text-left text-xs hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  day === selected && "ring-2 ring-ring"
                )}
              >
                {content}
              </button>
            )
          })}
        </div>
        <div
          className="mt-2 grid grid-cols-[3rem_repeat(7,minmax(0,1fr))] gap-x-1.5"
          style={{ height: hourList.length * HOUR_PX }}
        >
          <div aria-hidden className="relative">
            {hourList.map((hour, index) => (
              <span
                key={hour}
                className="absolute right-1 -translate-y-1/2 text-[11px] text-muted-foreground tabular-nums"
                style={{ top: index * HOUR_PX }}
              >
                {index === 0 ? "" : clockLabel(`${String(hour).padStart(2, "0")}:00`).replace(":00", "")}
              </span>
            ))}
          </div>
          {days.map((day) => (
            <div
              key={day}
              className={cn("relative rounded-md border", day === selected && "border-ring")}
            >
              {hourList.slice(1).map((hour, index) => (
                <span
                  key={hour}
                  aria-hidden
                  className="absolute inset-x-0 border-t"
                  style={{ top: (index + 1) * HOUR_PX }}
                />
              ))}
              {(blocks.get(day) ?? []).map((block) => (
                <MeetingBlock
                  key={`${block.meeting.id}-${block.occurrence.startsAt}`}
                  block={block}
                  firstHour={hours.first}
                  viewerZone={viewerZone}
                  onPick={() => onSelect(day)}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      {/* On a phone: the days as a list, each with its meetings in order. */}
      <ol className="grid gap-2 p-3 sm:hidden">
        {days.map((day) => {
          const { label, content } = header(day)
          const dayMeetings = meetingDays.get(day) ?? []
          return (
            <li key={day}>
              <button
                type="button"
                aria-pressed={day === selected}
                aria-label={label}
                onClick={() => onSelect(day)}
                className={cn(
                  "grid w-full gap-1.5 rounded-md border p-2 text-left text-xs hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  day === selected && "ring-2 ring-ring"
                )}
              >
                <span className="flex flex-wrap items-center gap-1.5">{content}</span>
                {dayMeetings.map(({ occurrence, meeting }) => (
                  <span
                    key={`${meeting.id}-${occurrence.startsAt}`}
                    className={cn("block truncate rounded px-1.5 py-0.5", MEETING_CHIP[meeting.color])}
                  >
                    {timeRangeLabel(occurrence.startsAt, occurrence.endsAt, viewerZone)} · {meeting.title}
                  </span>
                ))}
              </button>
            </li>
          )
        })}
      </ol>
    </>
  )
}

function MeetingBlock({
  block,
  firstHour,
  viewerZone,
  onPick,
}: {
  block: WeekBlock
  firstHour: number
  viewerZone: string
  onPick: () => void
}) {
  const time = timeRangeLabel(block.occurrence.startsAt, block.occurrence.endsAt, viewerZone)
  const top = ((block.start - firstHour * 60) / 60) * HOUR_PX
  const height = Math.max(((block.end - block.start) / 60) * HOUR_PX, 20) - 2
  const width = 100 / block.slots
  return (
    <button
      type="button"
      title={`${block.meeting.title}, ${time}`}
      aria-label={`${block.meeting.title}, ${time}`}
      onClick={onPick}
      // A solid card under the chip's light wash, so the hour lines don't show through.
      className="absolute overflow-hidden rounded bg-card text-left text-[11px] leading-tight focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      style={{ top: top + 1, height, left: `calc(${block.slot * width}% + 2px)`, width: `calc(${width}% - 4px)` }}
    >
      <span className={cn("block h-full px-1 py-0.5", MEETING_CHIP[block.meeting.color])}>
        <span className="block truncate font-medium">{block.meeting.title}</span>
        {height > 30 ? <span className="block truncate opacity-80">{time}</span> : null}
      </span>
    </button>
  )
}

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const
const weekdayShort = (day: string) => WEEKDAY_SHORT[weekdayOf(day)]
