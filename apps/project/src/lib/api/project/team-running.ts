import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import {
  LIMITS,
  handOverAllSchema,
  holidaySchema,
  joinByLinkSchema,
  memberTitleSchema,
} from "@/lib/project/rules"
import { requestIp, requireAppOrigin } from "@/server/auth/origin"
import { enforceRateLimit } from "@/server/auth/rate-limit"
import { enforceHumanCheck } from "@/server/auth/turnstile"
import { teamScope } from "@/lib/api/project/scope"
import { userGet, userPost } from "@/server/guards"
import { inTeam } from "@/server/project/access"
import { addHoliday, removeHoliday } from "@/server/project/holidays"
import {
  handOverAllTasks,
  loadPeopleRoom,
  joinTeamByLink,
  loadJoinOffer,
  loadNeedsAttention,
  loadWorkload,
  makeJoinLink,
  setMemberTitle,
  turnOffJoinLink,
} from "@/server/project/team-running"
import { loadTeamMember, loadTeammate } from "@/server/project/teammate"

export type { Holiday } from "@/server/project/holidays"
export type { Teammate } from "@/server/project/teammate"
export type {
  PersonRoom,
  AttentionKind,
  AttentionRow,
  HandOverOutcome,
  JoinLinkState,
  JoinOffer,
  WorkloadBucket,
  WorkloadRow,
} from "@/server/project/team-running"

/** Needs attention, workload, handing over all of someone's tasks, the join link and job titles. */

const token = z.string().min(1).max(128)

const loadTeamMemberFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ userId: z.string().min(1).max(36), ...teamScope }))
  .handler(async ({ data, context }) => inTeam(data.teamId, () => loadTeamMember(context.user.id, data.userId)))

const loadTeammateFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ userId: z.string().min(1).max(36), ...teamScope }))
  .handler(async ({ data, context }) => inTeam(data.teamId, () => loadTeammate(context.user.id, data.userId)))

const loadNeedsAttentionFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object(teamScope))
  .handler(async ({ data, context }) => inTeam(data.teamId, () => loadNeedsAttention(context.user.id)))

const loadWorkloadFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ client: z.string().trim().min(1).max(LIMITS.clientName).optional(), ...teamScope }))
  .handler(async ({ data, context }) =>
    inTeam(data.teamId, () => loadWorkload(context.user.id, undefined, undefined, data.client))
  )

const handOverAllFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(handOverAllSchema.extend(teamScope))
  .handler(async ({ data: { teamId, ...data }, context }) => inTeam(teamId, () => handOverAllTasks(context.user, data)))

const makeJoinLinkFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object(teamScope))
  .handler(async ({ data, context }) => inTeam(data.teamId, () => makeJoinLink(context.user.id)))

const turnOffJoinLinkFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object(teamScope))
  .handler(async ({ data, context }) => inTeam(data.teamId, () => turnOffJoinLink(context.user.id)))

/** The team behind a join link. Signed out: the link is how a new person arrives. */
const loadJoinOfferFn = createServerFn({ method: "GET" })
  .inputValidator(z.object({ token }))
  .handler(async ({ data }) => loadJoinOffer(data.token))

/**
 * Joins through a link, signed out. It makes an account and sends an email,
 * so it takes the same guards as the shell's own sign-up: the app's own
 * origin, 10 tries an hour from one address, and the human check.
 */
const joinByLinkFn = createServerFn({ method: "POST" })
  .inputValidator(
    joinByLinkSchema.extend({ token, humanCheckToken: z.string().max(4096).optional() })
  )
  .handler(async ({ data }) => {
    requireAppOrigin()
    try {
      await enforceRateLimit(`project-join:${requestIp()}`, { maxAttempts: 10, windowSeconds: 60 * 60 })
      await enforceRateLimit(`project-invite-to:${data.email}`, { maxAttempts: 5, windowSeconds: 24 * 60 * 60 })
    } catch (error) {
      if (error instanceof Error && error.message.includes("RATE_LIMITED")) {
        throw new Error(PROJECT_ERRORS.joinLinkBusy)
      }
      throw error
    }
    await enforceHumanCheck(data.humanCheckToken)
    return joinTeamByLink({ name: data.name, email: data.email }, data.token)
  })

const setTitleFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(memberTitleSchema.extend(teamScope))
  .handler(async ({ data: { teamId, ...data }, context }) => inTeam(teamId, () => setMemberTitle(context.user.id, data)))

export function loadAttention(teamId?: string) {
  return loadNeedsAttentionFn({ data: { teamId } })
}
/** Everyone's open work, or one client's when `client` is a name or "No client". */
export function loadTeamWorkload(client?: string, teamId?: string) {
  return loadWorkloadFn({ data: { client, teamId } })
}
export function handOverAll(fromUserId: string, toUserId: string, note: string | null = null, teamId?: string) {
  return handOverAllFn({ data: { fromUserId, toUserId, note, teamId } })
}
export function newJoinLink(teamId?: string) {
  return makeJoinLinkFn({ data: { teamId } })
}
export function stopJoinLink(teamId?: string) {
  return turnOffJoinLinkFn({ data: { teamId } })
}
export function loadJoinLink(joinToken: string) {
  return loadJoinOfferFn({ data: { token: joinToken } })
}
export function joinThroughLink(data: {
  token: string
  name: string
  email: string
  humanCheckToken?: string
}) {
  return joinByLinkFn({ data })
}
export function saveMemberTitle(data: z.input<typeof memberTitleSchema>, teamId?: string) {
  return setTitleFn({ data: { ...data, teamId } })
}

const loadPeopleRoomFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object(teamScope))
  .handler(async ({ data, context }) => inTeam(data.teamId, () => loadPeopleRoom(context.user.id)))

const addHolidayFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(holidaySchema.extend(teamScope))
  .handler(async ({ data: { teamId, ...data }, context }) => inTeam(teamId, () => addHoliday(context.user.id, data)))

const removeHolidayFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ holidayId: z.string().min(1).max(36), ...teamScope }))
  .handler(async ({ data, context }) => inTeam(data.teamId, () => removeHoliday(context.user.id, data.holidayId)))

/** Each teammate's open tasks and time off, for the hand-to pickers. */
export function loadRoom(teamId?: string) {
  return loadPeopleRoomFn({ data: { teamId } })
}
export function addTeamHoliday(data: z.input<typeof holidaySchema>, teamId?: string) {
  return addHolidayFn({ data: { ...data, teamId } })
}
export function removeTeamHoliday(holidayId: string, teamId?: string) {
  return removeHolidayFn({ data: { holidayId, teamId } })
}
/** A teammate's page: their open tasks in projects I can see, and their time off. */
export function loadTeammatePage(userId: string, teamId?: string) {
  return loadTeammateFn({ data: { userId, teamId } })
}
/** One teammate's row and my role, to open their page from their name in a chat. */
export function loadTeamMemberRow(userId: string, teamId?: string) {
  return loadTeamMemberFn({ data: { userId, teamId } })
}
