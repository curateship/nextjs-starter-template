import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import {
  announcementSchema,
  createTeamSchema,
  inviteManySchema,
  inviteSchema,
  teamPhotoSchema,
  updateTeamSchema,
} from "@/lib/project/rules"
import { enforceRateLimit } from "@/server/auth/rate-limit"
import { teamScope } from "@/lib/api/project/scope"
import { userGet, userPost } from "@/server/guards"
import {
  hideAnnouncement,
  markAnnouncementSeen,
  postAnnouncement,
  takeDownAnnouncement,
} from "@/server/project/announcements"
import { findMembership, inTeam } from "@/server/project/access"
import { createInvite, createInvites, resendInvite } from "@/server/project/invites"
import {
  createTeam,
  deleteTeam,
  eachOf,
  listTeams,
  loadTeamDashboard,
  removeTeamMember,
  setTeamAvatar,
  setTeamPhoto,
  updateTeam,
} from "@/server/project/teams"
import { loadTeamFigures } from "@/server/project/team-figures"

export type {
  BulkResult,
  TeamListRow,
  TeamDashboard,
  TeamMemberRow,
  TeamSummary,
} from "@/server/project/teams"
export type { Announcement } from "@/server/project/announcements"
export type { InviteOutcome, SentInvite } from "@/server/project/invites"
export type { TeamFigures } from "@/server/project/team-figures"

const id = z.string().min(1).max(36)

const loadTeamDashboardFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object(teamScope))
  .handler(async ({ data, context }) => inTeam(data.teamId, () => loadTeamDashboard(context.user.id)))

/** The four figures under the team's name on the Team dashboard. */
const loadTeamFiguresFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object(teamScope))
  .handler(async ({ data, context }) =>
    inTeam(data.teamId, async () =>
      (await findMembership(context.user.id)) ? loadTeamFigures(context.user.id) : null
    )
  )

const setTeamPhotoFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(teamPhotoSchema.extend(teamScope))
  .handler(async ({ data, context }) => inTeam(data.teamId, () => setTeamPhoto(context.user.id, data.photoUrl)))

const setTeamAvatarFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(teamPhotoSchema.extend(teamScope))
  .handler(async ({ data, context }) => inTeam(data.teamId, () => setTeamAvatar(context.user.id, data.photoUrl)))

const createTeamFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(createTeamSchema)
  .handler(async ({ data, context }) => createTeam(context.user.id, data))

const updateTeamFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(updateTeamSchema.extend(teamScope))
  .handler(async ({ data: { teamId, ...data }, context }) => inTeam(teamId, () => updateTeam(context.user.id, data)))

const removeMembersFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ userIds: z.array(id).min(1).max(200), ...teamScope }))
  .handler(async ({ data, context }) =>
    inTeam(data.teamId, () => eachOf(data.userIds, (userId) => removeTeamMember(context.user.id, userId)))
  )

const createInviteFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(inviteSchema.extend(teamScope))
  .handler(async ({ data: { teamId, ...data }, context }) => inTeam(teamId, () => createInvite(context.user, data)))

const createInvitesFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(inviteManySchema.extend(teamScope))
  .handler(async ({ data: { teamId, ...data }, context }) => inTeam(teamId, () => createInvites(context.user, data)))

const resendInviteFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ userId: id, ...teamScope }))
  .handler(async ({ data, context }) => inTeam(data.teamId, () => resendInvite(context.user, data.userId)))

/** Every team with its counts, for the site admin's Teams dashboard. */
const listTeamsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) => listTeams(context.user.id))

const deleteTeamFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ teamId: id }))
  .handler(async ({ data, context }) => deleteTeam(context.user.id, data.teamId))

export function loadTeamDashboardPage(teamId?: string) {
  return loadTeamDashboardFn({ data: { teamId } })
}
export function loadFigures(teamId?: string) {
  return loadTeamFiguresFn({ data: { teamId } })
}
export function saveTeamPhoto(photoUrl: string, teamId?: string) {
  return setTeamPhotoFn({ data: { photoUrl, teamId } })
}
export function saveTeamAvatar(avatarUrl: string, teamId?: string) {
  return setTeamAvatarFn({ data: { photoUrl: avatarUrl, teamId } })
}
export function createProjectTeam(data: z.input<typeof createTeamSchema>) {
  return createTeamFn({ data })
}
export function updateProjectTeam(data: z.input<typeof updateTeamSchema>, teamId?: string) {
  return updateTeamFn({ data: { ...data, teamId } })
}
export function removeManyFromTeam(userIds: string[], teamId?: string) {
  return removeMembersFn({ data: { userIds, teamId } })
}
export function inviteToTeam(data: z.input<typeof inviteSchema>, teamId?: string) {
  return createInviteFn({ data: { ...data, teamId } })
}
export function inviteManyToTeam(data: z.input<typeof inviteManySchema>, teamId?: string) {
  return createInvitesFn({ data: { ...data, teamId } })
}
/** A fresh "Set your password" email for someone invited who hasn't opened theirs. */
export function resendTeamInvite(userId: string, teamId?: string) {
  return resendInviteFn({ data: { userId, teamId } })
}
export function loadTeams() {
  return listTeamsFn()
}
export function deleteProjectTeam(teamId: string) {
  return deleteTeamFn({ data: { teamId } })
}

/** Each one rings everyone's bell, so an owner or admin can post 20 an hour at most. */
const postAnnouncementFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(announcementSchema.extend(teamScope))
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
    return inTeam(data.teamId, () => postAnnouncement(context.user, data.text))
  })

const takeDownAnnouncementFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object(teamScope))
  .handler(async ({ data, context }) => inTeam(data.teamId, () => takeDownAnnouncement(context.user)))

const hideAnnouncementFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ announcementId: id, ...teamScope }))
  .handler(async ({ data, context }) =>
    inTeam(data.teamId, () => hideAnnouncement(context.user.id, data.announcementId))
  )

const markAnnouncementSeenFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ announcementId: id, ...teamScope }))
  .handler(async ({ data, context }) =>
    inTeam(data.teamId, () => markAnnouncementSeen(context.user.id, data.announcementId))
  )

export function postTeamAnnouncement(text: string, teamId?: string) {
  return postAnnouncementFn({ data: { text, teamId } })
}
export function takeDownTeamAnnouncement(teamId?: string) {
  return takeDownAnnouncementFn({ data: { teamId } })
}
/** The announcement showed on my Team dashboard. */
export function markTeamAnnouncementSeen(announcementId: string, teamId?: string) {
  return markAnnouncementSeenFn({ data: { announcementId, teamId } })
}
export function hideTeamAnnouncement(announcementId: string, teamId?: string) {
  return hideAnnouncementFn({ data: { announcementId, teamId } })
}
