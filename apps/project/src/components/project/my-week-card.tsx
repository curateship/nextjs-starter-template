import * as React from "react"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { toast } from "sonner"

import { PanelCard } from "@/components/project/panel-card"
import { Button } from "@/components/ui/button"
import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import { loadWeek, type MyWeek, type MyWeekTask } from "@/lib/api/project/checkins"
import { addDays, dayLabel } from "@/lib/project/days"
import { getProjectErrorMessage } from "@/lib/project/errors"

type Loaded = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; week: MyWeek }

/**
 * My week, a card on My dashboard's left panel: from Monday to today, what I
 * finished, carried over and dropped, and how many work days I checked in.
 * Arrows step back a week at a time, up to 12 weeks. Read from my own saved
 * check-ins, and nobody else can read it, not the owner or an admin.
 */
export function MyWeekSection({ reload }: { reload: unknown }) {
  const [monday, setMonday] = React.useState<string | undefined>(undefined)
  const [loaded, setLoaded] = React.useState<Loaded>({ state: "loading" })
  const [tries, setTries] = React.useState(0)

  React.useEffect(() => {
    let live = true
    loadWeek(monday).then(
      (week) => live && setLoaded({ state: "ready", week }),
      (error: unknown) => live && setLoaded({ state: "error", message: getProjectErrorMessage(error) })
    )
    return () => {
      live = false
    }
  }, [monday, tries, reload])

  const week = loaded.state === "ready" ? loaded.week : null
  const step = (days: number) => {
    if (!week) return
    if (days < 0 && week.monday <= week.firstMonday) {
      toast.message("My week goes back 12 weeks.")
      return
    }
    if (days > 0 && week.monday >= week.thisMonday) {
      toast.message("This is the current week.")
      return
    }
    setMonday(addDays(week.monday, days))
  }

  return (
    <PanelCard
      storageId="project-my-week"
      title="My week"
      meta={week ? weekSpan(week.monday, week.lastDay) : undefined}
    >
      {loaded.state === "loading" && !week ? (
        <LoadingRow label="Loading your week…" />
      ) : loaded.state === "error" ? (
        <ErrorRow message={loaded.message} onRetry={() => setTries((n) => n + 1)} />
      ) : week ? (
        <WeekLines
          week={week}
          arrows={
            <div className="flex shrink-0 gap-1">
              <Button type="button" variant="outline" size="icon-sm" aria-label="The week before" onClick={() => step(-7)}>
                <ChevronLeftIcon className="size-4" />
              </Button>
              <Button type="button" variant="outline" size="icon-sm" aria-label="The week after" onClick={() => step(7)}>
                <ChevronRightIcon className="size-4" />
              </Button>
            </div>
          }
        />
      ) : null}
      <p className="text-xs text-muted-foreground">Only you see this.</p>
    </PanelCard>
  )
}

/** "Oct 12 to 13" inside one month, "Sep 29 to Oct 3" across two. */
function weekSpan(monday: string, lastDay: string) {
  const first = dayLabel(monday)
  const last = dayLabel(lastDay)
  if (monday === lastDay) return first
  const [firstMonth] = first.split(" ")
  const [lastMonth, ...rest] = last.split(" ")
  return firstMonth === lastMonth && rest.length === 1 ? `${first} to ${rest[0]}` : `${first} to ${last}`
}

function WeekLines({ week, arrows }: { week: MyWeek; arrows: React.ReactNode }) {
  const share = week.workDays ? Math.round((week.checkedIn / week.workDays) * 100) : 0
  return (
    <div className="grid min-w-0 gap-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0">
          {week.workDays
            ? `Checked in on ${week.checkedIn} of ${week.workDays} work ${week.workDays === 1 ? "day" : "days"}`
            : "No work days saved yet this week"}
        </p>
        {arrows}
      </div>
      {week.workDays ? (
        <div
          role="progressbar"
          aria-label="Work days checked in"
          aria-valuemin={0}
          aria-valuemax={week.workDays}
          aria-valuenow={week.checkedIn}
          className="h-1.5 overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full rounded-full bg-foreground" style={{ width: `${share}%` }} />
        </div>
      ) : null}
      <div className="grid gap-2">
        <TaskGroup label="Finished" tasks={week.finished} />
        <TaskGroup label="Carried over" tasks={week.carriedOver} />
        <TaskGroup label="Dropped" tasks={week.dropped} />
      </div>
    </div>
  )
}

/** "Finished 3", then the titles, a drop with its reason. A group with nothing in it reads "None". */
function TaskGroup({ label, tasks }: { label: string; tasks: (MyWeekTask & { reason?: string })[] }) {
  return (
    <div className="grid gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">{label}</span>
        <span>{tasks.length ? tasks.length : "None"}</span>
      </div>
      {tasks.length ? (
        <ul className="grid gap-0.5 pl-3 text-xs text-muted-foreground">
          {tasks.map((task, index) => (
            <li key={`${task.taskId ?? task.title}-${index}`} className="break-words">
              {task.title}
              {task.reason ? `: ${task.reason}` : ""}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
