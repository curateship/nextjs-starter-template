import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  TEAM_INVITE_ROLES,
  createTeamSchema,
  inviteSchema,
  updateTeamSchema,
} from "@/lib/project/rules"
import { userGet, userPost } from "@/server/guards"
import {
  acceptInvite,
  cancelInvite,
  createInvite,
  declineInvite,
  listInvitesForMe,
  loadInviteByToken,
  resendInvite,
} from "@/server/project/invites"
import {
  changeMemberRole,
  createTeam,
  eachOf,
  leaveTeam,
  loadTeamDashboard,
  removeTeamMember,
  transferOwnership,
  updateTeam,
} from "@/server/project/teams"

export type {
  BulkResult,
  TeamDashboard,
  TeamInviteRow,
  TeamMemberRow,
  TeamSummary,
} from "@/server/project/teams"
export type { InviteForMe, SentInvite } from "@/server/project/invites"

const id = z.string().min(1).max(36)

const loadTeamDashboardFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) => loadTeamDashboard(context.user.id))

const createTeamFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(createTeamSchema)
  .handler(async ({ data, context }) => createTeam(context.user.id, data))

const updateTeamFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(updateTeamSchema)
  .handler(async ({ data, context }) => updateTeam(context.user.id, data))

const changeRoleFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ userId: id, role: z.enum(TEAM_INVITE_ROLES) }))
  .handler(async ({ data, context }) =>
    changeMemberRole(context.user.id, data.userId, data.role)
  )

const transferOwnershipFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ userId: id }))
  .handler(async ({ data, context }) => transferOwnership(context.user.id, data.userId))

const removeMembersFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ userIds: z.array(id).min(1).max(200) }))
  .handler(async ({ data, context }) =>
    eachOf(data.userIds, (userId) => removeTeamMember(context.user.id, userId))
  )

const cancelInvitesFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ inviteIds: z.array(id).min(1).max(200) }))
  .handler(async ({ data, context }) =>
    eachOf(data.inviteIds, (inviteId) => cancelInvite(context.user.id, inviteId))
  )

const leaveTeamFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .handler(async ({ context }) => leaveTeam(context.user.id))

const createInviteFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(inviteSchema)
  .handler(async ({ data, context }) => createInvite(context.user, data))

const resendInviteFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ inviteId: id }))
  .handler(async ({ data, context }) => resendInvite(context.user, data.inviteId))

const loadInviteFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ token: z.string().min(1).max(128) }))
  .handler(async ({ data, context }) => loadInviteByToken(context.user, data.token))

const listInvitesForMeFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) => listInvitesForMe(context.user))

const acceptInviteFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ inviteId: id }))
  .handler(async ({ data, context }) => acceptInvite(context.user, data.inviteId))

const declineInviteFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ inviteId: id }))
  .handler(async ({ data, context }) => declineInvite(context.user, data.inviteId))

export function loadTeamDashboardPage() {
  return loadTeamDashboardFn()
}
export function createProjectTeam(data: z.input<typeof createTeamSchema>) {
  return createTeamFn({ data })
}
export function updateProjectTeam(data: z.input<typeof updateTeamSchema>) {
  return updateTeamFn({ data })
}
export function changeTeamMemberRole(data: { userId: string; role: "admin" | "member" }) {
  return changeRoleFn({ data })
}
export function makeTeamOwner(userId: string) {
  return transferOwnershipFn({ data: { userId } })
}
export function removeManyFromTeam(userIds: string[]) {
  return removeMembersFn({ data: { userIds } })
}
export function cancelTeamInvites(inviteIds: string[]) {
  return cancelInvitesFn({ data: { inviteIds } })
}
export function leaveProjectTeam() {
  return leaveTeamFn()
}
export function inviteToTeam(data: z.input<typeof inviteSchema>) {
  return createInviteFn({ data })
}
export function resendTeamInvite(inviteId: string) {
  return resendInviteFn({ data: { inviteId } })
}
export function loadTeamInvite(token: string) {
  return loadInviteFn({ data: { token } })
}
export function loadMyTeamInvites() {
  return listInvitesForMeFn()
}
export function acceptTeamInvite(inviteId: string) {
  return acceptInviteFn({ data: { inviteId } })
}
export function declineTeamInvite(inviteId: string) {
  return declineInviteFn({ data: { inviteId } })
}
