import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { editorGet } from "@/server/social/editor-guards"
import { actorFor } from "@/server/social/project-guests"

/**
 * Who is on the guest page (`/guest/promo/<project id>`): the Project
 * person's name when this browser holds a guest sign-in for the project, or
 * null for a signed-in admin looking at the same page. Anyone else is
 * refused, which the page turns into "Open the task in Project again".
 */
const guestFn = createServerFn({ method: "GET" })
  .middleware([editorGet])
  .inputValidator(z.object({ projectId: z.string().min(1).max(36) }))
  .handler(async ({ context, data }): Promise<{ name: string | null }> => {
    const actor = await actorFor(context.caller, data.projectId)
    return { name: actor.guest?.personName ?? null }
  })

export function loadGuestSession(projectId: string) {
  return guestFn({ data: { projectId } })
}
