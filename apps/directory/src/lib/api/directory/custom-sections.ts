import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  cleanCustomFields,
  CUSTOM_SECTION_KINDS,
  CUSTOM_SECTION_LAYOUTS,
  CUSTOM_SECTION_NAME_MAX,
  MAX_CUSTOM_SECTIONS,
  type CustomSection,
  type CustomSectionKind,
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

import { describeAuthError } from "../error-message"

export type { CustomSection, CustomSectionKind, CustomSectionSummary }

/**
 * The doors for the screens where a site invents its own listing fields and,
 * as a list of their own, its own event fields. All admin-only: a visitor
 * reads the *answers* through the public listing or event page, never these.
 * Every door that lists or makes sections names the kind; the ones given a
 * section's id read the kind off the section itself.
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

const kindInput = z.object({ kind: z.enum(CUSTOM_SECTION_KINDS) })

const loadCustomSectionsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(kindInput)
  .handler(async ({ data, context }): Promise<CustomSection[]> => {
    return listCustomSections(
      await workspaceIdForRequest(context.user.id),
      undefined,
      data.kind
    )
  })

/** Just the definitions: what the listing or event form needs to draw its fields. */
export function loadCustomSections(kind: CustomSectionKind) {
  return loadCustomSectionsFn({ data: { kind } })
}

const loadCustomSectionRowsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(kindInput)
  .handler(async ({ data, context }): Promise<CustomSectionSummary[]> => {
    return listCustomSectionSummaries(
      await workspaceIdForRequest(context.user.id),
      undefined,
      data.kind
    )
  })

/** The definitions plus how many listings or events use each, for the Custom fields row. */
export function loadCustomSectionRows(kind: CustomSectionKind) {
  return loadCustomSectionRowsFn({ data: { kind } })
}

const createCustomSectionFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      name: z.string().min(1).max(CUSTOM_SECTION_NAME_MAX),
      layout: z.enum(CUSTOM_SECTION_LAYOUTS).optional(),
      kind: z.enum(CUSTOM_SECTION_KINDS),
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
  kind: CustomSectionKind
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
    // has no honest place in a query string. Only the keys are compared, so
    // cleaning it as a listing's or an event's makes no difference.
    return customFieldsRemovalImpact(
      await workspaceIdForRequest(context.user.id),
      data.id,
      cleanCustomFields(data.fields)
    )
  })

/** Which fields this save would drop, and how many listings or events would lose one. */
export function loadCustomFieldsRemovalImpact(id: string, fields: unknown) {
  return customFieldsRemovalImpactFn({ data: { id, fields } })
}

const customSectionDeleteImpactFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(
    z.object({
      slug: z.string().min(1).max(80),
      kind: z.enum(CUSTOM_SECTION_KINDS),
    })
  )
  .handler(async ({ data, context }): Promise<{ used: number }> => {
    const used = await customSectionUsage(
      await workspaceIdForRequest(context.user.id),
      data.slug,
      undefined,
      data.kind
    )
    return { used }
  })

/** How many listings or events would lose their answers if this section went. */
export function loadCustomSectionDeleteImpact(slug: string, kind: CustomSectionKind) {
  return customSectionDeleteImpactFn({ data: { slug, kind } })
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
