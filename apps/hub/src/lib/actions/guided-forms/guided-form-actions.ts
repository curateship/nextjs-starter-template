'use server'

import { and, desc, eq, inArray, sql } from 'drizzle-orm'
import { headers } from 'next/headers'
import { db } from '@/lib/db'
import { guidedForms, guidedFormSubmissions, guidedFormVersions, newsletterContacts, sites } from '@/lib/db/schema'
import { requireOwnedContentRow, requireOwnedSite, validateContentSlugUpdate } from '@/lib/actions/content/content-action-helpers'
import { getAuthenticatedUser } from '@/lib/db/helpers'
import { verifyGuidedFormContactToken } from '@/lib/utils/guided-form-contact-token'
import { getClientIp, isPersistentRateLimited } from '@/lib/utils/rate-limit'
import { SLUG_FORMAT_REGEX, UUID_REGEX, normalizePagination } from '@/lib/utils/validation'

export type GuidedFieldType = 'short_text' | 'long_text' | 'email' | 'phone' | 'single_choice' | 'multi_choice' | 'checkbox' | 'consent' | 'hidden'

export interface GuidedFormField {
  id: string
  type: GuidedFieldType
  label: string
  required?: boolean
  placeholder?: string
  options?: string[]
  prefillKey?: string
}

export interface GuidedFormRule {
  fieldId: string
  equals: string
}

export interface GuidedFormStep {
  id: string
  title: string
  description?: string
  fields: GuidedFormField[]
  rules?: GuidedFormRule[]
}

export interface GuidedFormOutcome {
  id: string
  title: string
  description?: string
  ctaLabel?: string
  ctaUrl?: string
  rules?: GuidedFormRule[]
}

export interface GuidedForm {
  id: string
  site_id: string
  name: string
  slug: string
  headline: string
  subhead: string
  status: 'draft' | 'published' | 'archived'
  contact_sync_enabled: boolean
  admin_notification_enabled: boolean
  admin_notification_email: string | null
  draft_steps: GuidedFormStep[]
  draft_outcomes: GuidedFormOutcome[]
  submission_count: number
  created_at: string
  updated_at: string
}

export interface PublicGuidedForm {
  id: string
  site_id: string
  slug: string
  name: string
  headline: string
  subhead: string
  contact_sync_enabled: boolean
  version: {
    id: string
    version_number: number
    steps: GuidedFormStep[]
    outcomes: GuidedFormOutcome[]
  }
}

export interface GuidedFormSubmission {
  id: string
  form_id: string
  contact_email: string | null
  matched_outcome_id: string | null
  answers: Record<string, any>
  metadata: Record<string, any>
  created_at: string
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_STEPS = 20
const MAX_FIELDS = 80
const MAX_OPTIONS = 30
const MAX_ANSWER_SIZE = 20000
const FIELD_TYPES: GuidedFieldType[] = ['short_text', 'long_text', 'email', 'phone', 'single_choice', 'multi_choice', 'checkbox', 'consent', 'hidden']

const DEFAULT_STEPS: GuidedFormStep[] = [
  {
    id: 'source',
    title: 'How did you hear about us?',
    fields: [
      { id: 'source', type: 'single_choice', label: 'Source', required: true, options: ['Search', 'Social media', 'Referral', 'Event', 'Other'] },
    ],
  },
  {
    id: 'goal',
    title: 'What are you looking for?',
    fields: [
      { id: 'goal', type: 'single_choice', label: 'Goal', required: true, options: ['Product updates', 'Pricing help', 'Implementation support', 'Partnerships'] },
    ],
  },
]

const DEFAULT_OUTCOMES: GuidedFormOutcome[] = [
  {
    id: 'pricing',
    title: 'We will send the right next step',
    description: 'Thanks for sharing what you need. We will use this to tailor what we send you.',
    ctaLabel: 'Continue',
    ctaUrl: '/',
    rules: [{ fieldId: 'goal', equals: 'Pricing help' }],
  },
  {
    id: 'default',
    title: 'Thanks for sharing',
    description: 'Your response has been saved.',
    ctaLabel: 'Back to site',
    ctaUrl: '/',
  },
]

function rowToForm(row: any, submissionCount = 0): GuidedForm {
  return {
    id: row.id,
    site_id: row.siteId,
    name: row.name,
    slug: row.slug,
    headline: row.headline,
    subhead: row.subhead,
    status: row.status,
    contact_sync_enabled: row.contactSyncEnabled,
    admin_notification_enabled: row.adminNotificationEnabled,
    admin_notification_email: row.adminNotificationEmail,
    draft_steps: normalizeSteps(row.draftSteps),
    draft_outcomes: normalizeOutcomes(row.draftOutcomes),
    submission_count: submissionCount,
    created_at: row.createdAt?.toISOString() ?? '',
    updated_at: row.updatedAt?.toISOString() ?? '',
  }
}

function slugify(value: string) {
  const slug = value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100)
  return slug || 'form'
}

