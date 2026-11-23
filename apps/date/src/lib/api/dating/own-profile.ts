import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import type { ProfileSuggestion } from "@/lib/dating/own-profile"
import { requestAccount } from "@/server/dating/accounts"
import { applySuggestion, startPhotoTest, stopPhotoTest, undoLastApply } from "@/server/dating/own-profile"
import { inWords } from "@/server/dating/words"
import { userPost } from "@/server/guards"

/**
 * The My profile panel's server functions: Apply one of the AI's
 * suggestions, Undo the last Apply, and start or stop the first-photo test.
 * Every one is behind sign-in and acts on the member's own open profile and
 * its phone only.
 */

const applyInput = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("photos") }),
  z.object({ kind: z.literal("bio") }),
  z.object({ kind: z.literal("prompt"), question: z.string().min(1).max(500) }),
])

const applyFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(applyInput)
  .handler(async ({ data, context }) => inWords(async () => applySuggestion(await requestAccount(context.user.id), data)))

/** Apply: the phone makes this one suggestion on Tinder and reads the profile back to check it. */
export function applyProfileSuggestion(what: ProfileSuggestion) {
  return applyFn({ data: what })
}

const undoFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .handler(async ({ context }) => inWords(async () => undoLastApply(await requestAccount(context.user.id))))

/** Undo: the phone puts back what the last Apply replaced. */
export function undoProfileApply() {
  return undoFn()
}

const photoTestFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ run: z.boolean() }))
  .handler(async ({ data, context }) =>
    inWords(async () => {
      const account = await requestAccount(context.user.id)
      if (data.run) await startPhotoTest(account)
      else await stopPhotoTest(account)
    })
  )

/** Test my first photo: each of the top 3 photos first for a week. */
export function startFirstPhotoTest() {
  return photoTestFn({ data: { run: true } })
}

/** Stops the test and puts the order from before it back. */
export function stopFirstPhotoTest() {
  return photoTestFn({ data: { run: false } })
}
