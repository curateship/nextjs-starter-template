import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import {
  TEAM_INVITE_ROLES,
  announcementSchema,
  createTeamSchema,
  inviteManySchema,
  inviteSchema,
  teamPhotoSchema,
  updateTeamSchema,
} from "@/lib/project/rules"
import { enforceRateLimit } from "@/server/auth/rate-limit"
import { userGet, userPost } from "@/server/guards"
import {
  hideAnnouncement,
  markAnnouncementSeen,
  postAnnouncement,
  takeDownAnnouncement,
} from "@/server/project/announcements"
import { findMembership } from "@/server/project/access"
import {
  acceptInvite,
  cancelInvite,
  createInvite,
  createInvites,
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
  setTeamPhoto,
  transferOwnership,
  updateTeam,
} from "@/server/project/teams"
import { loadTeamFigures } from "@/server/project/team-figures"

export type {
  BulkResult,
  TeamDashboard,
  TeamInviteRow,
  TeamMemberRow,
  TeamSummary,
} from "@/server/project/teams"
export type { Announcement } from "@/server/project/announcements"
export type { InviteForMe, InviteOutcome, SentInvite } from "@/server/project/invites"
export type { TeamFigures } from "@/server/project/team-figures"

const id = z.string().min(1).max(36)

const loadTeamDashboardFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) => loadTeamDashboard(context.user.id))

/** The four figures under the team's name on the Team dashboard. */
const loadTeamFiguresFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) =>
    (await findMembership(context.user.id)) ? loadTeamFigures(context.user.id) : null
  )

const setTeamPhotoFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(teamPhotoSchema)
  .handler(async ({ data, context }) => setTeamPhoto(context.user.id, data.photoUrl))

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

const createInvitesFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(inviteManySchema)
  .handler(async ({ data, context }) => createInvites(context.user, data))

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
export function loadFigures() {
  return loadTeamFiguresFn()
}
export function saveTeamPhoto(photoUrl: string) {
  return setTeamPhotoFn({ data: { photoUrl } })
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
export function inviteManyToTeam(data: z.input<typeof inviteManySchema>) {
  return createInvitesFn({ data })
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

/** Each one rings everyone's bell, so an owner or admin can post 20 an hour at most. */
const postAnnouncementFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(announcementSchema)
  .handler(async ({ data, context }) => {
    try {
      await enforceRateLimit(`project-announcement:${context.user.id}`, {
        maxAttempts: 20,
        windowSeconds: 60 * 60,
      })
    } catch (error) {
      if (error instanceof Error && error.message.includes("RATE_LIMITED")) {
        throw new Error(PROJECT_ERRORS.tooManyAnnouncements)
      }
      throw error
    }
    return postAnnouncement(context.user, data.text)
  })

const takeDownAnnouncementFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .handler(async ({ context }) => takeDownAnnouncement(context.user))

const hideAnnouncementFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ announcementId: id }))
  .handler(async ({ data, context }) => hideAnnouncement(context.user.id, data.announcementId))

const markAnnouncementSeenFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ announcementId: id }))
  .handler(async ({ data, context }) => markAnnouncementSeen(context.user.id, data.announcementId))

export function postTeamAnnouncement(text: string) {
  return postAnnouncementFn({ data: { text } })
}
export function takeDownTeamAnnouncement() {
  return takeDownAnnouncementFn()
}
/** The announcement showed on my Team dashboard. */
export function markTeamAnnouncementSeen(announcementId: string) {
  return markAnnouncementSeenFn({ data: { announcementId } })
}
export function hideTeamAnnouncement(announcementId: string) {
  return hideAnnouncementFn({ data: { announcementId } })
}
