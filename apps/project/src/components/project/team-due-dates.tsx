import { ListTodoIcon } from "lucide-react"

import { StatusBadge } from "@/components/project/task-bits"
import type { TeamDueTask } from "@/lib/api/project/checkins"
import { plural } from "@/lib/format/plural"
import { PROJECT_COLOR_DOT } from "@/lib/project/rules"
import { cn } from "@/lib/utils"

/** Due tasks named in one calendar square before "+4 more". */
const NAMED_PER_DAY = 2

/**
 * A month square's due tasks: the first two by name with their project's
 * colour, then "+4 more". A phone's square has room for "3 due" only. The
 * square is a button, so nothing in it opens a task: the list under the
 * calendar does.
 */
export function DueChips({ tasks }: { tasks: readonly TeamDueTask[] }) {
  if (tasks.length === 0) return null
  const hidden = tasks.length - NAMED_PER_DAY
  return (
    <>
      <span className="flex max-w-full items-center gap-0.5 rounded border px-1 py-0.5 text-muted-foreground sm:hidden">
        <ListTodoIcon className="size-3 shrink-0" aria-hidden />
        {tasks.length}
      </span>
      {tasks.slice(0, NAMED_PER_DAY).map((task) => (
        <span
          key={task.id}
          className="flex w-full min-w-0 items-center gap-1 rounded border px-1.5 py-0.5 max-sm:hidden"
        >
          <span aria-hidden className={cn("size-1.5 shrink-0 rounded-full", PROJECT_COLOR_DOT[task.projectColor])} />
          <span className="truncate">{task.title}</span>
        </span>
      ))}
      {hidden > 0 ? <span className="px-1.5 text-muted-foreground max-sm:hidden">+{hidden} more</span> : null}
    </>
  )
}

/**
 * Under the calendar while "Due dates" is on: the chosen day's due tasks,
 * each opening its task window.
 */
export function DayDueTasks({
  tasks,
  onOpenTask,
}: {
  tasks: readonly TeamDueTask[]
  onOpenTask: (taskId: string) => void
}) {
  return (
    <section className="grid gap-3 border-t p-4" aria-labelledby="day-due-heading">
      <div className="flex items-baseline justify-between gap-2">
        <h3 id="day-due-heading" className="font-medium">
          Due this day
        </h3>
        <span className="shrink-0 text-sm text-muted-foreground">
          {tasks.length ? `${tasks.length} ${plural(tasks.length, "task")}` : "Nothing due"}
        </span>
      </div>
      {tasks.length ? (
        <ul className="grid gap-2">
          {tasks.map((task) => (
            <li key={task.id}>
              <button
                type="button"
                onClick={() => onOpenTask(task.id)}
                className="flex w-full min-w-0 items-center gap-3 rounded-lg border p-3 text-left hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <span aria-hidden className={cn("h-9 w-1 shrink-0 rounded-full", PROJECT_COLOR_DOT[task.projectColor])} />
                <span className="grid min-w-0 flex-1">
                  <span className="truncate font-medium">{task.title}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {task.projectName} · {task.assigneeName ?? "Nobody assigned"}
                  </span>
                </span>
                <StatusBadge status={task.status} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
