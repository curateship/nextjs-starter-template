
import { CollapsibleSettingsCard } from "@/components/settings/collapsible-settings-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { DatePicker } from "@/components/ui/date-picker"
import { FieldLabel } from "@/components/ui/field-label"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { EventSeries } from "@/lib/api/events/events"
import { isValidDateString } from "@/lib/events/calendar-grid"
import {
  describeRepeat,
  firstRepeatDates,
  REPEAT_WEEKS,
  repeatDatesText,
  repeatProblem,
  repeatStartingFrom,
  weekdayName,
  weekdayShortName,
  weekName,
  type RepeatRule,
  type RepeatWeek,
} from "@/lib/events/event-repeat"
import { formatEventClock, formatEventShortDay } from "@/lib/events/event-time"
import { dayForPicker, dayFromPicker } from "@/lib/events/picker-day"
import { focusRingInset } from "@/lib/layout/focus-ring"
import { cn } from "@/lib/utils"

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6]

/** How many dates the preview under the sentence names. */
const PREVIEW_DATES = 4

/**
 * The schedule box: none, weekly on chosen days, or monthly like "first
 * Tuesday", with an optional end day. Under it, the plain sentence and the
 * first dates it makes, worked out by the same code that makes them.
 */
export function EventRepeatCard({
  repeat,
  startDate,
  disabled,
  onChange,
}: {
  repeat: RepeatRule | null
  /** The event's start day, "2026-10-01", or empty while none is picked. */
  startDate: string
  disabled: boolean
  onChange: (repeat: RepeatRule | null) => void
}) {
  const hasStart = isValidDateString(startDate)
  const problem = repeat && hasStart ? repeatProblem(repeat, startDate) : null

  return (
    <CollapsibleSettingsCard
      size="sm"
      storageId="event-repeat"
      title="Repeat"
      description="Each date gets its own page. Saving this event changes every future date that was not changed on its own."
      contentClassName="grid gap-4"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <div className="grid gap-2">
          <FieldLabel htmlFor="event-repeat">Repeats</FieldLabel>
          <Select
            value={repeat?.freq ?? "none"}
            disabled={disabled}
            onValueChange={(value) =>
              onChange(
                value === "weekly" || value === "monthly"
                  ? repeatStartingFrom(value, startDate, repeat?.until ?? null)
                  : null
              )
            }
          >
            <SelectTrigger id="event-repeat" className="w-full sm:w-fit">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Does not repeat</SelectItem>
              <SelectItem value="weekly">Every week</SelectItem>
              <SelectItem value="monthly">Every month</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {repeat ? (
          <div className="grid gap-2">
            <FieldLabel
              htmlFor="event-repeat-until"
              hint="The last day a date can fall on. With none, the dates carry on."
            >
              Until
            </FieldLabel>
            <div className="flex gap-2">
              <DatePicker
                id="event-repeat-until"
                value={dayForPicker(repeat.until)}
                placeholder="No end"
                disabled={disabled}
                onChange={(date) =>
                  onChange({
                    ...repeat,
                    until: dayFromPicker(date) || null,
                  })
                }
              />
              {repeat.until ? (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={disabled}
                  onClick={() => onChange({ ...repeat, until: null })}
                >
                  Clear
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {repeat?.freq === "weekly" ? (
        <fieldset className="grid gap-2">
          <legend className="mb-2 text-sm font-medium">On</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {WEEKDAYS.map((weekday) => {
              const checked = repeat.weekdays.includes(weekday)
              return (
                <label
                  key={weekday}
                  className="flex items-center gap-2 text-sm"
                >
                  <Checkbox
                    checked={checked}
                    disabled={disabled}
                    aria-label={weekdayName(weekday)}
                    onCheckedChange={() =>
                      onChange({
                        ...repeat,
                        weekdays: checked
                          ? repeat.weekdays.filter((day) => day !== weekday)
                          : [...repeat.weekdays, weekday].sort((a, b) => a - b),
                      })
                    }
                  />
                  {weekdayShortName(weekday)}
                </label>
              )
            })}
          </div>
        </fieldset>
      ) : null}

      {repeat?.freq === "monthly" ? (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="grid gap-2">
            <FieldLabel htmlFor="event-repeat-week">Week</FieldLabel>
            <Select
              value={String(repeat.week)}
              disabled={disabled}
              onValueChange={(value) =>
                onChange({ ...repeat, week: Number(value) as RepeatWeek })
              }
            >
              <SelectTrigger id="event-repeat-week" className="w-full sm:w-fit">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REPEAT_WEEKS.map((week) => (
                  <SelectItem key={week} value={String(week)}>
                    {weekName(week)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <FieldLabel htmlFor="event-repeat-weekday">Day</FieldLabel>
            <Select
              value={String(repeat.weekday)}
              disabled={disabled}
              onValueChange={(value) =>
                onChange({ ...repeat, weekday: Number(value) })
              }
            >
              <SelectTrigger
                id="event-repeat-weekday"
                className="w-full sm:w-fit"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WEEKDAYS.map((weekday) => (
                  <SelectItem key={weekday} value={String(weekday)}>
                    {weekdayName(weekday)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      ) : null}

      {repeat ? (
        <RepeatSummary repeat={repeat} startDate={startDate} problem={problem} />
      ) : null}
    </CollapsibleSettingsCard>
  )
}

function RepeatSummary({
  repeat,
  startDate,
  problem,
}: {
  repeat: RepeatRule
  startDate: string
  problem: string | null
}) {
  if (repeat.freq === "weekly" && repeat.weekdays.length === 0) {
    return (
      <p className="text-sm text-destructive" role="status">
        Pick at least one day.
      </p>
    )
  }
  if (!isValidDateString(startDate)) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        {describeRepeat(repeat)}. Pick a start day to see the dates.
      </p>
    )
  }
  if (problem) {
    return (
      <p className="text-sm text-destructive" role="status">
        {problem}
      </p>
    )
  }
  return (
    <div className="grid gap-1 text-sm" role="status">
      <p className="font-medium">{describeRepeat(repeat)}.</p>
      <p className="text-muted-foreground">
        First dates: {repeatDatesText(firstRepeatDates(repeat, startDate, PREVIEW_DATES))}
      </p>
    </div>
  )
}

/**
 * A main event's dates, soonest first. Each one opens in its own window, where
 * a change applies to that date only.
 */
export function EventDatesCard({
  series,
  disabled,
  onOpenDate,
}: {
  series: EventSeries
  disabled: boolean
  onOpenDate: (id: string) => void
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Later dates ({series.dates.length})</CardTitle>
        <CardDescription>
          This event is the first date. Open a later one to change it on its
          own.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <ScrollArea className="max-h-72 rounded-md border">
          <ul className="divide-y">
            {series.dates.map((date) => {
              const past = date.startDate < series.today
              return (
                <li key={date.id}>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onOpenDate(date.id)}
                    className={cn(
                      "flex w-full flex-wrap items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent/40",
                      focusRingInset
                    )}
                  >
                    <span
                      className={past ? "text-muted-foreground" : "font-medium"}
                    >
                      {formatEventShortDay(date.startDate)},{" "}
                      {formatEventClock(date.startTime)}
                    </span>
                    {past ? <Badge variant="outline">Past</Badge> : null}
                    {date.status === "draft" ? (
                      <Badge variant="outline">Draft</Badge>
                    ) : null}
                    {date.editedAlone ? (
                      <Badge variant="secondary">Changed on its own</Badge>
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ul>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}

/** On one date of a repeating event: whose date it is, and a way back. */
export function SeriesDateCard({
  main,
  editedAlone,
  disabled,
  onOpenMain,
}: {
  main: { id: string; title: string }
  editedAlone: boolean
  disabled: boolean
  onOpenMain: () => void
}) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Repeat</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          One date of {main.title}.{" "}
          {editedAlone
            ? "It was changed on its own, so changes to the main event skip it."
            : "Saving here changes this date only, and changes to the main event skip it after that."}
        </p>
        <Button
          type="button"
          variant="outline"
          className="shrink-0"
          disabled={disabled}
          onClick={onOpenMain}
        >
          Open main event
        </Button>
      </CardContent>
    </Card>
  )
}
