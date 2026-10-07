import * as React from "react"
import { Loader2Icon } from "lucide-react"

import { PlannedDayList } from "@/components/pomodoro/planned-day-list"
import { ProjectsCard } from "@/components/pomodoro/projects-card"
import {
  NewTaskForm,
  TodayTaskList,
} from "@/components/pomodoro/today-task-list"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { InlineError } from "@/components/ui/inline-error"
import { LoadingRow } from "@/components/ui/loading-row"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsCount, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useProductAuth } from "@/lib/pomodoro/auth-state"
import { planningDays } from "@/lib/pomodoro/plan-ahead"
import { describeArchiveCount } from "@/lib/pomodoro/task-archive"
import { usePomodoro, type ArchivedTask } from "@/lib/pomodoro/use-pomodoro"
import { loadArchivePage } from "@/lib/api/pomodoro/productivity"
import { showErrorToast } from "@/lib/toast/error-toast"
import { plural } from "@/lib/format/plural"

const ALL_TAGS = "all"

/** A local date at noon, so no timezone can move it onto the day before. */
function noonOf(date: string) {
  return new Date(`${date}T12:00:00`)
}

const archiveStatusLabels: Record<string, string> = {
  completed: "Completed",
  abandoned: "Abandoned",
}

/**
 * The archive past what the page loaded with, one whole-days page at a time.
 *
 * Each press asks for the days before the oldest one on screen, so a day can
 * never appear in two places. If the page's own load hands over a first page
 * that ends on a different day (the rollover at midnight), the older pages are
 * dropped, because they were cut against the old one and could leave a gap.
 */
function useOlderArchive(firstPage: ArchivedTask[], firstHasOlder: boolean) {
  const firstOldest = firstPage.at(-1)?.plannedDate ?? null
  const [older, setOlder] = React.useState<{
    after: string | null
    tasks: ArchivedTask[]
    hasOlder: boolean
  } | null>(null)
  const [loadingOlder, setLoadingOlder] = React.useState(false)

  const current = older && older.after === firstOldest ? older : null
  const tasks = current ? [...firstPage, ...current.tasks] : firstPage
  const hasOlder = current ? current.hasOlder : firstHasOlder

  const showOlder = async () => {
    const before = tasks.at(-1)?.plannedDate
    if (!before) return
    setLoadingOlder(true)
    try {
      const page = await loadArchivePage(before)
      setOlder({
        after: firstOldest,
        tasks: [...(current?.tasks ?? []), ...page.tasks],
        hasOlder: page.hasOlder,
      })
    } catch {
      showErrorToast("Older days could not be loaded. Try again.")
    } finally {
      setLoadingOlder(false)
    }
  }

  return {
    tasks,
    hasOlder,
    pagedBack: current !== null,
    loadingOlder,
    showOlder,
  }
}

/**
 * The tasks page: today's plan and the archive of past days, ported from
 * the old app's TasksPage. Unfinished tasks from earlier days are already
 * copied onto today by the load itself (the rollover), so the archive only
 * ever shows settled rows.
 */
