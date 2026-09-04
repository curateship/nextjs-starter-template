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
  visitorWorkspaceId,
  workspaceIdForRequest,
} from "@/server/workspaces/for-request"
import {
  loadPagesOverview as loadPagesOverviewQuery,
  readPageVisibility,
  readPublicNotFoundDiscovery,
  readWrittenPageForViewer,
  setPageVisibility,
  type PagesOverview,
  type PublicPageRow,
  type WrittenPageView,
} from "@/server/content/pages"
import { findSessionContext } from "@/server/auth/security"
import { readBranding } from "@/server/shell-settings"
import type {
  PublicSeo,
  SocialCardType,
} from "@/lib/pages/public-metadata"
import type { PublicNotFoundDiscovery } from "@/lib/pages/not-found-discovery"
import {
  createWrittenPage,
  deleteWrittenPage,
  findWrittenPage,
  MAX_WRITTEN_PAGE_TITLE,
  updateWrittenPage,
  type WrittenPage,
} from "@/server/content/written-pages"

import { createErrorMessage, describeAuthError } from "../error-message"

export type { PagesOverview, PublicPageRow, WrittenPage, WrittenPageView }

type WrittenPageRouteView =
  | Exclude<WrittenPageView, { status: "ok" }>
  | {
      status: "ok"
      page: WrittenPage
      branding: {
        appName: string
        shareImage: string
        socialCardType: SocialCardType
        socialHandle: string
        publicSeo: PublicSeo
      }
    }

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
  .handler(async ({ context }): Promise<PagesOverview> => {
    return loadPagesOverviewQuery(await workspaceIdForRequest(context.user.id))
  })

export function loadPagesOverview() {
  return loadPagesOverviewFn()
}

const loadPublicNotFoundDiscoveryFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<PublicNotFoundDiscovery> => {
    return readPublicNotFoundDiscovery(await visitorWorkspaceId())
  }
)

/** Fresh 404 search and menu settings for the domain the visitor opened. */
export function loadPublicNotFoundDiscovery() {
  return loadPublicNotFoundDiscoveryFn()
}

const setPageVisibilityFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      path: z.string().min(1).max(160),
      visibility: z.enum(PAGE_VISIBILITIES),
    })
  )
  .handler(async ({ data, context }): Promise<ShellPageOverrides> => {
    return setPageVisibility(await workspaceIdForRequest(context.user.id), data)
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
      const [workspaceId, session] = await Promise.all([
        visitorWorkspaceId(),
        findSessionContext(),
      ])
      // No site at the address at all means nothing is hidden there, because
      // there is nothing there. The route above answers not-found on its own.
      const visibility = workspaceId
        ? await readPageVisibility(workspaceId, data.path)
        : "everyone"
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

// ---------------------------------------------------------------------------
// Pages an admin wrote. Three doors to change them, all admin-only, and one
// public read that the written page's own route uses.

const writtenPageInput = z.object({
  path: z.string().min(1).max(160),
  title: z.string().min(1).max(MAX_WRITTEN_PAGE_TITLE),
  // The body is checked by `cleanWrittenPageBody` on the server rather than
  // here: this is a tree of unknown depth, and the rule for it is "keep only
  // what is allowed", which a cleaner expresses better than a schema. Anything
  // at all may arrive; only the allowed shapes survive.
  body: z.unknown(),
})

const createWrittenPageFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(writtenPageInput)
  .handler(async ({ data, context }): Promise<WrittenPage> => {
    return createWrittenPage(await workspaceIdForRequest(context.user.id), data)
  })

const updateWrittenPageFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(writtenPageInput.partial().extend({ id: z.string().min(1) }))
  .handler(async ({ data, context }): Promise<WrittenPage> => {
    const { id, ...rest } = data
    return updateWrittenPage(
      await workspaceIdForRequest(context.user.id),
      id,
      rest
    )
  })

const deleteWrittenPageFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data, context }): Promise<{ path: string }> => {
    return deleteWrittenPage(await workspaceIdForRequest(context.user.id), data.id)
  })

/**
 * What a visitor may be shown at a written page's address.
 *
 * No guard, like the visibility read above and for the same reason: these
 * pages are public, so a session check here would hide every one of them.
 *
 * **Which is exactly why it decides visibility itself rather than handing the
 * page over and leaving that to the route.** Anything this returns is readable
 * by anyone who calls it directly, so a version that fetched first and checked
 * second would give up a switched-off page's words to anybody who asked — the
 * switch working in a browser and nowhere else.
 */
const readWrittenPageFn = createServerFn({ method: "GET" })
  .inputValidator(z.object({ path: z.string().min(1).max(160) }))
  .handler(async ({ data }): Promise<WrittenPageRouteView> => {
    // The domain decides which site's page this is — never the reader's own
    // site, or an admin signed in to Alpha would be served Alpha's `/about`
    // while standing on Beta's domain.
    const [workspaceId, session] = await Promise.all([
      visitorWorkspaceId(),
      findSessionContext(),
    ])
    if (!workspaceId) return { status: "missing" }

    const view = await readWrittenPageForViewer(
      workspaceId,
      data.path,
      Boolean(session)
    )
    if (view.status !== "ok") return view

    const branding = await readBranding()
    return {
      ...view,
      branding: {
        appName: branding.appName,
        shareImage: branding.shareImage,
        socialCardType: branding.socialCardType,
        socialHandle: branding.socialHandle,
        publicSeo: branding.publicSeo,
      },
    }
  })

/**
 * The same page, for the admin who is about to change it.
 *
 * A separate door from the visitor's read above, because the two want opposite
 * things. The visitor's read reports a switched-off page as missing, on
 * purpose — that is the switch working. An admin editing the Pages screen has
 * to reach exactly those pages: hiding a page they can no longer open again
 * would make "Switched off" a one-way door.
 *
 * So this one skips visibility entirely and is guarded instead, which is the
 * usual trade: the public read may be called by anyone and therefore decides
 * for itself, and this one answers only an admin.
 */
const readWrittenPageForEditFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ path: z.string().min(1).max(160) }))
  .handler(async ({ data, context }): Promise<WrittenPage | null> => {
    return findWrittenPage(await workspaceIdForRequest(context.user.id), data.path)
  })

export function saveNewWrittenPage(input: {
  path: string
  title: string
  body: unknown
}) {
  return createWrittenPageFn({ data: input })
}

export function saveWrittenPage(input: {
  id: string
  path?: string
  title?: string
  body?: unknown
}) {
  return updateWrittenPageFn({ data: input })
}

export function removeWrittenPage(id: string) {
  return deleteWrittenPageFn({ data: { id } })
}

/** What the public route shows a visitor: the page, or why not. */
export function loadWrittenPage(path: string) {
  return readWrittenPageFn({ data: { path } })
}

/** The page itself for the editor, switched off or not. Null if it is gone. */
export function loadWrittenPageForEdit(path: string) {
  return readWrittenPageForEditFn({ data: { path } })
}

/**
 * Why a written page could not be saved. Its refusals are already sentences an
 * admin can act on — "About already answers on /about" — so they pass straight
 * through rather than being flattened into one generic line.
 */
export function getWrittenPageErrorMessage(error: unknown) {
  const message =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : ""
  return (
    describeAuthError(message) ??
    (message || "That page could not be saved. Please try again.")
  )
}
