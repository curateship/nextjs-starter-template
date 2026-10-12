import * as React from "react"
import { ChevronLeftIcon, ChevronRightIcon, ChartNoAxesColumnIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import { loadWeek, type MyWeek, type MyWeekTask } from "@/lib/api/project/checkins"
import { addDays, dayLabel } from "@/lib/project/days"
import { getProjectErrorMessage } from "@/lib/project/errors"

type Loaded = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; week: MyWeek }

/**
 * My week, on My dashboard's left panel: from Monday to today, what I
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
    // min-w-0: a long line here must never widen the whole panel.
    <section className="grid min-w-0 gap-3" aria-labelledby="my-week-heading">
      <div className="flex items-center justify-between gap-2">
        <div className="grid min-w-0 gap-0.5">
          <h3 id="my-week-heading" className="flex items-center gap-2 text-sm font-medium">
            <ChartNoAxesColumnIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            My week
          </h3>
          {week ? (
            <p className="text-xs text-muted-foreground">
              {dayLabel(week.monday)} to {dayLabel(week.lastDay)}
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="The week before"
            disabled={!week}
            onClick={() => step(-7)}
          >
            <ChevronLeftIcon className="size-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="The week after"
            disabled={!week}
            onClick={() => step(7)}
          >
            <ChevronRightIcon className="size-4" />
          </Button>
        </div>
      </div>
      {loaded.state === "loading" && !week ? (
        <LoadingRow label="Loading your week…" />
      ) : loaded.state === "error" ? (
        <ErrorRow message={loaded.message} onRetry={() => setTries((n) => n + 1)} />
      ) : week ? (
        <WeekLines week={week} />
      ) : null}
      <p className="text-xs text-muted-foreground">Only you see this.</p>
    </section>
  )
}

function WeekLines({ week }: { week: MyWeek }) {
  return (
    <div className="grid gap-2 text-sm">
      <p>
        {week.workDays
          ? `Checked in on ${week.checkedIn} of ${week.workDays} work ${week.workDays === 1 ? "day" : "days"}`
          : "No work days saved yet this week"}
      </p>
      <TaskGroup label="Finished" tasks={week.finished} />
      <TaskGroup label="Carried over" tasks={week.carriedOver} />
      <TaskGroup label="Dropped" tasks={week.dropped} />
    </div>
  )
}

/** "Finished · 3", then the titles, a drop with its reason. A group with nothing in it reads "None". */
function TaskGroup({ label, tasks }: { label: string; tasks: (MyWeekTask & { reason?: string })[] }) {
  if (tasks.length === 0) {
    return <p className="text-muted-foreground">{label} · None</p>
  }
  return (
    <div className="grid gap-1">
      <p>
        {label} · {tasks.length}
      </p>
      <ul className="grid gap-0.5 pl-3 text-xs text-muted-foreground">
        {tasks.map((task, index) => (
          <li key={`${task.taskId ?? task.title}-${index}`} className="break-words">
            {task.title}
            {task.reason ? `: ${task.reason}` : ""}
          </li>
        ))}
      </ul>
    </div>
  )
}
