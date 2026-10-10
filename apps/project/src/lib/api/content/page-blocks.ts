import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  MAX_FRONT_PAGE_ROWS,
  type FrontPageListedPage,
  type FrontPageRow,
} from "@/lib/pages/front-page"
import { MAX_FRONT_PAGE_ROW_ID_LENGTH } from "@/lib/pages/front-page"
import { MAX_PAGE_PATH_LENGTH } from "@/lib/pages/page-descriptor"
import { frontPageRowSchema } from "@/lib/api/front-page-row-schema"
import { adminGet, adminPost } from "@/server/guards"
import {
  deletePageBlock,
  readPageBlocks,
  readVisiblePageBlocks,
  writePageBlock,
  writePageBlockOrder,
} from "@/server/content/page-blocks"
import {
  publicPagesWorkspaceId,
  visitorWorkspaceId,
} from "@/server/workspaces/for-request"
import {
  readListedPages,
  readPageVisibility,
} from "@/server/content/pages"
import { findSessionContext } from "@/server/auth/security"

import { createErrorMessage } from "../error-message"

/**
 * Reading and writing the blocks one public page is built from.
 *
 * **One block per call.** The whole point of the table behind these is that an
 * edit to one block writes one row, so two admins on two pages — or on two
 * blocks of one page — cannot overwrite each other the way a whole-settings
 * save did.
 */

const pathSchema = z.string().min(1).max(MAX_PAGE_PATH_LENGTH)

export const getPageBlocksErrorMessage = createErrorMessage(
  { FORBIDDEN: "Only an admin can open the page editor." },
  "That page's blocks could not be loaded. Please try again."
)

/**
 * Saving says what went wrong in its own words, because the reasons are
 * written for the reader — a picture that is not in your media library, a page
 * that is not built from blocks — and folding them into a generic message
 * would replace every one of them with "that could not be saved".
 */
export function getPageBlockSaveErrorMessage(error: unknown) {
  const message =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : ""
  if (message.includes("FORBIDDEN")) {
    return "Only an admin can change a page's blocks."
  }
  return message.trim() || "That block could not be saved. Please try again."
}

const loadPageBlocksFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ path: pathSchema }))
  .handler(async ({ data, context }): Promise<FrontPageRow[]> => {
    return readPageBlocks(
      await publicPagesWorkspaceId(context.user.id),
      data.path
    )
  })

/** Every block on this page of the admin's own site, hidden ones included. */
export function loadPageBlocks(path: string) {
  return loadPageBlocksFn({ data: { path } })
}

const savePageBlockFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ path: pathSchema, block: frontPageRowSchema }))
  .handler(async ({ data, context }): Promise<FrontPageRow[]> => {
    const workspaceId = await publicPagesWorkspaceId(context.user.id)
    await writePageBlock(context.user.id, workspaceId, {
      path: data.path,
      block: data.block,
    })
    // The whole page comes back rather than the one block, so the editor's
    // list is the database's answer and not its own guess about what changed.
    return readPageBlocks(workspaceId, data.path)
  })

export function savePageBlock(input: { path: string; block: FrontPageRow }) {
  return savePageBlockFn({ data: input })
}

const savePageBlockOrderFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      path: pathSchema,
      ids: z
        .array(z.string().min(1).max(MAX_FRONT_PAGE_ROW_ID_LENGTH))
        .max(MAX_FRONT_PAGE_ROWS),
    })
  )
  .handler(async ({ data, context }): Promise<FrontPageRow[]> => {
    const workspaceId = await publicPagesWorkspaceId(context.user.id)
    await writePageBlockOrder(workspaceId, data.path, data.ids)
    return readPageBlocks(workspaceId, data.path)
  })

export function savePageBlockOrder(input: { path: string; ids: string[] }) {
  return savePageBlockOrderFn({ data: input })
}

const removePageBlockFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      path: pathSchema,
      id: z.string().min(1).max(MAX_FRONT_PAGE_ROW_ID_LENGTH),
    })
  )
  .handler(async ({ data, context }): Promise<FrontPageRow[]> => {
    const workspaceId = await publicPagesWorkspaceId(context.user.id)
    await deletePageBlock(workspaceId, data.id)
    return readPageBlocks(workspaceId, data.path)
  })

export function removePageBlock(input: { path: string; id: string }) {
  return removePageBlockFn({ data: input })
}

/**
 * The blocks a visitor may see on one page of the site they opened.
 *
 * No guard, the same as the rest of a public page's own reads: this is what a
 * signed-out visitor is shown, so requiring a session would make the page it
 * draws unreachable.
 *
 * **It still answers the two questions the page itself answers.** A block an
 * admin has hidden never leaves the server, and nor does a block of a page that
 * is switched off or members-only — otherwise a members-only page's words could
 * be read straight out of this call by somebody who cannot open the page.
 */
const loadPublicPageBlocksFn = createServerFn({ method: "GET" })
  .inputValidator(z.object({ path: pathSchema }))
  .handler(async ({ data }): Promise<FrontPageRow[]> => {
    const workspaceId = await visitorWorkspaceId()
    if (!workspaceId) return []

    const visibility = await readPageVisibility(workspaceId, data.path)
    if (visibility === "off") return []
    if (visibility === "members" && !(await findSessionContext())) return []

    return readVisiblePageBlocks(workspaceId, data.path)
  })

export function loadPublicPageBlocks(path: string) {
  return loadPublicPageBlocksFn({ data: { path } })
}

/**
 * The cards each Pages list block on one page shows, by block id.
 *
 * No guard, for the same reason as the blocks above, and the same two checks
 * first: nothing comes back for a page this visitor may not open. The blocks
 * are read again here rather than taken from the browser, so a caller cannot
 * name pages of its own and have their names and descriptions handed over;
 * and each page listed is checked against its own Visibility as well.
 *
 * Asked for only by a page that has a Pages list block on it, so every other
 * page pays nothing for it.
 */
const loadPublicListedPagesFn = createServerFn({ method: "GET" })
  .inputValidator(z.object({ path: pathSchema }))
  .handler(
    async ({ data }): Promise<Record<string, FrontPageListedPage[]>> => {
      const workspaceId = await visitorWorkspaceId()
      if (!workspaceId) return {}

      const [visibility, session] = await Promise.all([
        readPageVisibility(workspaceId, data.path),
        findSessionContext(),
      ])
      if (visibility === "off") return {}
      if (visibility === "members" && !session) return {}

      return readListedPages(
        workspaceId,
        await readVisiblePageBlocks(workspaceId, data.path),
        Boolean(session)
      )
    }
  )

export function loadPublicListedPages(path: string) {
  return loadPublicListedPagesFn({ data: { path } })
}
