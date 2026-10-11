import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { handOverAllSchema, memberTitleSchema } from "@/lib/project/rules"
import { userGet, userPost } from "@/server/guards"
import {
  handOverAllTasks,
  joinTeamByLink,
  loadJoinOffer,
  loadNeedsAttention,
  loadWorkload,
  makeJoinLink,
  setMemberTitle,
  turnOffJoinLink,
} from "@/server/project/team-running"

export type {
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

const loadNeedsAttentionFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) => loadNeedsAttention(context.user.id))

const loadWorkloadFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) => loadWorkload(context.user.id))

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

const loadJoinOfferFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ token }))
  .handler(async ({ data, context }) => loadJoinOffer(context.user.id, data.token))

const joinByLinkFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ token }))
  .handler(async ({ data, context }) => joinTeamByLink(context.user, data.token))

const setTitleFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(memberTitleSchema)
  .handler(async ({ data, context }) => setMemberTitle(context.user.id, data))

export function loadAttention() {
  return loadNeedsAttentionFn()
}
export function loadTeamWorkload() {
  return loadWorkloadFn()
}
export function handOverAll(fromUserId: string, toUserId: string) {
  return handOverAllFn({ data: { fromUserId, toUserId } })
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
export function joinThroughLink(joinToken: string) {
  return joinByLinkFn({ data: { token: joinToken } })
}
export function saveMemberTitle(data: z.input<typeof memberTitleSchema>) {
  return setTitleFn({ data })
}