function clampText(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : ''
}

function normalizeRules(value: unknown): GuidedFormRule[] {
  if (!Array.isArray(value)) return []
  return value
    .map((rule) => ({
      fieldId: clampText((rule as any)?.fieldId, 100),
      equals: clampText((rule as any)?.equals, 200),
    }))
    .filter((rule) => rule.fieldId && rule.equals)
}

function normalizeSteps(value: unknown): GuidedFormStep[] {
  const rawSteps = Array.isArray(value) ? value.slice(0, MAX_STEPS) : DEFAULT_STEPS
  let fieldCount = 0

  return rawSteps
    .map((step, stepIndex) => {
      const fields = Array.isArray((step as any)?.fields) ? (step as any).fields : []
      const normalizedFields = fields
        .slice(0, MAX_FIELDS - fieldCount)
        .map((field: any, fieldIndex: number) => {
          const type = FIELD_TYPES.includes(field?.type) ? field.type : 'short_text'
          const options = Array.isArray(field?.options)
            ? field.options.map((option: unknown) => clampText(option, 120)).filter(Boolean).slice(0, MAX_OPTIONS)
            : []
          return {
            id: clampText(field?.id, 100) || `field_${stepIndex + 1}_${fieldIndex + 1}`,
            type,
            label: clampText(field?.label, 160) || 'Question',
            required: field?.required === true,
            placeholder: clampText(field?.placeholder, 160),
            prefillKey: clampText(field?.prefillKey, 100),
            ...(options.length ? { options } : {}),
          }
        })
        .filter((field: GuidedFormField) => field.id && field.label)
      fieldCount += normalizedFields.length

      return {
        id: clampText((step as any)?.id, 100) || `step_${stepIndex + 1}`,
        title: clampText((step as any)?.title, 200) || `Step ${stepIndex + 1}`,
        description: clampText((step as any)?.description, 500),
        fields: normalizedFields,
        rules: normalizeRules((step as any)?.rules),
      }
    })
    .filter((step) => step.fields.length > 0)
}

function normalizeOutcomes(value: unknown): GuidedFormOutcome[] {
  const rawOutcomes = Array.isArray(value) ? value.slice(0, 20) : DEFAULT_OUTCOMES
  return rawOutcomes.map((outcome, index) => ({
    id: clampText((outcome as any)?.id, 100) || `outcome_${index + 1}`,
    title: clampText((outcome as any)?.title, 200) || 'Thank you',
    description: clampText((outcome as any)?.description, 800),
    ctaLabel: clampText((outcome as any)?.ctaLabel, 80),
    ctaUrl: clampText((outcome as any)?.ctaUrl, 500),
    rules: normalizeRules((outcome as any)?.rules),
  }))
}

function rulesMatch(rules: GuidedFormRule[] | undefined, answers: Record<string, any>) {
  if (!rules?.length) return true
  return rules.every((rule) => {
    const answer = answers[rule.fieldId]
    return Array.isArray(answer) ? answer.includes(rule.equals) : String(answer ?? '') === rule.equals
  })
}

