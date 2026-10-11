import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { isRealDay } from "@/lib/project/days"
import { myCheckinTimeSchema, submitCheckinSchema, timeOffSchema } from "@/lib/project/rules"
import { userGet, userPost } from "@/server/guards"
import { findMembership } from "@/server/project/access"
import { addPick, removePick, setMyCheckinTime, submitCheckin } from "@/server/project/checkins"
import { listInvitesForMe } from "@/server/project/invites"
import { loadMyDashboard } from "@/server/project/my-dashboard"
import { loadTeamDay, loadTeamMonth } from "@/server/project/team-days"
import { addTimeOff, listTimeOffFor, removeTimeOff } from "@/server/project/time-off"

export type { CheckinAnswer, CheckinClock, CheckinPage } from "@/server/project/checkins"
export type { MyDashboard } from "@/server/project/my-dashboard"
export type { CheckinRecord, TimeOff } from "@/server/project/time-off"
export type {
  TeamDay,
  TeamDayPerson,
  TeamDayTask,
  TeamMonth,
  TeamMonthDay,
} from "@/server/project/team-days"

const id = z.string().min(1).max(36)
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Pick a month like 2026-10.")
const day = z.string().refine(isRealDay, "Pick a day like 2026-10-09.")

/** My dashboard, plus what the page needs when there is no team yet. */
const loadMyDashboardFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) => {
    if (!(await findMembership(context.user.id))) {
      return { dashboard: null, invites: await listInvitesForMe(context.user) }
    }
    return { dashboard: await loadMyDashboard(context.user.id), invites: [] }
  })

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

const setMyCheckinTimeFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(myCheckinTimeSchema)
  .handler(async ({ data, context }) => setMyCheckinTime(context.user.id, data))

/** The Team dashboard's calendar month and the check-ins of one day. */
const loadTeamCheckinsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ month: month.optional(), day: day.optional() }))
  .handler(async ({ data, context }) => {
    if (!(await findMembership(context.user.id))) return null
    return {
      month: await loadTeamMonth(context.user.id, data.month),
      day: await loadTeamDay(context.user.id, data.day),
    }
  })

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
export function saveMyCheckinTime(data: z.input<typeof myCheckinTimeSchema>) {
  return setMyCheckinTimeFn({ data })
}
export function loadTeamCheckins(data: { month?: string; day?: string }) {
  return loadTeamCheckinsFn({ data })
}

const addTimeOffFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(timeOffSchema)
  .handler(async ({ data, context }) => addTimeOff(context.user.id, data))

const removeTimeOffFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ timeOffId: id }))
  .handler(async ({ data, context }) => removeTimeOff(context.user.id, data.timeOffId))

const listTimeOffFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ userId: id.optional() }))
  .handler(async ({ data, context }) => listTimeOffFor(context.user.id, data.userId))

export function addDaysOff(data: z.input<typeof timeOffSchema>) {
  return addTimeOffFn({ data })
}
export function removeDaysOff(timeOffId: string) {
  return removeTimeOffFn({ data: { timeOffId } })
}
export function loadDaysOff(userId?: string) {
  return listTimeOffFn({ data: { userId } })
}
