import { createServerFn } from "@tanstack/react-start"
import { getNewslettersBySiteImpl, getNewsletterByIdImpl, getNewsletterStatusEventsImpl, createNewsletterImpl, updateNewsletterImpl, deleteNewslettersImpl, sendNewsletterImpl, sendTestNewsletterImpl, pauseNewsletterImpl, resumeNewsletterImpl } from "./newsletter-actions.server"
import type { NewsletterStatusEventFilter } from "./newsletter-actions.server"

// Types stay importable from this path. `export type` is erased at runtime,
// so no server code reaches the client through it.
export type * from "./newsletter-actions.server"

export const getNewslettersBySite = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string; options?: { page?: number; pageSize?: number } }) => data)
  .handler(async ({ data }) => getNewslettersBySiteImpl(data.siteId, data.options))

export const getNewsletterById = createServerFn({ method: "POST" })
  .inputValidator((data: { newsletterId: string }) => data)
  .handler(async ({ data }) => getNewsletterByIdImpl(data.newsletterId))

export const getNewsletterStatusEvents = createServerFn({ method: "POST" })
  .inputValidator((data: { newsletterId: string; options?: { page?: number; pageSize?: number; eventFilter?: NewsletterStatusEventFilter } }) => data)
  .handler(async ({ data }) => getNewsletterStatusEventsImpl(data.newsletterId, data.options))

export const createNewsletter = createServerFn({ method: "POST" })
  .inputValidator((data: { input: {
  siteId: string
  subject: string
  audience_filter?: Record<string, any>
  content_blocks?: Record<string, any>
  content?: string
  metadata?: Record<string, any>
  status?: 'draft' | 'scheduled'
} }) => data)
  .handler(async ({ data }) => createNewsletterImpl(data.input))

export const updateNewsletter = createServerFn({ method: "POST" })
  .inputValidator((data: { newsletterId: string; updates: { subject?: string; content?: string; content_blocks?: Record<string, any>; status?: string; audience_filter?: Record<string, any>; metadata?: Record<string, any> } }) => data)
  .handler(async ({ data }) => updateNewsletterImpl(data.newsletterId, data.updates))

export const deleteNewsletters = createServerFn({ method: "POST" })
  .inputValidator((data: { ids: string[] }) => data)
  .handler(async ({ data }) => deleteNewslettersImpl(data.ids))

export const sendNewsletter = createServerFn({ method: "POST" })
  .inputValidator((data: { newsletterId: string }) => data)
  .handler(async ({ data }) => sendNewsletterImpl(data.newsletterId))

export const sendTestNewsletter = createServerFn({ method: "POST" })
  .inputValidator((data: { newsletterId: string; testEmail: string }) => data)
  .handler(async ({ data }) => sendTestNewsletterImpl(data.newsletterId, data.testEmail))

export const pauseNewsletter = createServerFn({ method: "POST" })
  .inputValidator((data: { newsletterId: string }) => data)
  .handler(async ({ data }) => pauseNewsletterImpl(data.newsletterId))

export const resumeNewsletter = createServerFn({ method: "POST" })
  .inputValidator((data: { newsletterId: string }) => data)
  .handler(async ({ data }) => resumeNewsletterImpl(data.newsletterId))
