import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { isRealDay } from "@/lib/project/days"
import {
  blockerReplySchema,
  checkOutSchema,
  myCheckinTimeSchema,
  myStatusOrderSchema,
  orderPicksSchema,
  saveCheckinNotesSchema,
  submitCheckinSchema,
  timeOffSchema,
} from "@/lib/project/rules"
import { teamScope } from "@/lib/api/project/scope"
import { userGet, userPost } from "@/server/guards"
import { findMembership, inTeam } from "@/server/project/access"
import { addBlockerReply } from "@/server/project/blocker-replies"
import {
  addPick,
  checkOut,
  orderTodaysPicks,
  removePick,
  saveCheckinNotes,
  setMyCheckinTime,
  submitCheckin,
} from "@/server/project/checkins"
import { loadMyWeek } from "@/server/project/my-week"
import { loadMyDashboard, setMyStatusOrder } from "@/server/project/my-dashboard"
import { loadTeamDay, loadTeamMonth } from "@/server/project/team-days"
import { setCalendarDueDates } from "@/server/project/team-due-dates"
import { addTimeOff, listTimeOffFor, removeTimeOff } from "@/server/project/time-off"

export type { CheckinAnswer, CheckinClock, CheckinPage } from "@/server/project/checkins"
export type { MyDashboard } from "@/server/project/my-dashboard"
export type { BlockerReply } from "@/server/project/blocker-replies"
export type { MyWeek, MyWeekTask } from "@/server/project/my-week"
export type { ThanksLine } from "@/server/project/task-thanks"
export type { CheckinRecord, TimeOff } from "@/server/project/time-off"
export type {
  TeamDay,
  TeamDayPerson,
  TeamDayTask,
  TeamMonth,
  TeamMonthDay,
} from "@/server/project/team-days"
export type { TeamDeadline, TeamDueDates, TeamDueTask } from "@/server/project/team-due-dates"
export type { AwayDay } from "@/server/project/time-off"

const id = z.string().min(1).max(36)
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Pick a month like 2026-10.")
const day = z.string().refine(isRealDay, "Pick a day like 2026-10-09.")

/** My dashboard, or null when the person isn't on a team yet. */
const loadMyDashboardFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) => ({
    dashboard: (await findMembership(context.user.id)) ? await loadMyDashboard(context.user.id) : null,
  }))

const submitCheckinFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(submitCheckinSchema)
  .handler(async ({ data, context }) => submitCheckin(context.user.id, data))

const addPickFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ taskId: id }))
  .handler(async ({ data, context }) => addPick(context.user.id, data.taskId))

const removePickFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ taskId: id }))
  .handler(async ({ data, context }) => removePick(context.user.id, data.taskId))

const saveCheckinNotesFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(saveCheckinNotesSchema)
  .handler(async ({ data, context }) => saveCheckinNotes(context.user.id, data))

const setMyCheckinTimeFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(myCheckinTimeSchema)
  .handler(async ({ data, context }) => setMyCheckinTime(context.user.id, data))

/** The Team dashboard's calendar month and the check-ins of one day. */
const loadTeamCheckinsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ month: month.optional(), day: day.optional(), ...teamScope }))
  .handler(async ({ data, context }) =>
    inTeam(data.teamId, async () => {
      if (!(await findMembership(context.user.id))) return null
      return {
        month: await loadTeamMonth(context.user.id, data.month),
        day: await loadTeamDay(context.user.id, data.day),
      }
    })
  )

export function loadMyDashboardPage() {
  return loadMyDashboardFn()
}
export function checkIn(data: z.input<typeof submitCheckinSchema>) {
  return submitCheckinFn({ data })
}
export function pickTask(taskId: string) {
  return addPickFn({ data: { taskId } })
}
export function unpickTask(taskId: string) {
  return removePickFn({ data: { taskId } })
}
export function saveNotes(data: z.input<typeof saveCheckinNotesSchema>) {
  return saveCheckinNotesFn({ data })
}
export function saveMyCheckinTime(data: z.input<typeof myCheckinTimeSchema>) {
  return setMyCheckinTimeFn({ data })
}
export function loadTeamCheckins(data: { month?: string; day?: string }, teamId?: string) {
  return loadTeamCheckinsFn({ data: { ...data, teamId } })
}

const addTimeOffFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(timeOffSchema.extend(teamScope))
  .handler(async ({ data: { teamId, ...data }, context }) => inTeam(teamId, () => addTimeOff(context.user.id, data)))

const removeTimeOffFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ timeOffId: id, ...teamScope }))
  .handler(async ({ data, context }) => inTeam(data.teamId, () => removeTimeOff(context.user.id, data.timeOffId)))

const listTimeOffFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ userId: id.optional(), ...teamScope }))
  .handler(async ({ data, context }) => inTeam(data.teamId, () => listTimeOffFor(context.user.id, data.userId)))

export function addDaysOff(data: z.input<typeof timeOffSchema>, teamId?: string) {
  return addTimeOffFn({ data: { ...data, teamId } })
}
export function removeDaysOff(timeOffId: string, teamId?: string) {
  return removeTimeOffFn({ data: { timeOffId, teamId } })
}
export function loadDaysOff(userId?: string, teamId?: string) {
  return listTimeOffFn({ data: { userId, teamId } })
}

const replyFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(blockerReplySchema.extend(teamScope))
  .handler(async ({ data: { teamId, ...data }, context }) => inTeam(teamId, () => addBlockerReply(context.user, data)))

const checkOutFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(checkOutSchema)
  .handler(async ({ data, context }) => checkOut(context.user, data))

const orderPicksFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(orderPicksSchema)
  .handler(async ({ data, context }) => orderTodaysPicks(context.user.id, data.taskIds))

/** My week: only ever my own, so it takes no person. */
const loadMyWeekFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ monday: day.optional() }))
  .handler(async ({ data, context }) => loadMyWeek(context.user.id, data.monday))

export function replyToBlocker(data: z.input<typeof blockerReplySchema>, teamId?: string) {
  return replyFn({ data: { ...data, teamId } })
}
export function checkOutForTheDay(data: z.input<typeof checkOutSchema>) {
  return checkOutFn({ data })
}
export function orderMyPicks(taskIds: string[]) {
  return orderPicksFn({ data: { taskIds } })
}
export function loadWeek(monday?: string) {
  return loadMyWeekFn({ data: { monday } })
}

const setCalendarDueDatesFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ on: z.boolean(), ...teamScope }))
  .handler(async ({ data, context }) => inTeam(data.teamId, () => setCalendarDueDates(context.user.id, data.on)))

/** My own "Due dates" switch on the Team calendar. */
export function showDueDatesOnCalendar(on: boolean, teamId?: string) {
  return setCalendarDueDatesFn({ data: { on, teamId } })
}

const setMyStatusOrderFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(myStatusOrderSchema)
  .handler(async ({ data, context }) => setMyStatusOrder(context.user.id, data.statusOrder))

/** My dashboard's Board columns in my own order, which only I see. */
export function saveMyStatusOrder(statusOrder: z.input<typeof myStatusOrderSchema>["statusOrder"]) {
  return setMyStatusOrderFn({ data: { statusOrder } })
}
