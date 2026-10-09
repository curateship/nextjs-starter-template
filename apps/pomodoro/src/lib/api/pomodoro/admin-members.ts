import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { createErrorMessage } from "../error-message"
import { adminGet, adminPost } from "@/server/guards"
import {
  addMemberNote,
  addStreakFix,
  deleteMemberNote,
  editMemberNote,
  hideProfilesByAdmin,
  loadMemberWindow,
  removeAllFollowsBy,
  type MemberWindow,
} from "@/server/pomodoro/admin-members"
import { forgetHiddenProfiles } from "@/server/pomodoro/profile-reports"

/**
 * The member window's doors (admin task 06), every one behind `adminGet` or
 * `adminPost`. See `workspace/docs/admin-members.md`.
 */
export type { MemberWindow }

export const getMemberWindowErrorMessage = createErrorMessage(
  {
    MEMBER_NOT_FOUND: "That account is no longer there.",
    FIX_IN_FUTURE: "That day has not happened yet on their clock.",
    FIX_DAY_FOCUSED: "They already focused that day, so it is already in their streak.",
    FIX_DAY_ALREADY_FIXED: "That day was already put back.",
    NOTE_NOT_FOUND: "That note is no longer there. The window has been refreshed.",
  },
  "That did not work. Please try again."
)

const userIdSchema = z.string().trim().min(1).max(36)

const loadFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ userId: userIdSchema }))
  .handler(({ data }) => loadMemberWindow(data.userId))

const fixStreakFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      userId: userIdSchema,
      localDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      reason: z.string().trim().min(1).max(200),
    })
  )
  .handler(({ data, context }) => addStreakFix({ ...data, actorUserId: context.user.id }))

const noteBody = z.string().trim().min(1).max(2000)

const addNoteFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ userId: userIdSchema, body: noteBody }))
  .handler(({ data, context }) => addMemberNote({ ...data, actorUserId: context.user.id }))

const editNoteFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ noteId: z.string().uuid(), body: noteBody }))
  .handler(({ data, context }) => editMemberNote({ ...data, actorUserId: context.user.id }))

const deleteNoteFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ noteId: z.string().uuid() }))
  .handler(({ data, context }) => deleteMemberNote({ ...data, actorUserId: context.user.id }))

const hideProfilesFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ userIds: z.array(userIdSchema).min(1).max(100) }))
  .handler(async ({ data, context }) => {
    const { handles, ...result } = await hideProfilesByAdmin({ userIds: data.userIds, actorUserId: context.user.id })
    // A hidden profile must 404 on the very next request.
    forgetHiddenProfiles(handles)
    return result
  })

const removeFollowsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ userId: userIdSchema }))
  .handler(({ data, context }) => removeAllFollowsBy({ userId: data.userId, actorUserId: context.user.id }))

export const loadPomodoroMemberWindow = (userId: string) => loadFn({ data: { userId } })
export const fixPomodoroStreakDay = (userId: string, localDate: string, reason: string) =>
  fixStreakFn({ data: { userId, localDate, reason } })
export const addPomodoroMemberNote = (userId: string, body: string) => addNoteFn({ data: { userId, body } })
export const editPomodoroMemberNote = (noteId: string, body: string) => editNoteFn({ data: { noteId, body } })
export const deletePomodoroMemberNote = (noteId: string) => deleteNoteFn({ data: { noteId } })
export const hidePomodoroProfiles = (userIds: string[]) => hideProfilesFn({ data: { userIds } })
export const removePomodoroFollowsBy = (userId: string) => removeFollowsFn({ data: { userId } })
