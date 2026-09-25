import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  CUSTOM_SECTION_LAYOUTS,
  CUSTOM_SECTION_NAME_MAX,
  MAX_CUSTOM_SECTIONS,
  type CustomSection,
} from "@/lib/directory/custom-fields"
import { adminGet, adminPost } from "@/server/guards"
import { workspaceIdForRequest } from "@/server/workspaces/for-request"
import {
  createCustomSection,
  customFieldsRemovalImpact,
  customSectionUsage,
  deleteCustomSection,
  listCustomSections,
  listCustomSectionSummaries,
  reorderCustomSections,
  updateCustomSection,
  type CustomSectionSummary,
} from "@/server/directory/custom-sections"
import { cleanCustomFields } from "@/lib/directory/custom-fields"

import { describeAuthError } from "../error-message"

export type { CustomSection, CustomSectionSummary }

/**
 * The doors for the screen where a site invents its own listing fields. All
 * admin-only: a visitor reads the *answers* through the public listing page,
 * never these.
 *
 * The field definitions arrive as an unchecked tree and are cleaned by
 * `cleanCustomFields` rather than described twice — the rule is "keep only
 * what is allowed", which a cleaner says better than a schema, and having the
 * schema restate it is how the two would drift apart.
 */
export function getCustomSectionErrorMessage(error: unknown) {
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

const loadCustomSectionsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<CustomSection[]> => {
    return listCustomSections(await workspaceIdForRequest(context.user.id))
  })

/** Just the definitions — what the listing form needs to draw its fields. */
export function loadCustomSections() {
  return loadCustomSectionsFn()
}

const loadCustomSectionRowsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<CustomSectionSummary[]> => {
    return listCustomSectionSummaries(
      await workspaceIdForRequest(context.user.id)
    )
  })

/** The definitions plus how many listings use each, for the fields screen. */
export function loadCustomSectionRows() {
  return loadCustomSectionRowsFn()
}

const createCustomSectionFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      name: z.string().min(1).max(CUSTOM_SECTION_NAME_MAX),
      layout: z.enum(CUSTOM_SECTION_LAYOUTS).optional(),
    })
  )
  .handler(async ({ data, context }): Promise<CustomSection> => {
    return createCustomSection(
      await workspaceIdForRequest(context.user.id),
      data
    )
  })

export function saveNewCustomSection(input: {
  name: string
  layout?: (typeof CUSTOM_SECTION_LAYOUTS)[number]
}) {
  return createCustomSectionFn({ data: input })
}

const updateCustomSectionFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      id: z.string().min(1).max(36),
      name: z.string().min(1).max(CUSTOM_SECTION_NAME_MAX).optional(),
      layout: z.enum(CUSTOM_SECTION_LAYOUTS).optional(),
      fields: z.unknown().optional(),
    })
  )
  .handler(async ({ data, context }): Promise<CustomSection> => {
    const { id, ...rest } = data
    return updateCustomSection(
      await workspaceIdForRequest(context.user.id),
      id,
      rest
    )
  })

export function saveCustomSection(input: {
  id: string
  name?: string
  layout?: (typeof CUSTOM_SECTION_LAYOUTS)[number]
  fields?: unknown
}) {
  return updateCustomSectionFn({ data: input })
}

const reorderCustomSectionsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      ids: z
        .array(z.string().min(1).max(36))
        .min(1)
        .max(MAX_CUSTOM_SECTIONS),
    })
  )
  .handler(async ({ data, context }): Promise<void> => {
    await reorderCustomSections(
      await workspaceIdForRequest(context.user.id),
      data.ids
    )
  })

export function saveCustomSectionOrder(ids: string[]) {
  return reorderCustomSectionsFn({ data: { ids } })
}

const customFieldsRemovalImpactFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({ id: z.string().min(1).max(36), fields: z.unknown() })
  )
  .handler(async ({ data, context }) => {
    // A read, but a POST: the field list it asks about is a whole tree, which
    // has no honest place in a query string.
    return customFieldsRemovalImpact(
      await workspaceIdForRequest(context.user.id),
      data.id,
      cleanCustomFields(data.fields)
    )
  })

/** Which fields this save would drop, and how many listings would lose one. */
export function loadCustomFieldsRemovalImpact(id: string, fields: unknown) {
  return customFieldsRemovalImpactFn({ data: { id, fields } })
}

const customSectionDeleteImpactFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ slug: z.string().min(1).max(80) }))
  .handler(async ({ data, context }): Promise<{ listings: number }> => {
    const listings = await customSectionUsage(
      await workspaceIdForRequest(context.user.id),
      data.slug
    )
    return { listings }
  })

/** How many listings would lose their answers if this section went. */
export function loadCustomSectionDeleteImpact(slug: string) {
  return customSectionDeleteImpactFn({ data: { slug } })
}

const deleteCustomSectionFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ id: z.string().min(1).max(36) }))
  .handler(async ({ data, context }): Promise<{ name: string }> => {
    return deleteCustomSection(
      await workspaceIdForRequest(context.user.id),
      data.id
    )
  })

export function removeCustomSection(id: string) {
  return deleteCustomSectionFn({ data: { id } })
}
