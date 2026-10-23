import { createHash, randomBytes } from 'crypto'
import { and, asc, desc, eq, gte, inArray, sql } from 'drizzle-orm'

import { revalidateTag } from '@/lib/cache'
import { headers } from '@/lib/request-headers'
import { db } from '@/lib/db'
import { getAuthenticatedUser } from '@/lib/db/helpers'
import {
  categories,
  contentCategoryRelationships,
  directories,
  directorySubmissions,
  directoryTemplates,
  sites,
} from '@/lib/db/schema'
import { createHubNotificationForSuperAdmins } from '@/lib/actions/notifications/notification-service'
import { generateUniqueContentSlug, getNextContentDisplayOrder } from '@/lib/actions/content/content-action-helpers'
import { getDefaultDirectoryTemplateIdForSite } from './directory-template-ensure'
import { DIRECTORY_CORE_BLOCK_TYPE } from './directory-core'
import {
  deriveDirectoryMetaDescriptionFromBlocks,
  pruneDirectoryValueBlocksForTemplate,
} from './directory-template-inheritance'
import { resolveDirectoryCoordinateUpdates } from './directory-geocoding'
import { getEmailProvider } from '@/lib/actions/email/provider'
import { getEmailConfig } from '@/lib/actions/integrations/config-helpers'
import { getSiteUrl } from '@/lib/utils/site-url-generator'
import { safeSyncSiteSearchDocument } from '@/lib/actions/site-search/site-search-index'
import { getClientIp, isPersistentRateLimited } from '@/lib/utils/rate-limit'
import { UUID_REGEX } from '@/lib/utils/validation'

const DIRECTORY_RICH_TEXT_BLOCK_TYPE = 'directory-rich-text'

export type DirectorySubmissionStatus = 'pending_email' | 'pending_review' | 'approved' | 'rejected'

export interface DirectorySubmissionListItem {
  id: string
  site_id: string
  status: DirectorySubmissionStatus
  business_name: string
  address: string | null
  description: string | null
  image_url: string | null
  contact_email: string | null
  category_id: string | null
  category_title: string | null
  created_directory_id: string | null
  created_directory_slug: string | null
  reviewed_at: string | null
  review_note: string | null
  created_at: string
  /** Same-name listing already exists on the site — surfaced so the reviewer can spot dupes. */
  possible_duplicate: boolean
}

