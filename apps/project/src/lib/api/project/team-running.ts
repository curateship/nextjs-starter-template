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
import { userGet, userPost } from "@/server/guards"
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
  .inputValidator(z.object({ userId: z.string().min(1).max(36) }))
  .handler(async ({ data, context }) => loadTeamMember(context.user.id, data.userId))

const loadTeammateFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ userId: z.string().min(1).max(36) }))
  .handler(async ({ data, context }) => loadTeammate(context.user.id, data.userId))

const loadNeedsAttentionFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) => loadNeedsAttention(context.user.id))

const loadWorkloadFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ client: z.string().trim().min(1).max(LIMITS.clientName).optional() }))
  .handler(async ({ data, context }) => loadWorkload(context.user.id, undefined, undefined, data.client))

const handOverAllFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(handOverAllSchema)
  .handler(async ({ data, context }) => handOverAllTasks(context.user, data))

const makeJoinLinkFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .handler(async ({ context }) => makeJoinLink(context.user.id))

const turnOffJoinLinkFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .handler(async ({ context }) => turnOffJoinLink(context.user.id))

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
  .inputValidator(memberTitleSchema)
  .handler(async ({ data, context }) => setMemberTitle(context.user.id, data))

export function loadAttention() {
  return loadNeedsAttentionFn()
}
/** Everyone's open work, or one client's when `client` is a name or "No client". */
export function loadTeamWorkload(client?: string) {
  return loadWorkloadFn({ data: { client } })
}
export function handOverAll(fromUserId: string, toUserId: string, note: string | null = null) {
  return handOverAllFn({ data: { fromUserId, toUserId, note } })
}
export function newJoinLink() {
  return makeJoinLinkFn()
}
export function stopJoinLink() {
  return turnOffJoinLinkFn()
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
export function saveMemberTitle(data: z.input<typeof memberTitleSchema>) {
  return setTitleFn({ data })
}

const loadPeopleRoomFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) => loadPeopleRoom(context.user.id))

const addHolidayFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(holidaySchema)
  .handler(async ({ data, context }) => addHoliday(context.user.id, data))

const removeHolidayFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ holidayId: z.string().min(1).max(36) }))
  .handler(async ({ data, context }) => removeHoliday(context.user.id, data.holidayId))

/** Each teammate's open tasks and time off, for the hand-to pickers. */
export function loadRoom() {
  return loadPeopleRoomFn()
}
export function addTeamHoliday(data: z.input<typeof holidaySchema>) {
  return addHolidayFn({ data })
}
export function removeTeamHoliday(holidayId: string) {
  return removeHolidayFn({ data: { holidayId } })
}
/** A teammate's page: their open tasks in projects I can see, and their time off. */
export function loadTeammatePage(userId: string) {
  return loadTeammateFn({ data: { userId } })
}
/** One teammate's row and my role, to open their page from their name in a chat. */
export function loadTeamMemberRow(userId: string) {
  return loadTeamMemberFn({ data: { userId } })
}
