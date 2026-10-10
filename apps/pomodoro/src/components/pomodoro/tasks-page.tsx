import * as React from "react"
import { ChevronDownIcon, ChevronUpIcon, Loader2Icon } from "lucide-react"

import { PanelCard } from "@/components/pomodoro/panel-card"
import { PlannedDayList } from "@/components/pomodoro/planned-day-list"
import { ProjectsCard } from "@/components/pomodoro/projects-card"
import {
  NewTaskForm,
  TodayTaskList,
} from "@/components/pomodoro/today-task-list"
import { Button } from "@/components/ui/button"
import { Meter } from "@/components/ui/meter"
import { InlineError } from "@/components/ui/inline-error"
import { LoadingRow } from "@/components/ui/loading-row"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useProductAuth } from "@/lib/pomodoro/auth-state"
import { planningDays } from "@/lib/pomodoro/plan-ahead"
import { describeArchiveCount } from "@/lib/pomodoro/task-archive"
import { usePomodoro, type ArchivedTask } from "@/lib/pomodoro/use-pomodoro"
import { loadArchivePage } from "@/lib/api/pomodoro/productivity"
import { showErrorToast } from "@/lib/toast/error-toast"
import { plural } from "@/lib/format/plural"
import { contentColumn } from "@/lib/pomodoro/content-column"
import { cn } from "@/lib/utils"

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

  const [pastOpen, setPastOpen] = React.useState(true)
  const dayTaskCount = (date: string, index: number) =>
    index ? plannedCount(date) : pomodoro.tasks.length
  const progressShare = pomodoro.tasks.length
    ? completed / pomodoro.tasks.length
    : 0

  return (
    <>
      <div className={`${contentColumn} flex flex-col gap-6 py-8`}>
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="title-halo flex flex-col gap-2">
            <h2 className="text-4xl font-bold tracking-tight">Tasks</h2>
            <p className="text-muted-foreground">
              {days.length
                ? "What you’re focusing on today, and the six days after it."
                : "What you’re focusing on today."}
            </p>
          </div>
          {tagOptions.length ? (
            <Select value={tagFilter ?? ALL_TAGS} onValueChange={setChosenTag}>
              <SelectTrigger
                size="default"
                className="rounded-full"
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
        </header>
        {pomodoro.syncError ? (
          <InlineError>{pomodoro.syncError}</InlineError>
        ) : null}
        {days.length ? (
          // Seven day cards: the weekday, the date, and a dot for each task
          // planned (up to five). Still a tab row underneath, so the arrow
          // keys move between days and a screen reader hears a tab list.
          <Tabs value={day ?? undefined} onValueChange={setChosenDay}>
            <TabsList
              aria-label="Day to plan"
              className="grid h-auto w-full grid-cols-7 gap-1.5 bg-transparent p-0 sm:gap-3 [&>[data-slot=tabs-pill]]:hidden"
            >
              {days.map((date, index) => {
                const count = dayTaskCount(date, index)
                const longName = noonOf(date).toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })
                return (
                  <TabsTrigger
                    key={date}
                    value={date}
                    aria-label={
                      index
                        ? `${longName}, ${count} ${count === 1 ? "task" : "tasks"} planned`
                        : `Today, ${longName}, ${count} ${count === 1 ? "task" : "tasks"}`
                    }
                    className="flex h-auto min-w-0 flex-col gap-1 rounded-2xl border bg-[var(--p-surface)] px-1 py-3 text-foreground data-[state=active]:border-[color:var(--p-accent)] data-[state=active]:bg-[color:var(--p-accent)]/12 sm:py-4"
                  >
                    <span
                      className={cn(
                        "font-mono text-[10px] uppercase tracking-[0.15em] sm:text-[11px]",
                        index ? "text-muted-foreground" : "text-[var(--p-accent)]"
                      )}
                    >
                      {index
                        ? noonOf(date).toLocaleDateString(undefined, {
                            weekday: "short",
                          })
                        : "Today"}
                    </span>
                    <span className="text-xl font-bold sm:text-3xl">
                      {noonOf(date).getDate()}
                    </span>
                    <span aria-hidden="true" className="flex h-1.5 gap-1">
                      {Array.from({ length: Math.min(count, 5) }, (_, dot) => (
                        <i
                          key={dot}
                          className="size-1.5 rounded-full bg-[var(--p-accent)]"
                        />
                      ))}
                    </span>
                  </TabsTrigger>
                )
              })}
            </TabsList>
          </Tabs>
        ) : null}
        {/* The same flat rows and frameless add box as the timer's Tasks
            card, with the add box under its own full-width divider. */}
        <section
          aria-label={viewingToday ? "Today" : dayName}
          className="overflow-hidden rounded-[24px] border bg-[var(--p-surface)]"
        >
          <header className="flex flex-wrap items-center justify-between gap-3 px-6 pb-2 pt-5">
            <h3 className="font-mono text-[11px] font-normal uppercase tracking-[0.2em] text-muted-foreground">
              {viewingToday
                ? `Today${dayName ? ` · ${dayName}` : ""}`
                : dayName}
            </h3>
            {/* "0 / 0 done" over an empty list counts nothing, so the count
                waits for the first task. */}
            {viewingToday ? (
              pomodoro.tasks.length ? (
                <span className="flex items-center gap-3 font-mono text-xs text-muted-foreground">
                  <Meter
                    size="sm"
                    className="w-24"
                    label="Today's tasks done"
                    value={progressShare * 100}
                    valueText={`${completed} of ${pomodoro.tasks.length} done`}
                  />
                  {completed} / {pomodoro.tasks.length} done
                </span>
              ) : null
            ) : (
              <span className="font-mono text-xs text-muted-foreground">
                {day ? plannedCount(day) : 0} planned
              </span>
            )}
          </header>
          {viewingToday || !day ? (
            <>
              <div className="px-3 pb-2">
                <TodayTaskList
                  pomodoro={pomodoro}
                  tagFilter={tagFilter}
                  flat
                />
              </div>
              <div className="border-t px-3 py-3">
                <NewTaskForm onAdd={pomodoro.addTask} bare />
              </div>
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
        </section>

        <ProjectsCard pomodoro={pomodoro} />

        <PanelCard
          label={describeArchiveCount(archiveItems.length, archive.hasOlder)}
          aside={
            archiveItems.length ? (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                aria-expanded={pastOpen}
                onClick={() => setPastOpen((open) => !open)}
              >
                {pastOpen ? "Hide" : "Show"}
                {pastOpen ? (
                  <ChevronUpIcon aria-hidden="true" />
                ) : (
                  <ChevronDownIcon aria-hidden="true" />
                )}
              </Button>
            ) : null
          }
        >
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
          {pastOpen
            ? archiveGroups.map(([date, tasks]) => (
                <div key={date} className="flex flex-col">
                  <h4 className="pb-2 font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
                    {tasks[0]?.dateLabel}
                  </h4>
                  {tasks.map((task) => (
                    <article
                      key={task.id}
                      className="flex min-h-12 items-center gap-3"
                    >
                      <i
                        aria-hidden="true"
                        className={cn(
                          "size-2 shrink-0 rounded-full",
                          task.status === "completed"
                            ? "bg-[var(--p-success)]"
                            : "bg-muted-foreground/60"
                        )}
                      />
                      <span className="flex-1 truncate">{task.title}</span>
                      <small className="font-mono text-xs text-muted-foreground">
                        {task.pomodoroCount}{" "}
                        {plural(task.pomodoroCount, "session")}
                      </small>
                      <b
                        className={cn(
                          "w-24 text-right text-sm font-normal",
                          task.status === "completed"
                            ? "text-[var(--p-success)]"
                            : "text-muted-foreground"
                        )}
                      >
                        {archiveStatusLabels[task.status] ?? task.status}
                      </b>
                    </article>
                  ))}
                </div>
              ))
            : null}
          {pastOpen && archive.hasOlder ? (
            <Button
              type="button"
              variant="outline"
              className="self-start rounded-full"
              disabled={archive.loadingOlder}
              onClick={() => void archive.showOlder()}
            >
              {archive.loadingOlder ? (
                <Loader2Icon className="animate-spin" aria-hidden="true" />
              ) : null}
              {archive.loadingOlder ? "Loading older days…" : "Show older"}
            </Button>
          ) : pastOpen && archive.pagedBack ? (
            <p className="text-sm text-muted-foreground">
              That is everything, back to your first day.
            </p>
          ) : null}
        </PanelCard>
      </div>
    </>
  )
}
