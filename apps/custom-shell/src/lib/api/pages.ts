import { createServerFn } from "@tanstack/react-start"
import { notFound, redirect } from "@tanstack/react-router"
import { z } from "zod"

import {
  PAGE_VISIBILITIES,
  type PageVisibility,
  type ShellPageOverrides,
} from "@/lib/pages/page-visibility"
import { adminGet, adminPost } from "@/server/guards"
import {
  loadPagesOverview as loadPagesOverviewQuery,
  readPageVisibility,
  setPageVisibility,
  type PagesOverview,
  type PublicPageRow,
} from "@/server/pages"
import { findSessionContext } from "@/server/security"

import { createErrorMessage, describeAuthError } from "./error-message"

export type { PagesOverview, PublicPageRow }

export const getPagesErrorMessage = createErrorMessage(
  { FORBIDDEN: "Only an admin can see the pages list." },
  "The pages list could not be loaded. Please try again."
)

/**
 * Saving is its own message, because the reasons a save is refused are already
 * written for the reader — "Pricing is part of how people reach the app, so it
 * cannot be hidden" — and folding them into the loader's lookup would replace
 * every one of them with "the pages list could not be loaded", which is both
 * wrong and about the opposite action.
 */
export function getPageVisibilityErrorMessage(error: unknown) {
  const message =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : ""
  return (
    describeAuthError(message) ??
    (message || "That change could not be saved. Please try again.")
  )
}

const loadPagesOverviewFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async (): Promise<PagesOverview> => {
    return loadPagesOverviewQuery()
  })

export function loadPagesOverview() {
  return loadPagesOverviewFn()
}

const setPageVisibilityFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      path: z.string().min(1).max(160),
      visibility: z.enum(PAGE_VISIBILITIES),
    })
  )
  .handler(async ({ data }): Promise<ShellPageOverrides> => {
    return setPageVisibility(data)
  })

export function savePageVisibility(input: {
  path: string
  visibility: PageVisibility
}) {
  return setPageVisibilityFn({ data: input })
}

/**
 * What a public page's own loader needs to know: may the person looking at it
 * see it, and if not, why.
 *
 * No guard on purpose, the same as the maintenance notice: this decides what a
 * signed-out visitor is shown, so requiring a session would make every page it
 * protects unreachable. It tells the caller nothing they could not already
 * work out by opening the page — only whether this browser has a session at
 * all, which that browser owns.
 */
const readPageAccessFn = createServerFn({ method: "GET" })
  .inputValidator(z.object({ path: z.string().min(1).max(160) }))
  .handler(
    async ({ data }): Promise<{ visibility: PageVisibility; signedIn: boolean }> => {
      const [visibility, session] = await Promise.all([
        readPageVisibility(data.path),
        findSessionContext(),
      ])
      return { visibility, signedIn: Boolean(session) }
    }
  )

/**
 * The line a switchable public page puts at the top of its loader.
 *
 * Switched off answers not-found rather than a redirect, so a hidden page is
 * indistinguishable from one that never existed — a redirect would confirm
 * the page is there and merely closed. Members-only sends a signed-out visitor
 * to sign in carrying where they were headed, because somebody following a
 * link from an email should be able to sign in and carry on.
 *
 * `lib/pages/page-visibility.test.ts` checks that every page the shell lets an
 * admin switch off calls this, so a page added later cannot quietly skip it.
 */
export async function requirePageVisible(path: string): Promise<void> {
  const { visibility, signedIn } = await readPageAccessFn({ data: { path } })

  if (visibility === "off") {
    throw notFound()
  }
  if (visibility === "members" && !signedIn) {
    throw redirect({ to: "/login", search: { redirect: path } })
  }
}
