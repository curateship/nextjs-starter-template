import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { createErrorMessage } from "../error-message"
import { enforceRateLimit } from "@/server/auth/rate-limit"
import { userGet, userPost } from "@/server/guards"
import {
  listMemberImports,
  requestMemberImports,
  type MemberImportResult,
  type MemberImportRow,
} from "@/server/pomodoro/member-imports"
import { MEMBER_IMPORT_MAX_LINKS } from "@/lib/pomodoro/member-imports"

export type { MemberImportResult, MemberImportRow }

/**
 * "From a Pixabay link" in the upload window (task 06, part 8): queue the
 * pasted links, and read back how the member's recent ones went.
 */

export const getMemberImportErrorMessage = createErrorMessage(
  {
    PRO_REQUIRED: "Importing from Pixabay is a Pro perk, like uploading.",
    STORAGE_QUOTA_EXCEEDED:
      "Your space is full. Delete something you no longer use, then import.",
    PIXABAY_IMPORTS_OFF: "Importing from Pixabay is not switched on yet.",
    RATE_LIMITED:
      "That is a lot of imports at once. Please wait a few minutes and try again.",
  },
  "Those links could not be imported. Please try again."
)

const listFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) => listMemberImports(context.user.id))

const requestFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({
      links: z
        .array(z.string().trim().min(1).max(500))
        .min(1)
        .max(MEMBER_IMPORT_MAX_LINKS),
    })
  )
  .handler(async ({ data, context }) => {
    await enforceRateLimit(`pomodoro-member-import:${context.user.id}`, {
      maxAttempts: 20,
      windowSeconds: 10 * 60,
    })
    return requestMemberImports(context.user.id, data.links)
  })

export const loadMemberImports = () => listFn()

export const importPixabayLinks = (links: string[]) =>
  requestFn({ data: { links } })
