import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  DIRECTORY_CATEGORY_SOURCES,
  MAX_DIRECTORY_CATEGORY_CARDS,
} from "@/lib/directory/category-cards"
import {
  DIRECTORY_FRONT_PAGE_COUNT_MAX,
  DIRECTORY_FRONT_PAGE_COUNT_MIN,
  DIRECTORY_FRONT_PAGE_HEADING_MAX,
  DIRECTORY_FRONT_PAGE_INTRO_MAX,
  DIRECTORY_FRONT_PAGE_KINDS,
  DIRECTORY_FRONT_PAGE_LAYOUTS,
  DIRECTORY_FRONT_PAGE_SORTS,
  MAX_DIRECTORY_FRONT_PAGE_SECTIONS,
  type DirectoryFrontPageSection,
} from "@/lib/directory/front-page"
import { adminGet, adminPost } from "@/server/guards"
import {
  createFrontPageSection,
  deleteFrontPageSection,
  listFrontPageSections,
  reorderFrontPageSections,
  updateFrontPageSection,
} from "@/server/directory/front-page-sections"
import { workspaceIdForRequest } from "@/server/workspaces/for-request"

import { describeAuthError } from "../error-message"

/**
 * The doors for the screen where a site arranges its home page.
 *
 * All admin-only. A visitor reads the *result* through the site's home page,
 * which is a public page of its own, never these.
 *
 * Every one of them resolves the site from the caller's session rather than
 * taking it from the request, so an admin of one site cannot rearrange
 * another's home page by sending its row id.
 */
export function getFrontPageSectionErrorMessage(error: unknown) {
  const message =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : ""
  return (
    describeAuthError(message) ??
    (message || "That could not be done. Please try again.")
  )
}

export type { DirectoryFrontPageSection }

const idInput = z.string().min(1).max(36)

/**
 * Everything a row holds, written once. Creating sends exactly this; editing
 * sends it with the row's id alongside, so the two can never drift into
 * accepting different things.
 */
const sectionInput = z.object({
  heading: z.string().min(1).max(DIRECTORY_FRONT_PAGE_HEADING_MAX),
  intro: z.string().max(DIRECTORY_FRONT_PAGE_INTRO_MAX),
  kind: z.enum(DIRECTORY_FRONT_PAGE_KINDS),
  categorySource: z.enum(DIRECTORY_CATEGORY_SOURCES),
  pickedCategoryIds: z.array(idInput).max(MAX_DIRECTORY_CATEGORY_CARDS),
  categoryId: idInput.nullable(),
  sort: z.enum(DIRECTORY_FRONT_PAGE_SORTS),
  listingCount: z
    .number()
    .int()
    .min(DIRECTORY_FRONT_PAGE_COUNT_MIN)
    .max(DIRECTORY_FRONT_PAGE_COUNT_MAX),
  layout: z.enum(DIRECTORY_FRONT_PAGE_LAYOUTS),
})

export type FrontPageSectionInput = z.infer<typeof sectionInput>

const loadFrontPageSectionsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<DirectoryFrontPageSection[]> => {
    return listFrontPageSections(await workspaceIdForRequest(context.user.id))
  })

/** This site's home-page rows, in the order they are drawn. */
export function loadFrontPageSections() {
  return loadFrontPageSectionsFn()
}

const createFrontPageSectionFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(sectionInput)
  .handler(async ({ data, context }): Promise<DirectoryFrontPageSection> => {
    return createFrontPageSection(
      await workspaceIdForRequest(context.user.id),
      data
    )
  })

export function saveNewFrontPageSection(input: FrontPageSectionInput) {
  return createFrontPageSectionFn({ data: input })
}

const updateFrontPageSectionFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(sectionInput.extend({ id: idInput }))
  .handler(async ({ data, context }): Promise<DirectoryFrontPageSection> => {
    const { id, ...rest } = data
    return updateFrontPageSection(
      await workspaceIdForRequest(context.user.id),
      id,
      rest
    )
  })

export function saveFrontPageSection(input: FrontPageSectionInput & { id: string }) {
  return updateFrontPageSectionFn({ data: input })
}

const reorderFrontPageSectionsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      ids: z.array(idInput).min(1).max(MAX_DIRECTORY_FRONT_PAGE_SECTIONS),
    })
  )
  .handler(async ({ data, context }): Promise<void> => {
    await reorderFrontPageSections(
      await workspaceIdForRequest(context.user.id),
      data.ids
    )
  })

export function saveFrontPageSectionOrder(ids: string[]) {
  return reorderFrontPageSectionsFn({ data: { ids } })
}

const deleteFrontPageSectionFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ id: idInput }))
  .handler(async ({ data, context }): Promise<{ heading: string }> => {
    return deleteFrontPageSection(
      await workspaceIdForRequest(context.user.id),
      data.id
    )
  })

export function removeFrontPageSection(id: string) {
  return deleteFrontPageSectionFn({ data: { id } })
}
