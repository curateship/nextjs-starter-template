import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { CHEER_IDS } from "@/lib/pomodoro/cheers"
import { HANDLE_MAX_LENGTH } from "@/lib/pomodoro/public-profile"
import { userGet, userPost } from "@/server/guards"
import {
  followByHandle,
  forgetFollowingFeed,
  isFollowing as isFollowingRow,
  listFollowing as listFollowingRows,
  readFollowingFeed,
  sendCheer as sendCheerRow,
  setCheersEnabled as setCheersEnabledRow,
  unfollowByHandle,
} from "@/server/pomodoro/following"
import {
  blockByHandle,
  listBlockedAccounts,
  unblockByHandle,
} from "@/server/pomodoro/blocked-accounts"

/**
 * Following, cheering and blocking. Every endpoint here carries a guard,
 * because every one of them is somebody acting as themselves.
 *
 * Nobody is followed, cheered, blocked or unblocked by a user id. A handle is
 * the public name of an account and it is the only name these take.
 */

const handleSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(HANDLE_MAX_LENGTH)

const followFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ handle: handleSchema }))
  .handler(async ({ data, context }) => {
    const result = await followByHandle(context.user.id, data.handle)
    // The feed is held for a few minutes, and a new follow should show up on
    // the next load rather than after the window runs out.
    forgetFollowingFeed(context.user.id)
    return result
  })

const unfollowFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ handle: handleSchema }))
  .handler(async ({ data, context }) => {
    const result = await unfollowByHandle(context.user.id, data.handle)
    forgetFollowingFeed(context.user.id)
    return result
  })

const isFollowingFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ handle: handleSchema }))
  .handler(async ({ data, context }) =>
    isFollowingRow(context.user.id, data.handle)
  )

const feedFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) => readFollowingFeed(context.user.id))

const listFollowingFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) => listFollowingRows(context.user.id))

const cheerFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({ handle: handleSchema, cheerId: z.enum(CHEER_IDS) })
  )
  .handler(async ({ data, context }) =>
    sendCheerRow({
      fromUserId: context.user.id,
      handle: data.handle,
      cheerId: data.cheerId,
    })
  )

const setCheersFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ enabled: z.boolean() }))
  .handler(async ({ data, context }) =>
    setCheersEnabledRow(context.user.id, data.enabled)
  )

const blockFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ handle: handleSchema }))
  .handler(async ({ data, context }) => {
    const result = await blockByHandle(context.user.id, data.handle)
    forgetFollowingFeed(context.user.id)
    return result
  })

const unblockFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ handle: handleSchema }))
  .handler(async ({ data, context }) =>
    unblockByHandle(context.user.id, data.handle)
  )

const blockedFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) => listBlockedAccounts(context.user.id))

export const followProfile = (handle: string) => followFn({ data: { handle } })
export const unfollowProfile = (handle: string) =>
  unfollowFn({ data: { handle } })
export const loadIsFollowing = (handle: string) =>
  isFollowingFn({ data: { handle } })
export const loadFollowingFeed = () => feedFn()
export const loadFollowing = () => listFollowingFn()
export const sendCheer = (handle: string, cheerId: string) =>
  // The id is re-checked against the fixed list by the schema above, so the
  // cast is a boundary detail rather than a trusted claim.
  cheerFn({ data: { handle, cheerId: cheerId as (typeof CHEER_IDS)[number] } })
export const setCheersEnabled = (enabled: boolean) =>
  setCheersFn({ data: { enabled } })
export const blockProfile = (handle: string) => blockFn({ data: { handle } })
export const unblockProfile = (handle: string) =>
  unblockFn({ data: { handle } })
export const loadBlockedAccounts = () => blockedFn()
