import type { CheckinPage } from "@/lib/api/project/checkins"
import type { TaskCard } from "@/lib/api/project/tasks"

/**
 * Today's picks in my own order, from the check-in's page of data. A pick can
 * be a carried-over task since handed to someone else, so they are read from
 * the check-in rather than from my own tasks.
 */
export function todaysPicks(page: CheckinPage): TaskCard[] {
  const byId = new Map(page.groups.flatMap((group) => group.tasks).map((task) => [task.id, task]))
  return page.pickedTaskIds.flatMap((id) => byId.get(id) ?? [])
}
