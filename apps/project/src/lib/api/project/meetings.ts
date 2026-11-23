import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { isRealDay } from "@/lib/project/days"
import {
  meetingAnswerSchema,
  meetingDaySchema,
  meetingNoteLineSchema,
  meetingNotesSchema,
  meetingSchema,
  updateMeetingSchema,
} from "@/lib/project/rules"
import { teamScope } from "@/lib/api/project/scope"
import { userGet, userPost } from "@/server/guards"
import { findMembership, inTeam } from "@/server/project/access"
import {
  answerMeeting,
  createMeeting,
  deleteMeeting,
  linkMeetingNoteLine,
  loadMeetingNotes,
  loadTeamMeetings,
  saveMeetingNotes,
  updateMeeting,
} from "@/server/project/meetings"

export type {
  Meeting,
  MeetingNotes,
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
  .inputValidator(z.object({ month: month.optional(), day: day.optional(), ...teamScope }))
  .handler(async ({ data: { teamId, ...data }, context }) =>
    inTeam(teamId, async () => {
      if (!(await findMembership(context.user.id))) return null
      return loadTeamMeetings(context.user.id, data)
    })
  )

const createMeetingFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ meeting: meetingSchema, ...teamScope }))
  .handler(async ({ data, context }) => inTeam(data.teamId, () => createMeeting(context.user, data.meeting)))

const updateMeetingFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(updateMeetingSchema.extend(teamScope))
  .handler(async ({ data, context }) =>
    inTeam(data.teamId, () => updateMeeting(context.user, data.meetingId, data.meeting))
  )

const deleteMeetingFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ meetingId: id, ...teamScope }))
  .handler(async ({ data, context }) => inTeam(data.teamId, () => deleteMeeting(context.user.id, data.meetingId)))

const answerMeetingFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(meetingAnswerSchema.extend(teamScope))
  .handler(async ({ data: { teamId, ...data }, context }) => inTeam(teamId, () => answerMeeting(context.user.id, data)))

const loadMeetingNotesFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(meetingDaySchema.extend(teamScope))
  .handler(async ({ data: { teamId, ...data }, context }) => inTeam(teamId, () => loadMeetingNotes(context.user.id, data)))

const saveMeetingNotesFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(meetingNotesSchema.extend(teamScope))
  .handler(async ({ data: { teamId, ...data }, context }) => inTeam(teamId, () => saveMeetingNotes(context.user, data)))

const linkMeetingNoteLineFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(meetingNoteLineSchema.extend(teamScope))
  .handler(async ({ data: { teamId, ...data }, context }) => inTeam(teamId, () => linkMeetingNoteLine(context.user, data)))

export function loadMeetings(data: { month?: string; day?: string }, teamId?: string) {
  return loadTeamMeetingsFn({ data: { ...data, teamId } })
}
export function makeMeeting(meeting: z.input<typeof meetingSchema>, teamId?: string) {
  return createMeetingFn({ data: { meeting, teamId } })
}
export function changeMeeting(data: z.input<typeof updateMeetingSchema>, teamId?: string) {
  return updateMeetingFn({ data: { ...data, teamId } })
}
export function removeMeeting(meetingId: string, teamId?: string) {
  return deleteMeetingFn({ data: { meetingId, teamId } })
}
export function answerTheMeeting(data: z.input<typeof meetingAnswerSchema>, teamId?: string) {
  return answerMeetingFn({ data: { ...data, teamId } })
}
export function loadNotesOfMeeting(data: z.input<typeof meetingDaySchema>, teamId?: string) {
  return loadMeetingNotesFn({ data: { ...data, teamId } })
}
export function saveNotesOfMeeting(data: z.input<typeof meetingNotesSchema>, teamId?: string) {
  return saveMeetingNotesFn({ data: { ...data, teamId } })
}
export function linkNoteLineToTask(data: z.input<typeof meetingNoteLineSchema>, teamId?: string) {
  return linkMeetingNoteLineFn({ data: { ...data, teamId } })
}
