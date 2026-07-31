import { createServerFn } from "@tanstack/react-start"
import {
  archiveGuidedFormsImpl,
  createGuidedFormImpl,
  getGuidedFormByIdImpl,
  getGuidedFormSubmissionsImpl,
  getGuidedFormsBySiteImpl,
  getPublicGuidedFormBySlugImpl,
  publishGuidedFormImpl,
  submitGuidedFormActionImpl,
  updateGuidedFormImpl,
} from "./guided-form-actions.server"
import type { GuidedForm } from "./guided-form-actions.server"

// Types stay importable from this path. `export type` is erased at runtime,
// so no server code reaches the client through it.
export type * from "./guided-form-actions.server"

type GuidedFormUpdates = Partial<Pick<GuidedForm, 'name' | 'slug' | 'headline' | 'subhead' | 'contact_sync_enabled' | 'admin_notification_enabled' | 'admin_notification_email' | 'draft_steps' | 'draft_outcomes'>>

export const getGuidedFormsBySite = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string; options?: { page?: number; pageSize?: number } }) => data)
  .handler(async ({ data }) => getGuidedFormsBySiteImpl(data.siteId, data.options))

export const getGuidedFormById = createServerFn({ method: "POST" })
  .inputValidator((data: { formId: string }) => data)
  .handler(async ({ data }) => getGuidedFormByIdImpl(data.formId))

export const createGuidedForm = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string; name: string }) => data)
  .handler(async ({ data }) => createGuidedFormImpl(data))

export const updateGuidedForm = createServerFn({ method: "POST" })
  .inputValidator((data: { formId: string; updates: GuidedFormUpdates }) => data)
  .handler(async ({ data }) => updateGuidedFormImpl(data.formId, data.updates))

export const publishGuidedForm = createServerFn({ method: "POST" })
  .inputValidator((data: { formId: string }) => data)
  .handler(async ({ data }) => publishGuidedFormImpl(data.formId))

export const archiveGuidedForms = createServerFn({ method: "POST" })
  .inputValidator((data: { ids: string[] }) => data)
  .handler(async ({ data }) => archiveGuidedFormsImpl(data.ids))

export const getGuidedFormSubmissions = createServerFn({ method: "POST" })
  .inputValidator((data: { formId: string; options?: { page?: number; pageSize?: number } }) => data)
  .handler(async ({ data }) => getGuidedFormSubmissionsImpl(data.formId, data.options))

export const getPublicGuidedFormBySlug = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string; slug: string }) => data)
  .handler(async ({ data }) => getPublicGuidedFormBySlugImpl(data.siteId, data.slug))

export const submitGuidedFormAction = createServerFn({ method: "POST" })
  .inputValidator((data: {
    formId: string
    versionId: string
    answers: Record<string, any>
    contactEmail?: string
    contactProof?: string
    metadata?: Record<string, any>
    startedAt?: number
    honeypot?: string
  }) => data)
  .handler(async ({ data }) => submitGuidedFormActionImpl(data))