export function TasksPage() {
  const pomodoro = usePomodoro()
  const { authenticated } = useProductAuth()
  const [chosenDay, setChosenDay] = React.useState<string | null>(null)
  const [chosenTag, setChosenTag] = React.useState(ALL_TAGS)
  const completed = pomodoro.tasks.filter((task) => task.completed).length

  // Planning ahead needs the server's today, so a guest, who has none, sees
  // today's list only. A day chosen before midnight that has since become
  // today or the past falls back to today on its own.
  const days =
    authenticated && pomodoro.today ? planningDays(pomodoro.today) : []
  const today = days[0] ?? null
  const day = chosenDay && days.includes(chosenDay) ? chosenDay : today
  const viewingToday = !day || day === today
  const dayName = day
    ? noonOf(day).toLocaleDateString(undefined, { weekday: "long" })
    : ""
  const plannedCount = (date: string) =>
    pomodoro.plannedDays.find((entry) => entry.plannedDate === date)?.count ?? 0

  // The tags worth filtering by: the picker's, plus any on today's tasks.
  const tagOptions = [
    ...new Set([
      ...pomodoro.tagNames,
      ...pomodoro.tasks.flatMap((task) => task.tags),
    ]),
  ].sort()
  const tagFilter =
    chosenTag !== ALL_TAGS && tagOptions.includes(chosenTag) ? chosenTag : null
  const archive = useOlderArchive(pomodoro.archive, pomodoro.archiveHasOlder)
  // A carried row's copy is already in Today, or further on in the archive,
  // so listing it as well showed one task twice. Its focus still counts in
  // History, which reads the sessions, not this list.
  const archiveItems = archive.tasks
    .filter((task) => task.status !== "carried")
    .map((task) => ({
      ...task,
      dateLabel: new Date(`${task.plannedDate}T12:00:00`).toLocaleDateString(
        undefined,
        { weekday: "short", month: "short", day: "numeric" }
      ),
    }))
  const archiveGroups = [
    ...archiveItems.reduce((groups, task) => {
      groups.set(task.plannedDate, [
        ...(groups.get(task.plannedDate) ?? []),
        task,
      ])
      return groups
    }, new Map<string, typeof archiveItems>()),
  ]

  return (
    <>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 py-8">
        <header>
          <h2 className="text-2xl font-bold tracking-tight">Tasks</h2>
          <p className="text-sm text-muted-foreground">
            {days.length
              ? "What you’re focusing on today, and the six days after it."
              : "What you’re focusing on today."}
          </p>
        </header>
        {pomodoro.syncError ? (
          <InlineError>{pomodoro.syncError}</InlineError>
        ) : null}
        {days.length || tagOptions.length ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            {days.length ? (
              <ScrollArea className="max-w-full">
                <Tabs value={day ?? undefined} onValueChange={setChosenDay}>
                  <TabsList aria-label="Day to plan">
                    {days.map((date, index) => {
                      const count = index ? plannedCount(date) : 0
                      const longName = noonOf(date).toLocaleDateString(
                        undefined,
                        { weekday: "long", month: "long", day: "numeric" }
                      )
                      return (
                        <TabsTrigger
                          key={date}
                          value={date}
                          className="px-2.5"
                          aria-label={
                            index
                              ? `${longName}, ${count} ${count === 1 ? "task" : "tasks"} planned`
                              : `Today, ${longName}`
                          }
                        >
                          {index
                            ? noonOf(date).toLocaleDateString(undefined, {
                                weekday: "short",
                              })
                            : "Today"}
                          {count ? <TabsCount>{count}</TabsCount> : null}
                        </TabsTrigger>
                      )
                    })}
                  </TabsList>
                </Tabs>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            ) : null}
            {tagOptions.length ? (
              <Select
                value={tagFilter ?? ALL_TAGS}
                onValueChange={setChosenTag}
              >
                <SelectTrigger
                  size="default"
                  className="text-xs"
                  aria-label="Show tasks with this tag"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_TAGS}>All tags</SelectItem>
                  {tagOptions.map((tag) => (
                    <SelectItem key={tag} value={tag}>
                      #{tag}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
          </div>
        ) : null}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>{viewingToday ? "Today" : dayName}</CardTitle>
            {/* "0 / 0 done" over an empty list counts nothing, so the count
                waits for the first task. */}
            {viewingToday ? (
              pomodoro.tasks.length ? (
                <span className="text-xs text-muted-foreground">
                  {completed} / {pomodoro.tasks.length} done
                </span>
              ) : null
            ) : (
              <span className="text-xs text-muted-foreground">
                {day ? plannedCount(day) : 0} planned
              </span>
            )}
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {viewingToday || !day ? (
              <>
                <TodayTaskList pomodoro={pomodoro} tagFilter={tagFilter} />
                <NewTaskForm onAdd={pomodoro.addTask} />
              </>
            ) : (
              <PlannedDayList
                key={day}
                plannedDate={day}
                dayName={dayName}
                pomodoro={pomodoro}
                tagFilter={tagFilter}
              />
            )}
          </CardContent>
        </Card>

        <ProjectsCard pomodoro={pomodoro} />

        <section className="flex flex-col gap-3">
          <header className="flex items-baseline justify-between">
            <h2 className="text-lg font-bold tracking-tight">Archive</h2>
            {archiveItems.length ? (
              <span className="text-xs text-muted-foreground">
                {describeArchiveCount(archiveItems.length, archive.hasOlder)}
              </span>
            ) : null}
          </header>
          {pomodoro.loading && !archiveItems.length ? (
            <LoadingRow label="Loading past days…" className="py-4" />
          ) : null}
          {!pomodoro.loading && !pomodoro.loadFailed && !archiveItems.length ? (
            <p className="text-sm text-muted-foreground">
              {/* Past days that only held unfinished tasks: those moved on,
                  so there is nothing of theirs left to list. */}
              {archive.tasks.length
                ? "Nothing was finished or abandoned on these days. Unfinished tasks moved on to Today."
                : "Past days will show up here once a task list rolls over."}
            </p>
          ) : null}
          {archiveGroups.map(([date, tasks]) => (
            <div key={date} className="flex flex-col gap-1.5">
              <h3 className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {tasks[0]?.dateLabel}
              </h3>
              {tasks.map((task) => (
                <article
                  key={task.id}
                  className="flex min-h-10 items-center gap-3 rounded-lg border bg-card/50 px-3"
                >
                  <span className="flex-1 truncate text-sm">{task.title}</span>
                  <small className="font-mono text-[10px] text-muted-foreground">
                    {task.pomodoroCount} {plural(task.pomodoroCount, "session")}
                  </small>
                  <b
                    className={
                      task.status === "completed"
                        ? "text-xs font-semibold text-[var(--p-success)]"
                        : "text-xs font-semibold text-muted-foreground"
                    }
                  >
                    {archiveStatusLabels[task.status] ?? task.status}
                  </b>
                </article>
              ))}
            </div>
          ))}
          {archive.hasOlder ? (
            <Button
              type="button"
              variant="outline"
              className="self-start"
              disabled={archive.loadingOlder}
              onClick={() => void archive.showOlder()}
            >
              {archive.loadingOlder ? (
                <Loader2Icon className="animate-spin" aria-hidden="true" />
              ) : null}
              {archive.loadingOlder ? "Loading older days…" : "Show older"}
            </Button>
          ) : archive.pagedBack ? (
            <p className="text-sm text-muted-foreground">
              That is everything, back to your first day.
            </p>
          ) : null}
        </section>
      </div>
    </>
  )
}
