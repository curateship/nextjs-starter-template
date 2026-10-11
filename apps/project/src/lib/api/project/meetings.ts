import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { isRealDay } from "@/lib/project/days"
import { meetingSchema, updateMeetingSchema } from "@/lib/project/rules"
import { userGet, userPost } from "@/server/guards"
import { findMembership } from "@/server/project/access"
import {
  createMeeting,
  deleteMeeting,
  loadTeamMeetings,
  updateMeeting,
} from "@/server/project/meetings"

export type {
  Meeting,
  MeetingOccurrence,
  MeetingPerson,
  TeamMeetings,
} from "@/server/project/meetings"

const id = z.string().min(1).max(36)
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Pick a month like 2026-10.")
const day = z.string().refine(isRealDay, "Pick a day like 2026-10-12.")

/** The team's meetings on the calendar's month and the chosen day. */
const loadTeamMeetingsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ month: month.optional(), day: day.optional() }))
  .handler(async ({ data, context }) => {
    if (!(await findMembership(context.user.id))) return null
    return loadTeamMeetings(context.user.id, data)
  })

const createMeetingFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(meetingSchema)
  .handler(async ({ data, context }) => createMeeting(context.user, data))

const updateMeetingFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(updateMeetingSchema)
  .handler(async ({ data, context }) => updateMeeting(context.user, data.meetingId, data.meeting))

const deleteMeetingFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ meetingId: id }))
  .handler(async ({ data, context }) => deleteMeeting(context.user.id, data.meetingId))

export function loadMeetings(data: { month?: string; day?: string }) {
  return loadTeamMeetingsFn({ data })
}
export function makeMeeting(data: z.input<typeof meetingSchema>) {
  return createMeetingFn({ data })
}
export function changeMeeting(data: z.input<typeof updateMeetingSchema>) {
  return updateMeetingFn({ data })
}
export function removeMeeting(meetingId: string) {
  return deleteMeetingFn({ data: { meetingId } })
}
