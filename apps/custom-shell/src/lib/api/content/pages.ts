import { createServerFn } from "@tanstack/react-start"
import { notFound, redirect } from "@tanstack/react-router"
import { z } from "zod"

import {
  PAGE_VISIBILITIES,
  type PageVisibility,
  type ShellPageOverrides,
} from "@/lib/pages/page-visibility"
import { adminGet, adminPost } from "@/server/guards"
import { writePageBlock } from "@/server/content/page-blocks"
import { isOwnedImageUrl } from "@/server/media/library"
import {
  createFrontPageRowDraft,
  MAX_FRONT_PAGE_IMAGE_ALT_LENGTH,
  MAX_FRONT_PAGE_IMAGE_URL_LENGTH,
  normalizeFrontPageImageUrl,
} from "@/lib/pages/front-page"
import {
  publicPagesWorkspaceId,
  visitorWorkspaceId,
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
import { MAX_CANONICAL_URL_LENGTH } from "@/lib/pages/page-indexing"
import type {
  PublicSeo,
  SocialCardType,
} from "@/lib/pages/public-metadata"
import type { PublicNotFoundDiscovery } from "@/lib/pages/not-found-discovery"
import {
  createWrittenPage,
  deleteWrittenPage,
  findWrittenPage,
  findWrittenPageById,
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
        /** The domain this visitor used, so a canonical path can become a URL. */
        publicOrigin: string
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
    // The site whose public pages are being built, for every part of this
    // screen. A page, its blocks, who may see it and how many visits it had
    // are four facts about one page, and reading them from two different sites
    // is how an admin writes a page they then cannot find.
    return loadPagesOverviewQuery(await publicPagesWorkspaceId(context.user.id))
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
    return setPageVisibility(await publicPagesWorkspaceId(context.user.id), data)
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
  hiddenFromSearch: z.boolean(),
  // Checked rather than merely bounded on the server: `normalizeCanonicalUrl`
  // turns anything it does not recognise into empty, so a wrong address never
  // reaches a canonical tag.
  canonicalUrl: z.string().max(MAX_CANONICAL_URL_LENGTH),
  // The page's own picture. Bounded here; whether it is a picture in this
  // admin's own media library is checked by `ownedPicture` below, and an
  // empty string is the page having none.
  image: z.string().trim().max(MAX_FRONT_PAGE_IMAGE_URL_LENGTH),
  // The library's own name for that file, which the picker hands over, so
  // nobody is asked to type one.
  imageAlt: z.string().max(MAX_FRONT_PAGE_IMAGE_ALT_LENGTH),
})

/**
 * The picture as it will be stored, once it is known to be this admin's own.
 *
 * **Checked here rather than deeper down, because this is the layer that knows
 * who is asking.** The same rule a block's picture follows: a new picture has
 * to be one of theirs, and the sentence says what to do about it. A page that
 * is already drawing a picture is not asked to re-own it — `was` is what it
 * had — or a page whose file was tidied out of the library months ago could
 * never have its name changed again.
 */
async function ownedPicture(
  userId: string,
  input: { image?: string; imageAlt?: string },
  was: string
) {
  const image = normalizeFrontPageImageUrl(input.image)
  if (image && image !== was && !(await isOwnedImageUrl(userId, image))) {
    throw new Error(
      "That picture is no longer in your media library. Pick another one."
    )
  }
  return { image, imageAlt: input.imageAlt ?? "" }
}

/**
 * A new page arrives with a name, an address and a picture if it wants one.
 * Everything else about it has a default, and what goes on it is blocks,
 * written in the editor this opens.
 */
const createWrittenPageFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    writtenPageInput.partial({
      hiddenFromSearch: true,
      canonicalUrl: true,
      image: true,
      imageAlt: true,
    })
  )
  .handler(async ({ data, context }): Promise<WrittenPage> => {
    const workspaceId = await publicPagesWorkspaceId(context.user.id)
    const page = await createWrittenPage(workspaceId, {
      ...data,
      // Refused before the page exists, so a picture that is not this admin's
      // leaves no half-built page behind.
      ...(await ownedPicture(context.user.id, data, "")),
    })
    // One empty block of words, so the editor opens on something to type into
    // rather than on an empty page with a picker beside it.
    await writePageBlock(context.user.id, workspaceId, {
      path: page.path,
      block: {
        ...createFrontPageRowDraft("words"),
        id: `words-${page.id}`,
        heading: page.title,
        layout: "narrow",
      },
    })
    return page
  })

const updateWrittenPageFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(writtenPageInput.partial().extend({ id: z.string().min(1) }))
  .handler(async ({ data, context }): Promise<WrittenPage> => {
    const { id, ...rest } = data
    const workspaceId = await publicPagesWorkspaceId(context.user.id)
    if (rest.image === undefined) {
      return updateWrittenPage(workspaceId, id, rest)
    }

    // The picture the page is drawing now. Looked up by id, because the
    // address is one of the things this save may be changing, and handed to
    // the check so an unchanged picture is never asked to be owned again.
    const saved = await findWrittenPageById(workspaceId, id)
    if (!saved) throw new Error("That page no longer exists.")

    return updateWrittenPage(workspaceId, id, {
      ...rest,
      ...(await ownedPicture(context.user.id, rest, saved.image)),
    })
  })

const deleteWrittenPageFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data, context }): Promise<{ path: string }> => {
    return deleteWrittenPage(
      await publicPagesWorkspaceId(context.user.id),
      data.id
    )
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
        publicOrigin: branding.publicOrigin,
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
    return findWrittenPage(
      await publicPagesWorkspaceId(context.user.id),
      data.path
    )
  })

export function saveNewWrittenPage(input: {
  path: string
  title: string
  /** A picture for the top of the page, or empty for none. */
  image?: string
  /** The library's own name for that picture, for a screen reader. */
  imageAlt?: string
}) {
  return createWrittenPageFn({ data: input })
}

export function saveWrittenPage(input: {
  id: string
  path?: string
  title?: string
  hiddenFromSearch?: boolean
  canonicalUrl?: string
  /** A picture for the top of the page, or empty to take it off. */
  image?: string
  /** The library's own name for that picture, for a screen reader. */
  imageAlt?: string
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
