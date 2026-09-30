import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  GROUP_JOIN_TOKEN_LENGTH,
  MAX_GROUP_NAME_LENGTH,
  MIN_GROUP_NAME_LENGTH,
} from "@/lib/pomodoro/groups"
import {
  DEFAULT_LEADERBOARD_WINDOW,
  LEADERBOARD_WINDOWS,
} from "@/lib/pomodoro/leaderboard-windows"
import { userGet, userPost } from "@/server/guards"
import {
  createGroupFor,
  deleteGroup,
  joinGroupByToken,
  leaveGroup,
  listGroupMembers,
  listGroupsFor,
  lookupGroupInvite,
  readGroupBoard,
  removeGroupMember,
  resetGroupInvite,
} from "@/server/pomodoro/groups"

/**
 * Private focus groups. Every endpoint is signed-in only, the invite lookup
 * included: joining needs an account, so there is nothing here for a stranger
 * to read.
 *
 * None of them takes a user id. The account comes from the guard's context, a
 * group from its own uuid with membership re-checked in
 * `src/server/pomodoro/groups.ts`, and a person to remove from their membership
 * row's uuid — so holding a group id gets a caller no further than being in it
 * already would.
 */

const groupIdSchema = z.object({ groupId: z.string().uuid() })
const tokenSchema = z.object({
  // The exact length the secret is written at. A longer or shorter string is
  // not a link this app ever made.
  token: z.string().length(GROUP_JOIN_TOKEN_LENGTH),
})
const boardSchema = groupIdSchema.extend({
  window: z.enum(LEADERBOARD_WINDOWS).default(DEFAULT_LEADERBOARD_WINDOW),
  timezone: z.string().min(1).max(60),
})

const listGroupsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) => listGroupsFor(context.user.id))

const createGroupFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      name: z
        .string()
        .trim()
        .min(MIN_GROUP_NAME_LENGTH)
        .max(MAX_GROUP_NAME_LENGTH),
    })
  )
  .handler(async ({ data, context }) => ({
    groupId: await createGroupFor(context.user.id, data.name),
  }))

const resetGroupInviteFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(groupIdSchema)
  .handler(async ({ data, context }) => ({
    joinToken: await resetGroupInvite(context.user.id, data.groupId),
  }))

const lookupGroupInviteFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(tokenSchema)
  .handler(async ({ data }) => lookupGroupInvite(data.token))

const joinGroupFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(tokenSchema)
  .handler(async ({ data, context }) =>
    joinGroupByToken(context.user.id, data.token)
  )

const leaveGroupFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(groupIdSchema)
  .handler(async ({ data, context }) => {
    await leaveGroup(context.user.id, data.groupId)
    return { left: true as const }
  })

const deleteGroupFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(groupIdSchema)
  .handler(async ({ data, context }) => {
    await deleteGroup(context.user.id, data.groupId)
    return { deleted: true as const }
  })

const listGroupMembersFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(groupIdSchema)
  .handler(async ({ data, context }) =>
    listGroupMembers(context.user.id, data.groupId)
  )

const removeGroupMemberFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(groupIdSchema.extend({ membershipId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    await removeGroupMember(context.user.id, data.groupId, data.membershipId)
    return { removed: true as const }
  })

const loadGroupBoardFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(boardSchema)
  .handler(async ({ data, context }) =>
    readGroupBoard({
      userId: context.user.id,
      groupId: data.groupId,
      window: data.window,
      timezone: data.timezone,
    })
  )

export const loadMyGroups = () => listGroupsFn()
export const createFocusGroup = (name: string) =>
  createGroupFn({ data: { name } })
export const resetFocusGroupInvite = (groupId: string) =>
  resetGroupInviteFn({ data: { groupId } })
export const lookupFocusGroupInvite = (token: string) =>
  lookupGroupInviteFn({ data: { token } })
export const joinFocusGroup = (token: string) => joinGroupFn({ data: { token } })
export const leaveFocusGroup = (groupId: string) =>
  leaveGroupFn({ data: { groupId } })
export const deleteFocusGroup = (groupId: string) =>
  deleteGroupFn({ data: { groupId } })
export const loadFocusGroupMembers = (groupId: string) =>
  listGroupMembersFn({ data: { groupId } })
export const removeFocusGroupMember = (
  groupId: string,
  membershipId: string
) => removeGroupMemberFn({ data: { groupId, membershipId } })
export const loadFocusGroupBoard = (
  groupId: string,
  window: (typeof LEADERBOARD_WINDOWS)[number],
  timezone: string
) => loadGroupBoardFn({ data: { groupId, window, timezone } })