export interface ListingSubmissionCategory {
  id: string
  title: string
  parent_title: string | null
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const REVIEW_STATUSES: DirectorySubmissionStatus[] = ['pending_review', 'approved', 'rejected']
// A visitor gets a handful of submissions per hour per site; enough for a genuine
// batch of listings, low enough that a script can't flood the queue.
const SUBMISSION_RATE_LIMIT = 5
const SUBMISSION_RATE_WINDOW_MS = 60 * 60 * 1000
// Collapse an accidental double-submit (same person, same business) inside this window.
const DUPLICATE_WINDOW_MS = 24 * 60 * 60 * 1000
// How long a verification link stays valid. Unverified submissions never reach
// the reviewer, and the link stops working after this.
const VERIFICATION_EXPIRES_MS = 48 * 60 * 60 * 1000

function nowIso(value?: Date | null) {
  return value ? value.toISOString() : null
}

// Strip tags/angle brackets and clamp — submitters are untrusted; nothing here is
// ever rendered as HTML (the approve path re-escapes before building the body).
function sanitizeText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return ''
  return value.trim().replace(/<[^>]*>?/gm, '').replace(/[<>"]/g, '').slice(0, maxLength)
}

function sanitizeOptionalText(value: unknown, maxLength: number) {
  return sanitizeText(value, maxLength) || null
}

function sanitizeEmail(value: unknown) {
  const email = typeof value === 'string' ? value.trim().toLowerCase().slice(0, 255) : ''
  return EMAIL_REGEX.test(email) ? email : ''
}

// Only http(s) image links are stored — never data:/javascript: or other schemes.
function sanitizeOptionalImageUrl(value: unknown) {
  const url = typeof value === 'string' ? value.trim().slice(0, 2000) : ''
  if (!url) return null
  return /^https?:\/\//i.test(url) ? url : null
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function createVerificationToken() {
  return randomBytes(32).toString('base64url')
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

// Turn the submitter's plain-text description into safe rich-text HTML paragraphs.
function buildListingDescriptionBody(description: string | null) {
  if (!description) return ''
  const paragraphs: string[] = []
  for (const line of description.split(/\n{2,}/)) {
    const trimmed = line.trim()
    if (trimmed) paragraphs.push(`<p>${escapeHtml(trimmed).replace(/\n/g, '<br />')}</p>`)
  }
  return paragraphs.join('')
}

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function rowToListItem(row: any, duplicateNames: Set<string>): DirectorySubmissionListItem {
  return {
    id: row.id,
    site_id: row.siteId,
    status: row.status,
    business_name: row.businessName,
    address: row.address ?? null,
    description: row.description ?? null,
    image_url: row.imageUrl ?? null,
    contact_email: row.contactEmail ?? null,
    category_id: row.categoryId ?? null,
    category_title: row.categoryTitle ?? null,
    created_directory_id: row.createdDirectoryId ?? null,
    created_directory_slug: row.createdDirectorySlug ?? null,
    reviewed_at: nowIso(row.reviewedAt),
    review_note: row.reviewNote ?? null,
    created_at: row.createdAt?.toISOString() ?? '',
    possible_duplicate: duplicateNames.has(normalize(row.businessName)),
  }
}

async function getSiteEmailSender(site: { id: string; name: string }) {
  let siteEmailConfig: Awaited<ReturnType<typeof getEmailConfig>> = null
  try {
    siteEmailConfig = await getEmailConfig(site.id)
  } catch (error) {
    console.error('Failed to read site email config:', error)
  }

  const apiKey = siteEmailConfig?.apiKey || process.env.RESEND_API_KEY
  const fromEmail = siteEmailConfig?.fromEmail || process.env.AUTH_FROM_EMAIL || process.env.RESEND_FROM_EMAIL
  const fromName = siteEmailConfig?.fromName || site.name

  if (!apiKey || !fromEmail) {
    throw new Error('Email sending is not configured for this site')
  }

  const provider = getEmailProvider(apiKey, siteEmailConfig?.providerType || 'resend')
  return { provider, from: fromName ? `${fromName} <${fromEmail}>` : fromEmail }
}

async function sendSubmissionVerificationEmail(input: {
  site: { id: string; name: string; subdomain: string; customDomain: string | null }
  businessName: string
  contactEmail: string
  token: string
}) {
  const siteUrl = getSiteUrl({ subdomain: input.site.subdomain, customDomain: input.site.customDomain })
  const verifyUrl = `${siteUrl}/api/directory-submissions/verify?token=${encodeURIComponent(input.token)}`
  const { provider, from } = await getSiteEmailSender(input.site)

  const result = await provider.send({
    from,
    to: input.contactEmail,
    subject: `Confirm your listing for ${input.site.name}`,
    html: `
      <p>Confirm that you want to add <strong>${escapeHtml(input.businessName)}</strong> to ${escapeHtml(input.site.name)}.</p>
      <p><a href="${escapeHtml(verifyUrl)}">Confirm your email</a></p>
      <p>After you confirm, our team reviews the listing before it goes live.</p>
      <p>If you did not request this, you can ignore this email.</p>
    `,
  })

  if (!result.success) {
    throw new Error(result.error || 'Failed to send verification email')
  }
}

// Best-effort review-outcome email; a send failure must not undo the review.
async function sendSubmissionDecisionEmail(input: {
  site: { id: string; name: string; subdomain: string; customDomain: string | null }
  contactEmail: string
  businessName: string
  approved: boolean
  listingSlug?: string
  note: string | null
}) {
  try {
    const { provider, from } = await getSiteEmailSender(input.site)
    const escapedName = escapeHtml(input.businessName)
    const escapedSite = escapeHtml(input.site.name)

    let html: string
    if (input.approved) {
      const siteUrl = getSiteUrl({ subdomain: input.site.subdomain, customDomain: input.site.customDomain })
      const listingUrl = input.listingSlug ? `${siteUrl}/directory/${input.listingSlug}` : siteUrl
      html = `
        <p>Good news — <strong>${escapedName}</strong> is now live on ${escapedSite}.</p>
        <p><a href="${escapeHtml(listingUrl)}">View your listing</a></p>
      `
    } else {
      html = `
        <p>Thanks for submitting <strong>${escapedName}</strong> to ${escapedSite}.</p>
        <p>After review, we're not able to publish this listing right now.</p>
        ${input.note ? `<p>${escapeHtml(input.note)}</p>` : ''}
      `
    }

    await provider.send({
      from,
      to: input.contactEmail,
      subject: input.approved
        ? `Your listing is live on ${input.site.name}`
        : `Update on your listing for ${input.site.name}`,
      html,
    })
  } catch (error) {
    console.error('Failed to send submission decision email:', error)
  }
}

export async function submitDirectoryListingSubmissionActionImpl(input: {
  siteId: string
  businessName: string
  address?: string
  description?: string
  imageUrl?: string
  contactEmail: string
  categoryId?: string
  honeypot?: string
}): Promise<{ success: boolean; error?: string; message?: string }> {
  if (!UUID_REGEX.test(input.siteId)) {
    return { success: false, error: 'This form is not available.' }
  }

  // Honeypot: bots (and only bots) fill the hidden field. Pretend it worked so we
  // give the bot no signal, and never write or notify.
  if (typeof input.honeypot === 'string' && input.honeypot.trim()) {
    return { success: true, message: 'Thanks! Check your inbox to confirm your listing.' }
  }

  const businessName = sanitizeText(input.businessName, 255)
  const address = sanitizeOptionalText(input.address, 500)
  const description = sanitizeOptionalText(input.description, 5000)
  const imageUrl = sanitizeOptionalImageUrl(input.imageUrl)
  const contactEmail = sanitizeEmail(input.contactEmail)
  const rawCategoryId = typeof input.categoryId === 'string' ? input.categoryId.trim() : ''

  if (!businessName) return { success: false, error: 'Enter the business name.' }
  if (!contactEmail) return { success: false, error: 'Enter a valid email address.' }
  if (rawCategoryId && !UUID_REGEX.test(rawCategoryId)) {
    return { success: false, error: 'Choose a valid category.' }
  }

  try {
    const [site] = await db
      .select({ id: sites.id, name: sites.name, subdomain: sites.subdomain, customDomain: sites.customDomain })
      .from(sites)
      .where(eq(sites.id, input.siteId))
      .limit(1)
    if (!site) return { success: false, error: 'This form is not available.' }

    const clientIp = getClientIp(await headers()) || 'unknown'
    const limited = await isPersistentRateLimited(
      `listing-submission:${input.siteId}:${clientIp}`,
      SUBMISSION_RATE_LIMIT,
      SUBMISSION_RATE_WINDOW_MS,
    )
    if (limited) {
      return { success: false, error: 'Too many submissions. Please try again later.' }
    }

    // Only a published child category of THIS site may be chosen (matches the
    // platform rule that only leaf categories are assignable to a listing).
    let categoryId: string | null = null
    if (rawCategoryId) {
      const [category] = await db
        .select({ id: categories.id })
        .from(categories)
        .where(and(
          eq(categories.id, rawCategoryId),
          eq(categories.siteId, input.siteId),
          eq(categories.isPublished, true),
        ))
        .limit(1)
      if (!category) return { success: false, error: 'Choose a valid category.' }
      categoryId = category.id
    }

    const token = createVerificationToken()
    const verificationTokenHash = hashToken(token)
    const verificationTokenExpiresAt = new Date(Date.now() + VERIFICATION_EXPIRES_MS)

    // Collapse a repeat submit (same email + business name) inside the window.
    const [duplicate] = await db
      .select({ id: directorySubmissions.id, status: directorySubmissions.status })
      .from(directorySubmissions)
      .where(and(
        eq(directorySubmissions.siteId, input.siteId),
        inArray(directorySubmissions.status, ['pending_email', 'pending_review']),
        eq(directorySubmissions.contactEmail, contactEmail),
        sql`lower(${directorySubmissions.businessName}) = ${businessName.toLowerCase()}`,
        gte(directorySubmissions.createdAt, new Date(Date.now() - DUPLICATE_WINDOW_MS)),
      ))
      .limit(1)

    // Already verified and waiting for review — don't create a second one or re-email.
    if (duplicate && duplicate.status === 'pending_review') {
      return { success: true, message: 'Thanks! Your listing is already awaiting review.' }
    }

    if (duplicate) {
      // Still unverified: refresh the token and re-send the confirmation email.
      await db
        .update(directorySubmissions)
        .set({
          businessName,
          address,
          description,
          imageUrl,
          categoryId,
          verificationTokenHash,
          verificationTokenExpiresAt,
          updatedAt: new Date(),
        })
        .where(eq(directorySubmissions.id, duplicate.id))
    } else {
      await db
        .insert(directorySubmissions)
        .values({
          siteId: input.siteId,
          businessName,
          address,
          description,
          imageUrl,
          contactEmail,
          categoryId,
          verificationTokenHash,
          verificationTokenExpiresAt,
        })
    }

    try {
      await sendSubmissionVerificationEmail({ site, businessName, contactEmail, token })
    } catch (error) {
      console.error('Failed to send listing verification email:', error)
      return { success: false, error: "We couldn't send the confirmation email. Please try again later." }
    }

    return { success: true, message: 'Thanks! Check your inbox to confirm your listing.' }
  } catch (error) {
    console.error('Failed to submit directory listing:', error)
    return { success: false, error: 'Something went wrong. Please try again.' }
  }
}

// Public: the published child categories a visitor may pick on the submission form.
export async function getListingSubmissionCategoriesActionImpl(siteId: string): Promise<{
  data: ListingSubmissionCategory[]
  error: string | null
}> {
  if (!UUID_REGEX.test(siteId)) return { data: [], error: 'Invalid site ID' }

  const rows = await db
    .select({ id: categories.id, title: categories.title, parentId: categories.parentId })
    .from(categories)
    .where(and(eq(categories.siteId, siteId), eq(categories.isPublished, true)))
    .orderBy(asc(categories.displayOrder), asc(categories.title))

  const parentTitles = new Map(rows.filter((row) => !row.parentId).map((row) => [row.id, row.title]))

  // Only child (leaf) categories are assignable, matching the platform rule.
  const data = rows
    .filter((row) => row.parentId)
    .map((row) => ({
      id: row.id,
      title: row.title,
      parent_title: row.parentId ? parentTitles.get(row.parentId) || null : null,
    }))

  return { data, error: null }
}

export async function getDirectorySubmissionListActionImpl(siteId: string, status?: DirectorySubmissionStatus): Promise<{
  data: DirectorySubmissionListItem[]
  counts: Record<DirectorySubmissionStatus, number>
  error: string | null
}> {
  const emptyCounts: Record<DirectorySubmissionStatus, number> = { pending_email: 0, pending_review: 0, approved: 0, rejected: 0 }

  if (!UUID_REGEX.test(siteId)) return { data: [], counts: emptyCounts, error: 'Invalid site ID' }
  if (status && !REVIEW_STATUSES.includes(status)) {
    return { data: [], counts: emptyCounts, error: 'Invalid submission status' }
  }

  const user = await getAuthenticatedUser()
  if (!user) return { data: [], counts: emptyCounts, error: 'Authentication required' }
  if (user.role !== 'super_admin') return { data: [], counts: emptyCounts, error: 'Access denied' }

  // Unverified (pending_email) rows are never shown in the queue — only the three
  // reviewable states. The status filter defaults to pending_review.
  const statusFilter = status ?? 'pending_review'

  const [countRows, rows] = await Promise.all([
    db
      .select({ status: directorySubmissions.status, count: sql<number>`count(*)::int` })
      .from(directorySubmissions)
      .where(and(
        eq(directorySubmissions.siteId, siteId),
        inArray(directorySubmissions.status, REVIEW_STATUSES),
      ))
      .groupBy(directorySubmissions.status),
    db
      .select({
        id: directorySubmissions.id,
        siteId: directorySubmissions.siteId,
        status: directorySubmissions.status,
        businessName: directorySubmissions.businessName,
        address: directorySubmissions.address,
        description: directorySubmissions.description,
        imageUrl: directorySubmissions.imageUrl,
        contactEmail: directorySubmissions.contactEmail,
        categoryId: directorySubmissions.categoryId,
        createdDirectoryId: directorySubmissions.createdDirectoryId,
        reviewedAt: directorySubmissions.reviewedAt,
        reviewNote: directorySubmissions.reviewNote,
        createdAt: directorySubmissions.createdAt,
        categoryTitle: categories.title,
        createdDirectorySlug: directories.slug,
      })
      .from(directorySubmissions)
      .leftJoin(categories, eq(categories.id, directorySubmissions.categoryId))
      .leftJoin(directories, eq(directories.id, directorySubmissions.createdDirectoryId))
      .where(and(eq(directorySubmissions.siteId, siteId), eq(directorySubmissions.status, statusFilter)))
      .orderBy(desc(directorySubmissions.createdAt))
      .limit(100),
  ])

  const counts = { ...emptyCounts }
  for (const row of countRows) {
    counts[row.status as DirectorySubmissionStatus] = row.count
  }

  // Flag submissions whose name matches an existing listing on the site, so the
  // reviewer can catch duplicates before approving. Only meaningful on the
  // pending queue — an approved submission always matches the listing it created.
  const nameKeys = statusFilter === 'pending_review'
    ? [...new Set(rows.map((row) => normalize(row.businessName)).filter(Boolean))]
    : []
  const duplicateNames = new Set<string>()
  if (nameKeys.length) {
    const existing = await db
      .select({ title: directories.title })
      .from(directories)
      .where(and(eq(directories.siteId, siteId), inArray(sql`lower(${directories.title})`, nameKeys)))
    for (const row of existing) duplicateNames.add(normalize(row.title))
  }

  return { data: rows.map((row) => rowToListItem(row, duplicateNames)), counts, error: null }
}

// Map the submission's values onto the template's value blocks: address + contact
// email into the Core block (when the template has one), description into the
// rich-text block (when it has one). Returns raw value blocks keyed by the
// template's block ids; the caller prunes against the template before saving.
function buildSubmissionListingContent(
  templateBlocks: Record<string, any>,
  submission: { address: string | null; contactEmail: string | null; descriptionHtml: string },
): Record<string, any> {
  const blocks: Record<string, any> = {}

  const coreEntry = Object.entries(templateBlocks).find(
    ([, value]) => isRecord(value) && value.type === DIRECTORY_CORE_BLOCK_TYPE,
  )
  if (coreEntry) {
    const [coreId, coreBlock] = coreEntry
    const content: Record<string, unknown> = {}
    if (submission.address) content.address = submission.address
    if (submission.contactEmail) content.menuLinks = [{ type: 'email', value: submission.contactEmail }]
    if (Object.keys(content).length) {
      blocks[coreId] = {
        id: coreId,
        type: DIRECTORY_CORE_BLOCK_TYPE,
        display_order: Number((coreBlock as Record<string, any>).display_order ?? 0),
        content,
      }
    }
  }

  const richEntry = Object.entries(templateBlocks).find(
    ([, value]) => isRecord(value) && value.type === DIRECTORY_RICH_TEXT_BLOCK_TYPE,
  )
  if (richEntry && submission.descriptionHtml.trim()) {
    const [richId, richBlock] = richEntry
    blocks[richId] = {
      id: richId,
      type: DIRECTORY_RICH_TEXT_BLOCK_TYPE,
      display_order: Number((richBlock as Record<string, any>).display_order ?? 0),
      content: { body: submission.descriptionHtml, format: 'html' },
    }
  }

  return blocks
}

export async function reviewDirectorySubmissionActionImpl(input: {
  submissionId: string
  status: 'approved' | 'rejected'
  note?: string
}): Promise<{ success: boolean; error: string | null; listingSlug?: string }> {
  if (!UUID_REGEX.test(input.submissionId)) return { success: false, error: 'Invalid submission ID' }
  if (input.status !== 'approved' && input.status !== 'rejected') {
    return { success: false, error: 'Invalid review status' }
  }

  const user = await getAuthenticatedUser()
  if (!user) return { success: false, error: 'Authentication required' }
  if (user.role !== 'super_admin') return { success: false, error: 'Access denied' }

  const [submission] = await db
    .select()
    .from(directorySubmissions)
    .where(eq(directorySubmissions.id, input.submissionId))
    .limit(1)

  if (!submission) return { success: false, error: 'Submission not found' }
  if (submission.status !== 'pending_review') {
    return { success: false, error: 'This submission has already been reviewed.' }
  }

  const [site] = await db
    .select({ id: sites.id, name: sites.name, subdomain: sites.subdomain, customDomain: sites.customDomain })
    .from(sites)
    .where(eq(sites.id, submission.siteId))
    .limit(1)
  if (!site) return { success: false, error: 'Site not found' }

  const now = new Date()
  const reviewNote = sanitizeOptionalText(input.note, 1000)

  if (input.status === 'rejected') {
    await db
      .update(directorySubmissions)
      .set({ status: 'rejected', reviewedByUserId: user.id, reviewedAt: now, reviewNote, updatedAt: now })
      .where(eq(directorySubmissions.id, submission.id))

    await sendSubmissionDecisionEmail({
      site,
      contactEmail: submission.contactEmail,
      businessName: submission.businessName,
      approved: false,
      note: reviewNote,
    })
    return { success: true, error: null }
  }

  // Approve: create a real, PUBLISHED, template-conformant listing.
  const templateId = await getDefaultDirectoryTemplateIdForSite(submission.siteId)
  const [template] = await db
    .select({ contentBlocks: directoryTemplates.contentBlocks })
    .from(directoryTemplates)
    .where(and(eq(directoryTemplates.id, templateId), eq(directoryTemplates.siteId, submission.siteId)))
    .limit(1)
  const templateBlocks = (template?.contentBlocks ?? {}) as Record<string, any>

  const contentBlocks = pruneDirectoryValueBlocksForTemplate(
    buildSubmissionListingContent(templateBlocks, {
      address: submission.address,
      contactEmail: submission.contactEmail,
      descriptionHtml: buildListingDescriptionBody(submission.description),
    }),
    templateBlocks,
  )

  // A short summary for search/SEO: prefer the rich-text body, else the raw description.
  const metaDescription =
    deriveDirectoryMetaDescriptionFromBlocks(contentBlocks) ||
    (submission.description ? submission.description.slice(0, 160) : null)

  const coordinateUpdates = await resolveDirectoryCoordinateUpdates({
    siteId: submission.siteId,
    current: { latitude: null, longitude: null, geocodedAddress: null },
    contentBlocks,
  })

  // Confirm the chosen category is still a valid published child category.
  let categoryId: string | null = null
  if (submission.categoryId) {
    const [category] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(
        eq(categories.id, submission.categoryId),
        eq(categories.siteId, submission.siteId),
        eq(categories.isPublished, true),
      ))
      .limit(1)
    categoryId = category?.id ?? null
  }

  const displayOrder = await getNextContentDisplayOrder(directories, submission.siteId)

  let listing: { id: string; slug: string } | null = null
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = await generateUniqueContentSlug(directories, submission.siteId, submission.businessName)
    try {
      listing = await db.transaction(async (tx) => {
        const [inserted] = await tx
          .insert(directories)
          .values({
            siteId: submission.siteId,
            templateId,
            title: submission.businessName,
            slug,
            status: 'published',
            metaDescription,
            featuredImage: submission.imageUrl,
            contentBlocks,
            displayOrder,
            sourceType: 'submission',
            sourceId: submission.id,
            ...coordinateUpdates,
          })
          .returning({ id: directories.id, slug: directories.slug })
        if (!inserted) throw new Error('Listing insert returned no row')

        if (categoryId) {
          await tx.insert(contentCategoryRelationships).values({
            contentId: inserted.id,
            contentType: 'directory',
            categoryId,
            isPrimary: true,
          })
        }

        await tx
          .update(directorySubmissions)
          .set({
            status: 'approved',
            createdDirectoryId: inserted.id,
            reviewedByUserId: user.id,
            reviewedAt: now,
            reviewNote,
            updatedAt: now,
          })
          .where(eq(directorySubmissions.id, submission.id))

        return inserted
      })
      break
    } catch (error) {
      // Retry on a slug-collision race; surface anything else.
      if (isUniqueViolation(error) && attempt < 4) continue
      console.error('Failed to approve directory submission:', error)
      return { success: false, error: 'Could not create the listing. Please try again.' }
    }
  }

  if (!listing) return { success: false, error: 'Could not create the listing. Please try again.' }

  const [fullListing] = await db.select().from(directories).where(eq(directories.id, listing.id)).limit(1)
  if (fullListing) await safeSyncSiteSearchDocument('directory', fullListing)

  revalidateTag('directory')
  revalidateTag('listing-views')
  revalidateTag(`site-${submission.siteId}`)
  revalidateTag(`directory-${listing.id}`)
  if (categoryId) {
    revalidateTag('content-categories')
    revalidateTag(`category-${categoryId}`)
  }

  await sendSubmissionDecisionEmail({
    site,
    contactEmail: submission.contactEmail,
    businessName: submission.businessName,
    approved: true,
    listingSlug: listing.slug,
    note: reviewNote,
  })

  return { success: true, error: null, listingSlug: listing.slug }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error
  for (let depth = 0; depth < 5 && current; depth++) {
    if (typeof current === 'object' && current && 'code' in current && (current as { code?: string }).code === '23505') {
      return true
    }
    current = typeof current === 'object' && current ? (current as { cause?: unknown }).cause : undefined
  }
  return false
}
