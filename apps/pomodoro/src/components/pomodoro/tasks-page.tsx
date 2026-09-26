import * as React from "react"
import { PlusIcon } from "lucide-react"

import { ProjectsCard } from "@/components/pomodoro/projects-card"
import { TodayTaskList } from "@/components/pomodoro/today-task-list"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { InlineError } from "@/components/ui/inline-error"
import { Input } from "@/components/ui/input"
import { LoadingRow } from "@/components/ui/loading-row"
import { usePomodoro } from "@/lib/pomodoro/use-pomodoro"

const archiveStatusLabels: Record<string, string> = {
  completed: "Completed",
  carried: "Carried over",
  abandoned: "Abandoned",
}

/**
 * The tasks page: today's plan and the archive of past days, ported from
 * the old app's TasksPage. Unfinished tasks from earlier days are already
 * copied onto today by the load itself (the rollover), so the archive only
 * ever shows settled rows.
 */
export function TasksPage() {
  const pomodoro = usePomodoro()
  const [title, setTitle] = React.useState("")
  const completed = pomodoro.tasks.filter((task) => task.completed).length
  const archiveItems = pomodoro.archive.map((task) => ({
    ...task,
    dateLabel: new Date(`${task.plannedDate}T12:00:00`).toLocaleDateString(
      undefined,
      { weekday: "short", month: "short", day: "numeric" }
    ),
  }))
  const archiveGroups = [
    ...archiveItems.reduce((groups, task) => {
      groups.set(task.dateLabel, [...(groups.get(task.dateLabel) ?? []), task])
      return groups
    }, new Map<string, typeof archiveItems>()),
  ]

  return (
    <>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 py-8">
        <header>
          <h2 className="text-2xl font-bold tracking-tight">Tasks</h2>
          <p className="text-sm text-muted-foreground">
            What you’re focusing on today.
          </p>
        </header>
        {pomodoro.syncError ? (
          <InlineError>{pomodoro.syncError}</InlineError>
        ) : null}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Today</CardTitle>
            <span className="text-xs text-muted-foreground">
              {completed} / {pomodoro.tasks.length} done
            </span>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <TodayTaskList pomodoro={pomodoro} />
            <form
              className="relative"
              onSubmit={(event) => {
                event.preventDefault()
                pomodoro.addTask(title)
                setTitle("")
              }}
            >
              <PlusIcon
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={160}
                placeholder="Add a task, press Enter…"
                aria-label="New task"
                className="pl-9"
              />
            </form>
          </CardContent>
        </Card>

        <ProjectsCard pomodoro={pomodoro} />

        <section className="flex flex-col gap-3">
          <header className="flex items-baseline justify-between">
            <h2 className="text-lg font-bold tracking-tight">Archive</h2>
            <span className="text-xs text-muted-foreground">
              {archiveItems.length} past tasks
            </span>
          </header>
          {pomodoro.loading && !archiveItems.length ? (
            <LoadingRow label="Loading past days…" className="py-4" />
          ) : null}
          {!pomodoro.loading && !pomodoro.loadFailed && !archiveItems.length ? (
            <p className="text-sm text-muted-foreground">
              Past days will show up here once a task list rolls over.
            </p>
          ) : null}
          {archiveGroups.map(([date, tasks]) => (
            <div key={date} className="flex flex-col gap-1.5">
              <h3 className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {date}
              </h3>
              {tasks.map((task) => (
                <article
                  key={task.id}
                  className="flex min-h-10 items-center gap-3 rounded-lg border bg-card/50 px-3"
                >
                  <span className="flex-1 truncate text-sm">{task.title}</span>
                  <small className="font-mono text-[10px] text-muted-foreground">
                    {task.pomodoroCount}{" "}
                    {task.pomodoroCount === 1 ? "pomo" : "pomos"}
                  </small>
                  <b
                    className={
                      task.status === "completed"
                        ? "text-xs font-semibold text-[var(--p-success)]"
                        : task.status === "carried"
                          ? "text-xs font-semibold text-[var(--p-accent-2)]"
                          : "text-xs font-semibold text-muted-foreground"
                    }
                  >
                    {archiveStatusLabels[task.status] ?? task.status}
                  </b>
                </article>
              ))}
            </div>
          ))}
        </section>
      </div>
    </>
  )
}