function validateAnswers(steps: GuidedFormStep[], answers: Record<string, any>) {
  const cleaned: Record<string, any> = {}
  const visibleFields = steps
    .filter((step) => rulesMatch(step.rules, answers))
    .flatMap((step) => step.fields)

  for (const field of visibleFields) {
    const value = answers[field.id]

    if (field.type === 'multi_choice') {
      const options = field.options || []
      const selected = Array.isArray(value)
        ? value.map((item) => clampText(item, 120)).filter((item) => options.includes(item)).slice(0, MAX_OPTIONS)
        : []
      if (field.required && !selected.length) return { ok: false as const, error: `${field.label} is required` }
      cleaned[field.id] = selected
      continue
    }

    if (field.type === 'checkbox' || field.type === 'consent') {
      const checked = value === true
      if (field.required && !checked) return { ok: false as const, error: `${field.label} is required` }
      cleaned[field.id] = checked
      continue
    }

    const text = clampText(value, field.type === 'long_text' ? 2000 : 500)
    if (field.required && !text) return { ok: false as const, error: `${field.label} is required` }
    if (field.type === 'email' && text && !EMAIL_REGEX.test(text)) return { ok: false as const, error: 'Enter a valid email address' }
    if (field.type === 'single_choice' && text && !(field.options || []).includes(text)) return { ok: false as const, error: `Choose a valid ${field.label}` }
    cleaned[field.id] = text
  }

  return { ok: true as const, answers: cleaned }
}

function findEmail(steps: GuidedFormStep[], answers: Record<string, any>) {
  const emailField = steps.flatMap((step) => step.fields).find((field) => field.type === 'email')
  const value = emailField ? answers[emailField.id] : null
  return typeof value === 'string' && EMAIL_REGEX.test(value) ? value.toLowerCase() : null
}

function selectOutcome(outcomes: GuidedFormOutcome[], answers: Record<string, any>) {
  return outcomes.find((outcome) => outcome.rules?.length && rulesMatch(outcome.rules, answers))
    || outcomes.find((outcome) => !outcome.rules?.length)
    || outcomes[0]
    || null
}

async function syncNewsletterContact(siteId: string, email: string, form: { id: string; slug: string; name: string }) {
  const metadata = {
    source: 'guided_form',
    source_form_id: form.id,
    source_form_slug: form.slug,
    source_form_name: form.name,
  }

  await db
    .update(newsletterContacts)
    .set({
      metadata: sql`coalesce(${newsletterContacts.metadata}, '{}'::jsonb) || ${JSON.stringify(metadata)}::jsonb`,
      updatedAt: new Date(),
    })
    .where(and(
      eq(newsletterContacts.siteId, siteId),
      eq(newsletterContacts.email, email),
    ))
}

export async function getGuidedFormsBySite(siteId: string, options?: { page?: number; pageSize?: number }) {
  try {
    const access = await requireOwnedSite(siteId)
    if (!access.ok) return { data: null, total: 0, error: access.error }

    const { pageSize, offset } = normalizePagination(options)
    const [rows, countRows, submissionRows] = await Promise.all([
      db.select().from(guidedForms).where(eq(guidedForms.siteId, siteId)).orderBy(desc(guidedForms.updatedAt)).limit(pageSize).offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(guidedForms).where(eq(guidedForms.siteId, siteId)),
      db.select({ formId: guidedFormSubmissions.formId, count: sql<number>`count(*)::int` }).from(guidedFormSubmissions).where(eq(guidedFormSubmissions.siteId, siteId)).groupBy(guidedFormSubmissions.formId),
    ])

    const counts = new Map(submissionRows.map((row) => [row.formId, row.count]))
    return { data: rows.map((row) => rowToForm(row, counts.get(row.id) ?? 0)), total: countRows[0]?.count ?? 0, error: null }
  } catch (error) {
    console.error('getGuidedFormsBySite error:', error)
    return { data: null, total: 0, error: 'Failed to load forms' }
  }
}

export async function getGuidedFormById(formId: string) {
  try {
    const access = await requireOwnedContentRow<typeof guidedForms.$inferSelect>(guidedForms as any, formId, 'Form')
    if (!access.ok) return { data: null, error: access.error }
    return { data: rowToForm(access.row), error: null }
  } catch (error) {
    console.error('getGuidedFormById error:', error)
    return { data: null, error: 'Failed to load form' }
  }
}

