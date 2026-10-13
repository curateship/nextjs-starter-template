import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { CHEER_IDS } from "@/lib/pomodoro/cheers"
import {
  GROUP_BOARD_ORDERS,
  GROUP_INVITES_PER_DAY,
  GROUP_JOIN_TOKEN_LENGTH,
  GROUP_LINK_LIFETIMES,
  MAX_GROUP_DESCRIPTION_LENGTH,
  MAX_GROUP_GOAL_HOURS,
  MAX_GROUP_NAME_LENGTH,
  MIN_GROUP_GOAL_HOURS,
  MIN_GROUP_NAME_LENGTH,
} from "@/lib/pomodoro/groups"
import {
  DEFAULT_LEADERBOARD_WINDOW,
  LEADERBOARD_WINDOWS,
} from "@/lib/pomodoro/leaderboard-windows"
import { userGet, userPost } from "@/server/guards"
import { sendGroupCheer } from "@/server/pomodoro/following"
import {
  readGroupBoard,
  readGroupPastWeeks,
  readGroupStanding,
} from "@/server/pomodoro/group-scores"
import {
  acceptGroupInvite,
  answerGroupRequest,
  createGroupFor,
  declineGroupInvite,
  deleteGroup,
  handOverGroup,
  joinGroupByToken,
  leaveGroup,
  letBackIn,
  listGroupEvents,
  listGroupMembers,
  listGroupRequests,
  listGroupsFor,
  listInvitableFollows,
  listKeptOut,
  listMyGroupInvites,
  lookupGroupInvite,
  removeGroupMember,
  resetGroupInvite,
  saveGroupDetails,
  saveGroupInviteSettings,
  sendGroupInvites,
} from "@/server/pomodoro/groups"

/**
 * Private focus groups. Every endpoint is signed-in only, the invite lookup
 * included: joining needs an account, so there is nothing here for a stranger
 * to read. (Reporting a group from its public page is the one open door, and
 * it lives in `group-reports.ts`.)
 *
 * None of them takes a user id. The account comes from the guard's context, a
 * group from its own uuid with standing re-checked in
 * `src/server/pomodoro/groups.ts`, and a person from the uuid of their
 * membership, request, ban, invite or follow row — so holding a group id gets
 * a caller no further than being in it already would.
 */

const groupIdSchema = z.object({ groupId: z.string().uuid() })
const tokenSchema = z.object({
  // The exact length the secret is written at. A longer or shorter string is
  // not a link this app ever made.
  token: z.string().length(GROUP_JOIN_TOKEN_LENGTH),
})
const nameSchema = z
  .string()
  .trim()
  .min(MIN_GROUP_NAME_LENGTH)
  .max(MAX_GROUP_NAME_LENGTH)
const boardSchema = groupIdSchema.extend({
  window: z.enum(LEADERBOARD_WINDOWS).default(DEFAULT_LEADERBOARD_WINDOW),
  order: z.enum(GROUP_BOARD_ORDERS).default("hours"),
})

const listGroupsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) => listGroupsFor(context.user.id))

const createGroupFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ name: nameSchema }))
  .handler(async ({ data, context }) => ({
    groupId: await createGroupFor(context.user.id, data.name),
  }))

const saveGroupDetailsFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    groupIdSchema.extend({
      name: nameSchema,
      description: z
        .string()
        .trim()
        .max(MAX_GROUP_DESCRIPTION_LENGTH)
        .nullable(),
      timezone: z.string().min(1).max(80),
      weeklyGoalHours: z
        .number()
        .int()
        .min(MIN_GROUP_GOAL_HOURS)
        .max(MAX_GROUP_GOAL_HOURS)
        .nullable(),
    })
  )
  .handler(async ({ data: { groupId, ...details }, context }) => {
    await saveGroupDetails(context.user.id, groupId, details)
    return { saved: true as const }
  })

const saveGroupInviteSettingsFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    groupIdSchema.extend({
      joinsPaused: z.boolean().optional(),
      approveJoins: z.boolean().optional(),
      linkLifetime: z.enum(GROUP_LINK_LIFETIMES).optional(),
    })
  )
  .handler(async ({ data: { groupId, ...settings }, context }) => {
    await saveGroupInviteSettings(context.user.id, groupId, settings)
    return { saved: true as const }
  })

const resetGroupInviteFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(groupIdSchema)
  .handler(async ({ data, context }) => ({
    joinToken: await resetGroupInvite(context.user.id, data.groupId),
  }))

const lookupGroupInviteFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(tokenSchema)
  .handler(async ({ data, context }) =>
    lookupGroupInvite(context.user.id, data.token)
  )

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
  .inputValidator(
    groupIdSchema.extend({
      membershipId: z.string().uuid(),
      keepOut: z.boolean().default(false),
    })
  )
  .handler(async ({ data, context }) => {
    await removeGroupMember(
      context.user.id,
      data.groupId,
      data.membershipId,
      data.keepOut
    )
    return { removed: true as const }
  })

const listKeptOutFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(groupIdSchema)
  .handler(async ({ data, context }) =>
    listKeptOut(context.user.id, data.groupId)
  )

const letBackInFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(groupIdSchema.extend({ banId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    await letBackIn(context.user.id, data.groupId, data.banId)
    return { letBackIn: true as const }
  })

const handOverGroupFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(groupIdSchema.extend({ membershipId: z.string().uuid() }))
  .handler(async ({ data, context }) => {
    await handOverGroup(context.user.id, data.groupId, data.membershipId)
    return { handedOver: true as const }
  })

const listGroupRequestsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(groupIdSchema)
  .handler(async ({ data, context }) =>
    listGroupRequests(context.user.id, data.groupId)
  )

const answerGroupRequestFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    groupIdSchema.extend({ requestId: z.string().uuid(), letIn: z.boolean() })
  )
  .handler(async ({ data, context }) => {
    await answerGroupRequest(
      context.user.id,
      data.groupId,
      data.requestId,
      data.letIn
    )
    return { answered: true as const }
  })

const listInvitableFollowsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(groupIdSchema)
  .handler(async ({ data, context }) =>
    listInvitableFollows(context.user.id, data.groupId)
  )

const sendGroupInvitesFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    groupIdSchema.extend({
      followIds: z
        .array(z.string().uuid())
        .min(1)
        .max(GROUP_INVITES_PER_DAY),
    })
  )
  .handler(async ({ data, context }) =>
    sendGroupInvites(context.user.id, data.groupId, data.followIds)
  )

const listMyGroupInvitesFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) => listMyGroupInvites(context.user.id))

const inviteIdSchema = z.object({ inviteId: z.string().uuid() })

const acceptGroupInviteFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(inviteIdSchema)
  .handler(async ({ data, context }) =>
    acceptGroupInvite(context.user.id, data.inviteId)
  )

const declineGroupInviteFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(inviteIdSchema)
  .handler(async ({ data, context }) => {
    await declineGroupInvite(context.user.id, data.inviteId)
    return { declined: true as const }
  })

const listGroupEventsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(groupIdSchema)
  .handler(async ({ data, context }) =>
    listGroupEvents(context.user.id, data.groupId)
  )

const loadGroupBoardFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(boardSchema)
  .handler(async ({ data, context }) =>
    readGroupBoard({
      userId: context.user.id,
      groupId: data.groupId,
      window: data.window,
      order: data.order,
    })
  )

const loadGroupStandingFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(groupIdSchema)
  .handler(async ({ data, context }) =>
    readGroupStanding(context.user.id, data.groupId)
  )

const loadGroupPastWeeksFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(groupIdSchema)
  .handler(async ({ data, context }) =>
    readGroupPastWeeks(context.user.id, data.groupId)
  )

const sendGroupCheerFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    groupIdSchema.extend({
      membershipId: z.string().uuid(),
      cheerId: z.enum(CHEER_IDS),
    })
  )
  .handler(async ({ data, context }) =>
    sendGroupCheer({
      fromUserId: context.user.id,
      groupId: data.groupId,
      membershipId: data.membershipId,
      cheerId: data.cheerId,
    })
  )

type GroupDetails = {
  name: string
  description: string | null
  timezone: string
  weeklyGoalHours: number | null
}

export const loadMyGroups = () => listGroupsFn()
export const createFocusGroup = (name: string) =>
  createGroupFn({ data: { name } })
export const saveFocusGroupDetails = (groupId: string, details: GroupDetails) =>
  saveGroupDetailsFn({ data: { groupId, ...details } })
export const saveFocusGroupInviteSettings = (
  groupId: string,
  settings: {
    joinsPaused?: boolean
    approveJoins?: boolean
    linkLifetime?: (typeof GROUP_LINK_LIFETIMES)[number]
  }
) => saveGroupInviteSettingsFn({ data: { groupId, ...settings } })
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
  membershipId: string,
  keepOut = false
) => removeGroupMemberFn({ data: { groupId, membershipId, keepOut } })
export const loadFocusGroupKeptOut = (groupId: string) =>
  listKeptOutFn({ data: { groupId } })
export const letFocusGroupBanBackIn = (groupId: string, banId: string) =>
  letBackInFn({ data: { groupId, banId } })
export const handOverFocusGroup = (groupId: string, membershipId: string) =>
  handOverGroupFn({ data: { groupId, membershipId } })
export const loadFocusGroupRequests = (groupId: string) =>
  listGroupRequestsFn({ data: { groupId } })
export const answerFocusGroupRequest = (
  groupId: string,
  requestId: string,
  letIn: boolean
) => answerGroupRequestFn({ data: { groupId, requestId, letIn } })
export const loadInvitableFollows = (groupId: string) =>
  listInvitableFollowsFn({ data: { groupId } })
export const sendFocusGroupInvites = (groupId: string, followIds: string[]) =>
  sendGroupInvitesFn({ data: { groupId, followIds } })
export const loadMyFocusGroupInvites = () => listMyGroupInvitesFn()
export const acceptFocusGroupInvite = (inviteId: string) =>
  acceptGroupInviteFn({ data: { inviteId } })
export const declineFocusGroupInvite = (inviteId: string) =>
  declineGroupInviteFn({ data: { inviteId } })
export const loadFocusGroupEvents = (groupId: string) =>
  listGroupEventsFn({ data: { groupId } })
export const loadFocusGroupBoard = (
  groupId: string,
  window: (typeof LEADERBOARD_WINDOWS)[number],
  order: (typeof GROUP_BOARD_ORDERS)[number]
) => loadGroupBoardFn({ data: { groupId, window, order } })
export const loadFocusGroupStanding = (groupId: string) =>
  loadGroupStandingFn({ data: { groupId } })
export const loadFocusGroupPastWeeks = (groupId: string) =>
  loadGroupPastWeeksFn({ data: { groupId } })
export const cheerFocusGroupMember = (
  groupId: string,
  membershipId: string,
  cheerId: (typeof CHEER_IDS)[number]
) => sendGroupCheerFn({ data: { groupId, membershipId, cheerId } })
