import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { HANDLE_MAX_LENGTH } from "@/lib/pomodoro/public-profile"
import { findCurrentUser } from "@/server/auth/security"
import { userGet, userPost } from "@/server/guards"
import {
  loadTeamPageSettings,
  readTeamPage as readTeamPageRow,
  saveTeamPageSettings,
} from "@/server/pomodoro/teams"

/**
 * A focus group's public page (public profile task 05).
 *
 * The read is open on purpose: `/team/<handle>` is a page for the open
 * internet. It is written down in `src/app/open-endpoints.ts` with the
 * reason, which is what `src/server/guards.test.ts` checks. The two settings
 * endpoints are the owner's, signed in, and the owner is proved again in
 * `src/server/pomodoro/teams.ts`.
 */

const handleSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(HANDLE_MAX_LENGTH)
const groupIdSchema = z.object({ groupId: z.string().uuid() })

// Signed-out on purpose. It answers the group's name, the members who have a
// public page of their own, and the hours of only those who publish them, and
// null for every kind of missing page alike. No user id is in the answer.
// Listed in appOpenEndpoints for the guard test.
const readTeamPageFn = createServerFn({ method: "GET" })
  .inputValidator(z.object({ handle: handleSchema }))
  .handler(async ({ data }) => {
    // A block hides a member from the reader who blocked them, and "You" marks
    // the reader's own row; both need to know who is reading, if anybody.
    const viewer = await findCurrentUser()
    return readTeamPageRow(data.handle, viewer?.id ?? null)
  })

const loadTeamPageSettingsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(groupIdSchema)
  .handler(async ({ data, context }) =>
    loadTeamPageSettings(context.user.id, data.groupId)
  )

const saveTeamPageSettingsFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    groupIdSchema.extend({
      handle: handleSchema.nullable(),
      pagePublic: z.boolean(),
    })
  )
  .handler(async ({ data, context }) =>
    saveTeamPageSettings(context.user.id, data.groupId, {
      handle: data.handle,
      pagePublic: data.pagePublic,
    })
  )

export const readTeamPage = (handle: string) =>
  readTeamPageFn({ data: { handle } })
export const loadTeamPage = (groupId: string) =>
  loadTeamPageSettingsFn({ data: { groupId } })
export const saveTeamPage = (
  groupId: string,
  settings: { handle: string | null; pagePublic: boolean }
) => saveTeamPageSettingsFn({ data: { groupId, ...settings } })