export async function createGuidedForm(input: { siteId: string; name: string }) {
  try {
    const access = await requireOwnedSite(input.siteId)
    if (!access.ok) return { data: null, error: access.error }

    const name = clampText(input.name, 255)
    if (!name) return { data: null, error: 'Name is required' }

    let slug = slugify(name)
    let counter = 1
    while (true) {
      const [existing] = await db.select({ id: guidedForms.id }).from(guidedForms).where(and(eq(guidedForms.siteId, input.siteId), eq(guidedForms.slug, slug))).limit(1)
      if (!existing) break
      slug = `${slugify(name)}-${counter++}`.slice(0, 100)
    }

    const [row] = await db
      .insert(guidedForms)
      .values({
        siteId: input.siteId,
        name,
        slug,
        headline: name,
        draftSteps: DEFAULT_STEPS,
        draftOutcomes: DEFAULT_OUTCOMES,
      })
      .returning()

    return { data: rowToForm(row), error: null }
  } catch (error) {
    console.error('createGuidedForm error:', error)
    return { data: null, error: 'Failed to create form' }
  }
}

export async function updateGuidedForm(formId: string, updates: Partial<Pick<GuidedForm, 'name' | 'slug' | 'headline' | 'subhead' | 'contact_sync_enabled' | 'admin_notification_enabled' | 'admin_notification_email' | 'draft_steps' | 'draft_outcomes'>>) {
  try {
    const access = await requireOwnedContentRow<typeof guidedForms.$inferSelect>(guidedForms as any, formId, 'Form')
    if (!access.ok) return { data: null, error: access.error }

    const values: Record<string, any> = { updatedAt: new Date() }
    if (updates.name !== undefined) values.name = clampText(updates.name, 255)
    if (updates.headline !== undefined) values.headline = clampText(updates.headline, 255)
    if (updates.subhead !== undefined) values.subhead = clampText(updates.subhead, 1000)
    if (updates.contact_sync_enabled !== undefined) values.contactSyncEnabled = updates.contact_sync_enabled === true
    if (updates.admin_notification_enabled !== undefined) values.adminNotificationEnabled = updates.admin_notification_enabled === true
    if (updates.admin_notification_email !== undefined) values.adminNotificationEmail = clampText(updates.admin_notification_email, 255) || null
    if (updates.draft_steps !== undefined) values.draftSteps = normalizeSteps(updates.draft_steps)
    if (updates.draft_outcomes !== undefined) values.draftOutcomes = normalizeOutcomes(updates.draft_outcomes)

    if (updates.slug !== undefined) {
      const slug = clampText(updates.slug, 100)
      if (!SLUG_FORMAT_REGEX.test(slug)) return { data: null, error: 'Invalid slug format' }
      const slugResult = await validateContentSlugUpdate(guidedForms as any, access.row.siteId, formId, slug, 'Form')
      if (!slugResult.ok) return { data: null, error: slugResult.error }
      values.slug = slugResult.slug
    }

    if (values.name === '') return { data: null, error: 'Name is required' }
    if (values.headline === '') return { data: null, error: 'Headline is required' }
    if (values.draftSteps && !values.draftSteps.length) return { data: null, error: 'Add at least one step' }

    const [row] = await db.update(guidedForms).set(values).where(eq(guidedForms.id, formId)).returning()
    return { data: rowToForm(row), error: null }
  } catch (error) {
    console.error('updateGuidedForm error:', error)
    return { data: null, error: 'Failed to update form' }
  }
}

export async function publishGuidedForm(formId: string) {
  try {
    const access = await requireOwnedContentRow<typeof guidedForms.$inferSelect>(guidedForms as any, formId, 'Form')
    if (!access.ok) return { data: null, error: access.error }
    const form = access.row

    const steps = normalizeSteps(form.draftSteps)
    if (!steps.length) return { data: null, error: 'Add at least one step before publishing' }

    const [latest] = await db.select({ versionNumber: guidedFormVersions.versionNumber }).from(guidedFormVersions).where(eq(guidedFormVersions.formId, formId)).orderBy(desc(guidedFormVersions.versionNumber)).limit(1)
    const [version] = await db.insert(guidedFormVersions).values({
      formId,
      siteId: form.siteId,
      versionNumber: (latest?.versionNumber ?? 0) + 1,
      headline: form.headline,
      subhead: form.subhead,
      steps,
      outcomes: normalizeOutcomes(form.draftOutcomes),
    }).returning()

    await db.update(guidedForms).set({ status: 'published', updatedAt: new Date() }).where(eq(guidedForms.id, formId))
    return { data: { version_id: version.id, version_number: version.versionNumber }, error: null }
  } catch (error) {
    console.error('publishGuidedForm error:', error)
    return { data: null, error: 'Failed to publish form' }
  }
}

