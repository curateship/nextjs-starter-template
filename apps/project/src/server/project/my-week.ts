import { and, asc, eq, gte, inArray, lte } from "drizzle-orm"

import { addDays, weekdayOf } from "@/lib/project/days"
import { PROJECT_ERRORS } from "@/lib/project/errors"
import { MY_WEEK_BACK } from "@/lib/project/rules"
import { db } from "@/server/db"
import { loadClock, personDay } from "@/server/project/checkins"
import { projectCheckinItems, projectCheckins, projectTasks } from "@/server/project/schema"

/**
 * My week, on My dashboard: from Monday to today of one week of my own
 * calendar, what I finished, what I carried over, what I dropped (with the
 * reasons), and how many work days I checked in. Read only from my saved
 * check-in rows, and only ever shown to me: not to the owner, not to an
 * admin. Tyler left out the weekly manager email, and the check-in isn't for
 * watching people.
 */

export type MyWeekTask = { taskId: string | null; title: string }

export type MyWeek = {
  /** The Monday the week starts on. */
  monday: string
  /** The last day counted: Sunday, or today in this week. */
  lastDay: string
  /** The Monday of this week, so the screen knows when to stop stepping forward. */
  thisMonday: string
  /** The earliest Monday it may step back to. */
  firstMonday: string
  /** Work days I checked in on. */
  checkedIn: number
  /** Work days so far, as they were saved: time off and holidays are days off. */
  workDays: number
  /** Picks that ended their day Done (or are Done now, on a day still going on). Each task once. */
  finished: MyWeekTask[]
  /** Tasks carried over from one check-in to the next. Each task once. */
  carriedOver: MyWeekTask[]
  dropped: (MyWeekTask & { reason: string })[]
}

export function mondayOf(day: string) {
  return addDays(day, -((weekdayOf(day) + 6) % 7))
}

export async function loadMyWeek(
  userId: string,
  monday: string | undefined,
  database = db,
  at = new Date()
): Promise<MyWeek> {
  const { clock } = await loadClock(userId, database)
  const today = personDay(clock, at).day
  const thisMonday = mondayOf(today)
  const firstMonday = addDays(thisMonday, -7 * MY_WEEK_BACK)
  const start = monday ? mondayOf(monday) : thisMonday
  if (start > thisMonday || start < firstMonday) throw new Error(PROJECT_ERRORS.weekTooFarBack)
  const sunday = addDays(start, 6)
  const lastDay = sunday < today ? sunday : today

  const days = await database
    .select({
      id: projectCheckins.id,
      day: projectCheckins.day,
      workDay: projectCheckins.workDay,
      checkedInAt: projectCheckins.checkedInAt,
      closedAt: projectCheckins.closedAt,
    })
    .from(projectCheckins)
    .where(
      and(
        eq(projectCheckins.userId, userId),
        gte(projectCheckins.day, start),
        lte(projectCheckins.day, lastDay)
      )
    )
  const checkedIn = days.filter((row) => row.checkedInAt)
  const ids = checkedIn.map((row) => row.id)
  const items = ids.length
    ? await database
        .select({
          checkinId: projectCheckinItems.checkinId,
          taskId: projectCheckinItems.taskId,
          title: projectCheckinItems.taskTitle,
          kind: projectCheckinItems.kind,
          carriedOver: projectCheckinItems.carriedOver,
          reason: projectCheckinItems.reason,
          endStatus: projectCheckinItems.endStatus,
          liveStatus: projectTasks.status,
          deletedAt: projectTasks.deletedAt,
        })
        .from(projectCheckinItems)
        .leftJoin(projectTasks, eq(projectTasks.id, projectCheckinItems.taskId))
        .where(inArray(projectCheckinItems.checkinId, ids))
        .orderBy(asc(projectCheckinItems.createdAt), asc(projectCheckinItems.taskTitle))
    : []
  const closed = new Map(checkedIn.map((row) => [row.id, Boolean(row.closedAt)]))

  const once = <T extends MyWeekTask>(list: T[]) => {
    const seen = new Set<string>()
    return list.filter((task) => {
      const key = task.taskId ?? `title:${task.title}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }
  const named = (item: (typeof items)[number]): MyWeekTask => ({
    // A task in the bin keeps its line without a way to open it.
    taskId: item.deletedAt ? null : item.taskId,
    title: item.title,
  })

  return {
    monday: start,
    lastDay,
    thisMonday,
    firstMonday,
    // A check-in on a day off doesn't count, so this never reads "5 of 4".
    checkedIn: checkedIn.filter((row) => row.workDay).length,
    // Today counts once I've checked in, the way "of the last 20 work days" counts it.
    workDays: days.filter((row) => row.workDay).length,
    finished: once(
      items
        .filter(
          (item) =>
            item.kind === "pick" &&
            (closed.get(item.checkinId) ? item.endStatus : !item.deletedAt && item.liveStatus) === "done"
        )
        .map(named)
    ),
    carriedOver: once(items.filter((item) => item.kind === "pick" && item.carriedOver).map(named)),
    dropped: items
      .filter((item) => item.kind === "drop")
      .map((item) => ({ ...named(item), reason: item.reason ?? "" })),
  }
}
