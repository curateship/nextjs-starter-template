import * as React from "react"

import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import { Meter } from "@/components/ui/meter"
import { PanelCard } from "@/components/pomodoro/panel-card"
import {
  loadFocusGroupEvents,
  loadFocusGroupPastWeeks,
  loadFocusGroupStanding,
} from "@/lib/api/pomodoro/groups"
import { formatDateTime, formatUtcDate } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { formatFocusDuration } from "@/lib/pomodoro/focus-history"
import { groupEventLine } from "@/lib/pomodoro/groups"
import { dismissErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

/** One read of a group's figure, with its own failure and Try again. */
function useGroupRead<T>(
  load: (groupId: string) => Promise<T>,
  groupId: string,
  version: string | number
) {
  const [value, setValue] = React.useState<T | null>(null)
  const [failed, setFailed] = React.useState(false)
  const [attempt, setAttempt] = React.useState(0)
  React.useEffect(() => {
    let cancelled = false
    void load(groupId)
      .then((loaded) => {
        if (cancelled) return
        setFailed(false)
        setValue(loaded)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [load, groupId, version, attempt])
  const retry = () => {
    dismissErrorToast()
    setFailed(false)
    setAttempt((count) => count + 1)
  }
  return { value, failed, retry }
}

/** "Oct 5 to Oct 11", for a finished Monday-to-Sunday week. */
function weekLabel(start: string, end: string) {
  const day = (value: string) =>
    formatUtcDate(`${value}T00:00:00Z`).replace(/, \d{4}$/, "")
  return `${day(start)} to ${day(end)}`
}

/**
 * What sits under a group's name on its card (groups task 01, parts 18, 20
 * and 22): the group streak, this week's hours against the weekly goal, and
 * the milestones reached. A group with no hours yet shows nothing here
 * rather than a row of zeros.
 */
export function GroupStanding({
  groupId,
  version,
}: {
  groupId: string
  /** Moves when the goal or the members change, to read it again. */
  version: string
}) {
  const standing = useGroupRead(loadFocusGroupStanding, groupId, version)
  if (standing.failed)
    return (
      <ErrorRow
        message="The group's streak and goal could not be loaded."
        onRetry={standing.retry}
      />
    )
  if (!standing.value) return null
  const { streakDays, weekSeconds, weeklyGoalHours, milestones } = standing.value
  const weekHours = Math.floor(weekSeconds / 3600)
  const highest = milestones[milestones.length - 1]

  return (
    <div className="flex flex-col gap-3">
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span>
          {streakDays > 0
            ? `${streakDays} ${plural(streakDays, "day")} in a row with somebody focusing`
            : "No group streak yet. One session from anybody starts it."}
        </span>
        {highest ? (
          <span>Passed {highest.toLocaleString("en-US")} hours together</span>
        ) : null}
      </p>
      {weeklyGoalHours !== null ? (
        <div className="grid gap-1.5">
          <span className="text-sm">
            {weekHours} of {weeklyGoalHours}{" "}
            {plural(weeklyGoalHours, "hour")} this week
            {weekSeconds >= weeklyGoalHours * 3600 ? ". Goal reached." : ""}
          </span>
          <Meter
            value={Math.min(weekSeconds, weeklyGoalHours * 3600)}
            max={weeklyGoalHours * 3600}
            label="This week's hours against the weekly goal"
            valueText={`${weekHours} of ${weeklyGoalHours} hours`}
            tone={weekSeconds >= weeklyGoalHours * 3600 ? "positive" : "default"}
          />
        </div>
      ) : null}
    </div>
  )
}

/** "1st", "2nd", "3rd". */
const PLACE_WORDS = ["1st", "2nd", "3rd"]

/**
 * Past weeks' top three (part 21), the last eight finished weeks.
 *
 * Tyler, 13 Oct 2026: "organize this better. I have no idea what im looking
 * at" (`workspace/docs/assets/pasted-image-1791913736785452000.png`). So the
 * panel says what it is in a sentence, each week is its own block with the
 * week named on top, and each place is a row of place, name and time with
 * the times lined up on the right, the way the board reads. Weeks nobody
 * focused are counted in one line at the end rather than listed one by one.
 *
 * Worked out from today's members each time, so somebody who left is no
 * longer in old weeks; the panel says so.
 */
export function PastWeeksCard({
  groupId,
  version,
}: {
  groupId: string
  version: string
}) {
  const weeks = useGroupRead(loadFocusGroupPastWeeks, groupId, version)
  const withFocus = weeks.value?.filter((week) => week.top.length > 0) ?? []
  const empty = (weeks.value?.length ?? 0) - withFocus.length

  return (
    <PanelCard label="Past weeks" note="last 8 weeks">
      {weeks.failed ? (
        <ErrorRow message="Past weeks could not be loaded." onRetry={weeks.retry} />
      ) : weeks.value === null ? (
        <LoadingRow label="Loading past weeks" />
      ) : withFocus.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No finished week has any focus in it yet. Each Monday, last
          week&apos;s top three show here.
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Who came first, second and third in each week, Monday to Sunday.
          </p>
          <ol className="-mx-5 flex flex-col sm:-mx-6">
            {withFocus.map((week) => (
              <li
                key={week.start}
                className="flex flex-col gap-2 border-t px-5 py-4 sm:px-6"
              >
                <h4 className="text-sm font-semibold">
                  {weekLabel(week.start, week.end)}
                </h4>
                <ol className="flex flex-col gap-1.5">
                  {week.top.map((row, index) => (
                    <li
                      key={`${week.start}-${index}`}
                      className={cn(
                        "flex items-baseline gap-3 text-sm",
                        row.isYou && "font-semibold"
                      )}
                    >
                      <span className="w-8 shrink-0 font-mono text-xs text-muted-foreground">
                        {PLACE_WORDS[index]}
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        {row.name ?? "Someone"}
                        {row.isYou ? " (you)" : ""}
                      </span>
                      <span className="shrink-0 font-mono tabular-nums">
                        {formatFocusDuration(row.focusSeconds)}
                      </span>
                    </li>
                  ))}
                </ol>
              </li>
            ))}
          </ol>
          {empty > 0 ? (
            <p className="text-sm text-muted-foreground">
              Nobody focused in the other {empty} {plural(empty, "week")}.
            </p>
          ) : null}
        </>
      )}
      <p className="text-xs text-muted-foreground">
        Uses the people in the group today, so somebody who left is not listed
        in old weeks.
      </p>
    </PanelCard>
  )
}

/** The owner's Activity panel (part 23): the last 50 things that happened. */
export function GroupActivityCard({
  groupId,
  version,
}: {
  groupId: string
  version: string
}) {
  const events = useGroupRead(loadFocusGroupEvents, groupId, version)
  return (
    <PanelCard label="Activity" note="only the owner sees this">
      {events.failed ? (
        <ErrorRow message="The activity could not be loaded." onRetry={events.retry} />
      ) : events.value === null ? (
        <LoadingRow label="Loading the activity" />
      ) : events.value.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing yet. Joins, leaves, removals and changes to the name or the
          link show here.
        </p>
      ) : (
        <ul className="flex flex-col gap-2 text-sm">
          {events.value.map((event) => (
            <li key={event.id} className="flex flex-wrap justify-between gap-x-3">
              <span className="min-w-0 break-words">
                {groupEventLine(event.kind, event.name)}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatDateTime(event.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </PanelCard>
  )
}