export async function archiveGuidedForms(ids: string[]) {
  try {
    if (!ids.length) return { success: false, error: 'No forms selected' }
    if (ids.some((id) => !UUID_REGEX.test(id))) return { success: false, error: 'Invalid form ID' }

    const user = await getAuthenticatedUser()
    if (!user) return { success: false, error: 'Not authenticated' }

    const rows = await db.select({ id: guidedForms.id, siteId: guidedForms.siteId }).from(guidedForms).where(inArray(guidedForms.id, ids))
    if (!rows.length) return { success: false, error: 'Forms not found' }

    const siteIds = [...new Set(rows.map((row) => row.siteId))]
    const ownedSites = await db.select({ id: sites.id }).from(sites).where(and(inArray(sites.id, siteIds), eq(sites.userId, user.id)))
    if (ownedSites.length !== siteIds.length) return { success: false, error: 'Access denied' }

    await db.update(guidedForms).set({ status: 'archived', updatedAt: new Date() }).where(inArray(guidedForms.id, ids))
    return { success: true, error: null }
  } catch (error) {
    console.error('archiveGuidedForms error:', error)
    return { success: false, error: 'Failed to archive forms' }
  }
}

export async function getGuidedFormSubmissions(formId: string, options?: { page?: number; pageSize?: number }) {
  try {
    const access = await requireOwnedContentRow<typeof guidedForms.$inferSelect>(guidedForms as any, formId, 'Form')
    if (!access.ok) return { data: null, total: 0, error: access.error }

    const { pageSize, offset } = normalizePagination(options)
    const [rows, countRows] = await Promise.all([
      db.select().from(guidedFormSubmissions).where(eq(guidedFormSubmissions.formId, formId)).orderBy(desc(guidedFormSubmissions.createdAt)).limit(pageSize).offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(guidedFormSubmissions).where(eq(guidedFormSubmissions.formId, formId)),
    ])

    return {
      data: rows.map((row): GuidedFormSubmission => ({
        id: row.id,
        form_id: row.formId,
        contact_email: row.contactEmail,
        matched_outcome_id: row.matchedOutcomeId,
        answers: row.answers as Record<string, any>,
        metadata: row.metadata as Record<string, any>,
        created_at: row.createdAt?.toISOString() ?? '',
      })),
      total: countRows[0]?.count ?? 0,
      error: null,
    }
  } catch (error) {
    console.error('getGuidedFormSubmissions error:', error)
    return { data: null, total: 0, error: 'Failed to load submissions' }
  }
}

export async function getPublicGuidedFormBySlug(siteId: string, slug: string) {
  try {
    if (!UUID_REGEX.test(siteId) || !SLUG_FORMAT_REGEX.test(slug)) return { data: null, error: 'Form not found' }

    const [form] = await db.select().from(guidedForms).where(and(eq(guidedForms.siteId, siteId), eq(guidedForms.slug, slug), eq(guidedForms.status, 'published'))).limit(1)
    if (!form) return { data: null, error: 'Form not found' }

    const [version] = await db.select().from(guidedFormVersions).where(eq(guidedFormVersions.formId, form.id)).orderBy(desc(guidedFormVersions.versionNumber)).limit(1)
    if (!version) return { data: null, error: 'Form not found' }

    const data: PublicGuidedForm = {
      id: form.id,
      site_id: form.siteId,
      slug: form.slug,
      name: form.name,
      headline: version.headline,
      subhead: version.subhead,
      contact_sync_enabled: form.contactSyncEnabled,
      version: {
        id: version.id,
        version_number: version.versionNumber,
        steps: normalizeSteps(version.steps),
        outcomes: normalizeOutcomes(version.outcomes),
      },
    }
    return { data, error: null }
  } catch (error) {
    console.error('getPublicGuidedFormBySlug error:', error)
    return { data: null, error: 'Failed to load form' }
  }
}

export async function submitGuidedFormAction(input: {
  formId: string
  versionId: string
  answers: Record<string, any>
  contactEmail?: string
  contactProof?: string
  metadata?: Record<string, any>
  startedAt?: number
  honeypot?: string
}) {
  try {
    if (!UUID_REGEX.test(input.formId) || !UUID_REGEX.test(input.versionId)) {
      return { success: false, error: 'Invalid form submission' }
    }
    if (input.honeypot) return { success: false, error: 'Submission rejected' }
    if (typeof input.startedAt !== 'number' || Date.now() - input.startedAt < 800) {
      return { success: false, error: 'Please try again' }
    }
    if (JSON.stringify(input.answers || {}).length > MAX_ANSWER_SIZE) {
      return { success: false, error: 'Submission is too large' }
    }

    const [row] = await db
      .select({ form: guidedForms, version: guidedFormVersions })
      .from(guidedForms)
      .innerJoin(guidedFormVersions, eq(guidedFormVersions.formId, guidedForms.id))
      .where(and(eq(guidedForms.id, input.formId), eq(guidedForms.status, 'published'), eq(guidedFormVersions.id, input.versionId)))
      .limit(1)

    if (!row) return { success: false, error: 'Form is not available' }

    const requestHeaders = await headers()
    const clientIp = getClientIp(requestHeaders) || 'unknown'
    const limited = await isPersistentRateLimited(`guided-form:${row.form.siteId}:${row.form.id}:${clientIp}`, 10, 60 * 60 * 1000)
    if (limited) return { success: false, error: 'Too many submissions. Please try again later.' }

    const steps = normalizeSteps(row.version.steps)
    const outcomes = normalizeOutcomes(row.version.outcomes)
    const validation = validateAnswers(steps, input.answers || {})
    if (!validation.ok) return { success: false, error: validation.error }

    const outcome = selectOutcome(outcomes, validation.answers)
    const submittedContactEmail = clampText(input.contactEmail, 255).toLowerCase()
    if (submittedContactEmail && !EMAIL_REGEX.test(submittedContactEmail)) {
      return { success: false, error: 'Invalid contact email' }
    }
    const verifiedContact = submittedContactEmail
      ? verifyGuidedFormContactToken({
        siteId: row.form.siteId,
        email: submittedContactEmail,
        token: input.contactProof,
      })
      : { ok: false as const }
    const email = verifiedContact.ok ? verifiedContact.email : findEmail(steps, validation.answers) || null
    const metadata = {
      page_url: clampText(input.metadata?.page_url, 500),
      referrer: clampText(input.metadata?.referrer, 500),
      utm_source: clampText(input.metadata?.utm_source, 120),
      utm_medium: clampText(input.metadata?.utm_medium, 120),
      utm_campaign: clampText(input.metadata?.utm_campaign, 120),
      user_agent: clampText(requestHeaders.get('user-agent'), 500),
    }

    const [submission] = await db.insert(guidedFormSubmissions).values({
      siteId: row.form.siteId,
      formId: row.form.id,
      versionId: row.version.id,
      contactEmail: email,
      matchedOutcomeId: outcome?.id ?? null,
      answers: validation.answers,
      metadata,
    }).returning()

    if (row.form.contactSyncEnabled && verifiedContact.ok) {
      await syncNewsletterContact(row.form.siteId, verifiedContact.email, { id: row.form.id, slug: row.form.slug, name: row.form.name })
    }

    return {
      success: true,
      error: null,
      submission_id: submission.id,
      outcome: outcome ? {
        id: outcome.id,
        title: outcome.title,
        description: outcome.description,
        ctaLabel: outcome.ctaLabel,
        ctaUrl: outcome.ctaUrl,
      } : null,
    }
  } catch (error) {
    console.error('submitGuidedFormAction error:', error)
    return { success: false, error: 'Failed to submit form' }
  }
}
