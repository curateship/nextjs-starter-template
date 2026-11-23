import { createHash, randomBytes } from 'crypto'
import { revalidateTag } from '@/lib/cache'
import { and, asc, desc, eq, inArray, ne, sql } from 'drizzle-orm'

import { getEmailProvider } from '@/lib/actions/email/provider'
import { getEmailConfig } from '@/lib/actions/integrations/config-helpers'
import { getPublicAuthPagePath } from '@/lib/actions/pages/page-frontend-actions'
import { createHubNotificationForSuperAdmins } from '@/lib/actions/notifications/notification-service'
import { db } from '@/lib/db'
import { getAuthenticatedUser } from '@/lib/db/helpers'
import {
  authUsers,
  categories,
  contentCategoryRelationships,
  directories,
  directoryClaims,
  directoryCustomBlocks,
  directoryOwnerEditRequests,
  directoryTemplates,
  sites,
  siteAccountPages,
} from '@/lib/db/schema'
import {
  buildDirectoryCoreMenuHref,
  DIRECTORY_CORE_BLOCK_TYPE,
  normalizeDirectoryCoreMenuLink,
} from '@/lib/actions/directories/directory-core'
import {
  mergeDirectoryTemplateBlocks,
  pruneDirectoryValueBlocksForTemplate,
} from '@/lib/actions/directories/directory-template-inheritance'
import type { DirectoryCustomBlockLayout, DirectoryCustomBlockTemplate } from '@/lib/actions/directories/directory-custom-blocks/types'
import { resolveDirectoryCoordinateUpdates } from './directory-geocoding'
import { upsertSiteMembership } from '@/lib/utils/site-membership-runtime'
import { getSiteUrl } from '@/lib/utils/site-url-generator'
import { generateSlug } from '@/lib/utils/slug'
import { SLUG_FORMAT_REGEX, UUID_REGEX } from '@/lib/utils/validation'

export type DirectoryClaimStatus = 'pending_email' | 'pending_review' | 'approved' | 'rejected' | 'revoked'
export type DirectoryOwnerEditRequestStatus = 'pending' | 'approved' | 'rejected'

export interface DirectoryClaimListItem {
  id: string
  site_id: string
  directory_id: string
  directory_title: string
  directory_slug: string
  claimant_user_id: string
  claimant_account_email: string
  claimant_display_name: string | null
  business_email: string
  business_email_verified_at: string | null
  status: DirectoryClaimStatus
  claimant_name: string | null
  role_title: string | null
  phone: string | null
  message: string | null
  proof_url: string | null
  domain_matches: boolean
  reviewed_at: string | null
  review_note: string | null
  created_at: string
}

export interface ClaimedDirectoryEditorItem {
  id: string
  claim_id: string
  title: string
  slug: string
  featured_image: string | null
  meta_description: string | null
  content_blocks: Record<string, any>
  categories: ClaimedDirectoryCategory[]
  primary_category_id: string | null
  pending_edit: {
    id: string
    status: DirectoryOwnerEditRequestStatus
    review_note: string | null
    updated_at: string
  } | null
}

export interface ClaimedDirectoryCategory {
  id: string
  title: string
  parent_id: string | null
  parent_title: string | null
}

export interface DirectoryOwnerEditRequestListItem {
  id: string
  site_id: string
  directory_id: string
  directory_title: string
  directory_slug: string
  claimant_account_email: string
  claimant_display_name: string | null
  status: DirectoryOwnerEditRequestStatus
  listing_values: Record<string, any>
  content_blocks: Record<string, any>
  category_ids: string[]
  primary_category_id: string | null
  reviewed_at: string | null
  review_note: string | null
  created_at: string
  updated_at: string
}

const CLAIM_EMAIL_EXPIRES_MS = 48 * 60 * 60 * 1000
const CLAIM_EMAIL_RESEND_COOLDOWN_MS = 10 * 60 * 1000
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const CLAIM_STATUSES: DirectoryClaimStatus[] = ['pending_email', 'pending_review', 'approved', 'rejected', 'revoked']
const OWNER_EDIT_STATUSES: DirectoryOwnerEditRequestStatus[] = ['pending', 'approved', 'rejected']
const MUTABLE_CLAIM_STATUSES: DirectoryClaimStatus[] = ['pending_email', 'rejected', 'revoked']
const OWNER_LISTINGS_ACCOUNT_PAGE_SLUG = 'my-listings'

function nowIso(value?: Date | null) {
  return value ? value.toISOString() : null
}

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

function createVerificationToken() {
  return randomBytes(32).toString('base64url')
}

function sanitizeText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return ''
  return value.trim().replace(/<[^>]*>?/gm, '').replace(/[<>"]/g, '').slice(0, maxLength)
}

function sanitizeOptionalText(value: unknown, maxLength: number) {
  const sanitized = sanitizeText(value, maxLength)
  return sanitized || null
}

function sanitizeEmail(value: unknown) {
  const email = typeof value === 'string' ? value.trim().toLowerCase().slice(0, 255) : ''
  return EMAIL_REGEX.test(email) ? email : ''
}

function isSafePublicUrl(value: string) {
  if (!value) return true
  if (value.startsWith('/cdn/') || value.startsWith('/api/media/proxy?')) return !value.includes('\\')

  try {
    const parsedUrl = new URL(value)
    return parsedUrl.protocol === 'http:' || parsedUrl.protocol === 'https:'
  } catch {
    return false
  }
}

function sanitizeOptionalUrl(value: unknown) {
  const url = typeof value === 'string' ? value.trim().slice(0, 2048) : ''
  return url && isSafePublicUrl(url) ? url : null
}

function normalizeDomain(value: string) {
  return value.trim().toLowerCase().replace(/^www\./, '')
}

function getEmailDomain(email: string) {
  return normalizeDomain(email.split('@')[1] || '')
}

function getUrlDomain(value: string) {
  try {
    return normalizeDomain(new URL(value).hostname)
  } catch {
    return ''
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function getObjectBlocks(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any>
    : {}
}

function getDirectoryCustomTemplateIds(contentBlocks: unknown) {
  return Object.values(getObjectBlocks(contentBlocks))
    .flatMap((block: any) => {
      if (block?.type !== 'directory-custom') return []

      const templateId = block.content?.templateId
      return typeof templateId === 'string' && UUID_REGEX.test(templateId) ? [templateId] : []
    })
}

function getMergedContentBlocks(directory: { contentBlocks: unknown }, template: { contentBlocks: unknown }) {
  return mergeDirectoryTemplateBlocks(
    getObjectBlocks(template.contentBlocks),
    getObjectBlocks(directory.contentBlocks)
  )
}

function getCoreBlockEntry(contentBlocks: Record<string, any>) {
  return Object.entries(contentBlocks).find(([, block]) => block?.type === DIRECTORY_CORE_BLOCK_TYPE) || null
}

function getDirectoryWebsiteDomain(contentBlocks: Record<string, any>) {
  const coreEntry = getCoreBlockEntry(contentBlocks)
  const coreContent = coreEntry?.[1]?.content
  const menuLinks = Array.isArray(coreContent?.menuLinks) ? coreContent.menuLinks : []

  for (const rawLink of menuLinks) {
    const link = normalizeDirectoryCoreMenuLink(rawLink, 0)
    if (!link || link.type !== 'website') continue

    const href = buildDirectoryCoreMenuHref(link)
    const domain = getUrlDomain(href)
    if (domain) return domain
  }

  return ''
}

function buildDomainMatch(contentBlocks: Record<string, any>, businessEmail: string) {
  const websiteDomain = getDirectoryWebsiteDomain(contentBlocks)
  const emailDomain = getEmailDomain(businessEmail)
  return Boolean(websiteDomain && emailDomain && websiteDomain === emailDomain)
}

function rowToClaimListItem(row: any): DirectoryClaimListItem {
  return {
    id: row.id,
    site_id: row.siteId,
    directory_id: row.directoryId,
    directory_title: row.directoryTitle,
    directory_slug: row.directorySlug,
    claimant_user_id: row.userId,
    claimant_account_email: row.accountEmail,
    claimant_display_name: row.displayName ?? row.accountName ?? null,
    business_email: row.businessEmail,
    business_email_verified_at: nowIso(row.businessEmailVerifiedAt),
    status: row.status,
    claimant_name: row.claimantName ?? null,
    role_title: row.roleTitle ?? null,
    phone: row.phone ?? null,
    message: row.message ?? null,
    proof_url: row.proofUrl ?? null,
    domain_matches: row.domainMatches === true,
    reviewed_at: nowIso(row.reviewedAt),
    review_note: row.reviewNote ?? null,
    created_at: row.createdAt?.toISOString() ?? '',
  }
}

function getStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function getListingValues(value: unknown) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
  return {
    title: typeof source.title === 'string' ? source.title : '',
    slug: typeof source.slug === 'string' ? source.slug : '',
    featured_image: typeof source.featured_image === 'string' ? source.featured_image : null,
    meta_description: typeof source.meta_description === 'string' ? source.meta_description : null,
  }
}

function rowToOwnerEditRequestListItem(row: any): DirectoryOwnerEditRequestListItem {
  return {
    id: row.id,
    site_id: row.siteId,
    directory_id: row.directoryId,
    directory_title: row.directoryTitle,
    directory_slug: row.directorySlug,
    claimant_account_email: row.accountEmail,
    claimant_display_name: row.displayName ?? row.accountName ?? null,
    status: row.status,
    listing_values: getListingValues(row.listingValues),
    content_blocks: getObjectBlocks(row.contentBlocks),
    category_ids: getStringArray(row.categoryIds),
    primary_category_id: typeof row.primaryCategoryId === 'string' ? row.primaryCategoryId : null,
    reviewed_at: nowIso(row.reviewedAt),
    review_note: row.reviewNote ?? null,
    created_at: row.createdAt?.toISOString() ?? '',
    updated_at: row.updatedAt?.toISOString() ?? '',
  }
}

function serializeCustomBlockTemplate(row: typeof directoryCustomBlocks.$inferSelect): DirectoryCustomBlockTemplate {
  return {
    id: row.id,
    site_id: row.siteId,
    name: row.name,
    slug: row.slug,
    layout: row.layout as DirectoryCustomBlockLayout,
    fields: Array.isArray(row.fields) ? row.fields : [],
    used_in_count: 0,
    created_at: row.createdAt?.toISOString() ?? '',
    updated_at: row.updatedAt?.toISOString() ?? '',
  }
}

async function ensureOwnerListingsAccountPage(siteId: string) {
  const now = new Date()
  const ownerBlockId = 'claimed-listings'
  const ownerBlock = {
    id: ownerBlockId,
    type: 'account-claimed-listings',
    content: {
      title: 'My Listings',
      description: 'Manage the listings approved for your account.',
      listingLabel: 'Listing',
      saveButtonText: 'Submit for Review',
      emptyText: 'No approved listing claims yet.',
      visibility: {},
    },
    display_order: 0,
  }

  const [page] = await db
    .select()
    .from(siteAccountPages)
    .where(and(eq(siteAccountPages.siteId, siteId), eq(siteAccountPages.slug, OWNER_LISTINGS_ACCOUNT_PAGE_SLUG)))
    .limit(1)

  if (!page) {
    const [lastPage] = await db
      .select({ displayOrder: siteAccountPages.displayOrder })
      .from(siteAccountPages)
      .where(eq(siteAccountPages.siteId, siteId))
      .orderBy(desc(siteAccountPages.displayOrder))
      .limit(1)

    await db.insert(siteAccountPages).values({
      siteId,
      title: 'My Listings',
      slug: OWNER_LISTINGS_ACCOUNT_PAGE_SLUG,
      metaDescription: 'Manage claimed directory listings.',
      contentBlocks: { [ownerBlockId]: ownerBlock },
      displayOrder: lastPage ? lastPage.displayOrder + 1 : 1,
      isDefault: false,
      isPublished: true,
      createdAt: now,
      updatedAt: now,
    })
    revalidateTag(`account-pages-${siteId}`)
    return
  }

  const contentBlocks = getObjectBlocks(page.contentBlocks)
  const hasOwnerBlock = Object.values(contentBlocks).some((block: any) => block?.type === 'account-claimed-listings')
  if (hasOwnerBlock) return

  const blockId = contentBlocks[ownerBlockId] ? `claimed-listings-${Date.now()}` : ownerBlockId
  await db
    .update(siteAccountPages)
    .set({
      contentBlocks: {
        ...contentBlocks,
        [blockId]: { ...ownerBlock, id: blockId, display_order: Object.keys(contentBlocks).length },
      },
      updatedAt: now,
    })
    .where(eq(siteAccountPages.id, page.id))
  revalidateTag(`account-pages-${siteId}`)
  revalidateTag(`account-page-${page.id}`)
}

async function validateDirectoryOwnerSlug(siteId: string, directoryId: string, rawSlug: unknown, title: string) {
  const slug = (typeof rawSlug === 'string' ? rawSlug.trim() : '') || generateSlug(title)

  if (!SLUG_FORMAT_REGEX.test(slug)) {
    return { slug: null, error: 'Invalid slug format. Use only letters, numbers, hyphens, and underscores.' }
  }

  const [existing] = await db
    .select({ id: directories.id })
    .from(directories)
    .where(and(eq(directories.siteId, siteId), eq(directories.slug, slug)))
    .limit(1)

  if (existing && existing.id !== directoryId) {
    return { slug: null, error: `A listing with the slug "${slug}" already exists. Please choose a different slug.` }
  }

  return { slug, error: null }
}

async function validateOwnerDirectoryCategories(siteId: string, rawCategoryIds: unknown, rawPrimaryCategoryId: unknown) {
  const categoryIds = getStringArray(rawCategoryIds)
  const uniqueCategoryIds = [...new Set(categoryIds)]

  if (uniqueCategoryIds.some((id) => !UUID_REGEX.test(id))) {
    return { categoryIds: [] as string[], primaryCategoryId: null, error: 'Invalid category ID' }
  }

  if (uniqueCategoryIds.length === 0) {
    return { categoryIds: [], primaryCategoryId: null, error: null }
  }

  const rows = await db
    .select({
      id: categories.id,
      siteId: categories.siteId,
      isPublished: categories.isPublished,
      parentId: categories.parentId,
    })
    .from(categories)
    .where(inArray(categories.id, uniqueCategoryIds))

  if (rows.length !== uniqueCategoryIds.length) {
    return { categoryIds: [] as string[], primaryCategoryId: null, error: 'One or more categories not found' }
  }

  if (rows.some((category) => category.siteId !== siteId || !category.isPublished || !category.parentId)) {
    return { categoryIds: [] as string[], primaryCategoryId: null, error: 'One or more categories cannot be assigned' }
  }

  const primaryCategoryId = typeof rawPrimaryCategoryId === 'string' && uniqueCategoryIds.includes(rawPrimaryCategoryId)
    ? rawPrimaryCategoryId
    : uniqueCategoryIds[0] || null

  return { categoryIds: uniqueCategoryIds, primaryCategoryId, error: null }
}

async function getOwnerAssignableCategories(siteId: string): Promise<ClaimedDirectoryCategory[]> {
  const rows = await db
    .select({
      id: categories.id,
      title: categories.title,
      parentId: categories.parentId,
    })
    .from(categories)
    .where(and(eq(categories.siteId, siteId), eq(categories.isPublished, true)))
    .orderBy(asc(categories.displayOrder), asc(categories.title))

  const parentTitles = new Map(rows.filter((row) => !row.parentId).map((row) => [row.id, row.title]))

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    parent_id: row.parentId,
    parent_title: row.parentId ? parentTitles.get(row.parentId) || null : null,
  }))
}

async function sendClaimVerificationEmail(input: {
  site: { id: string; name: string; subdomain: string; customDomain: string | null }
  directory: { title: string; slug: string }
  businessEmail: string
  token: string
}) {
  const siteUrl = getSiteUrl({
    subdomain: input.site.subdomain,
    customDomain: input.site.customDomain,
  })
  const verifyUrl = `${siteUrl}/api/directory-claims/verify?token=${encodeURIComponent(input.token)}`

  let siteEmailConfig: Awaited<ReturnType<typeof getEmailConfig>> = null
  try {
    siteEmailConfig = await getEmailConfig(input.site.id)
  } catch (error) {
    console.error('Failed to read site email config:', error)
  }

  const apiKey = siteEmailConfig?.apiKey || process.env.RESEND_API_KEY
  const fromEmail = siteEmailConfig?.fromEmail || process.env.AUTH_FROM_EMAIL || process.env.RESEND_FROM_EMAIL
  const fromName = siteEmailConfig?.fromName || input.site.name

  if (!apiKey || !fromEmail) {
    throw new Error('Email sending is not configured for this site')
  }

  const provider = getEmailProvider(apiKey, siteEmailConfig?.providerType || 'resend')
  const escapedSiteName = escapeHtml(input.site.name)
  const escapedDirectoryTitle = escapeHtml(input.directory.title)
  const result = await provider.send({
    from: fromName ? `${fromName} <${fromEmail}>` : fromEmail,
    to: input.businessEmail,
    subject: `Confirm your claim for ${input.directory.title}`,
    html: `
      <p>Confirm that you want to claim <strong>${escapedDirectoryTitle}</strong> on ${escapedSiteName}.</p>
      <p><a href="${escapeHtml(verifyUrl)}">Confirm business email</a></p>
      <p>If you did not request this, you can ignore this email.</p>
    `,
  })

  if (!result.success) {
    throw new Error(result.error || 'Failed to send verification email')
  }
}

export async function getDirectoryClaimStateActionImpl(directoryId: string): Promise<{
  authenticated: boolean
  status: DirectoryClaimStatus | null
  claimedByOther: boolean
  canEdit: boolean
  authPath: string | null
  error: string | null
}> {
  if (!UUID_REGEX.test(directoryId)) {
    return { authenticated: false, status: null, claimedByOther: false, canEdit: false, authPath: null, error: 'Invalid directory ID' }
  }

  const [directory] = await db
    .select({ id: directories.id, siteId: directories.siteId })
    .from(directories)
    .where(eq(directories.id, directoryId))
    .limit(1)

  if (!directory) {
    return { authenticated: false, status: null, claimedByOther: false, canEdit: false, authPath: null, error: 'Directory not found' }
  }

  const user = await getAuthenticatedUser()
  const authPathResult = user ? { path: null } : await getPublicAuthPagePath(directory.siteId)

  const [approvedClaim] = await db
    .select({ userId: directoryClaims.userId })
    .from(directoryClaims)
    .where(and(eq(directoryClaims.directoryId, directoryId), eq(directoryClaims.status, 'approved')))
    .limit(1)

  if (!user) {
    return {
      authenticated: false,
      status: null,
      claimedByOther: Boolean(approvedClaim),
      canEdit: false,
      authPath: authPathResult.path || '/',
      error: null,
    }
  }

  const [claim] = await db
    .select({ status: directoryClaims.status })
    .from(directoryClaims)
    .where(and(eq(directoryClaims.directoryId, directoryId), eq(directoryClaims.userId, user.id)))
    .limit(1)

  return {
    authenticated: true,
    status: (claim?.status as DirectoryClaimStatus | undefined) || null,
    claimedByOther: Boolean(approvedClaim && approvedClaim.userId !== user.id),
    canEdit: claim?.status === 'approved',
    authPath: null,
    error: null,
  }
}

export async function submitDirectoryClaimActionImpl(input: {
  directoryId: string
  businessEmail: string
  claimantName: string
  roleTitle?: string
  phone?: string
  message?: string
  proofUrl?: string
}): Promise<{ success: boolean; status?: DirectoryClaimStatus; error?: string; message?: string }> {
  if (!UUID_REGEX.test(input.directoryId)) {
    return { success: false, error: 'Invalid directory ID' }
  }

  const user = await getAuthenticatedUser()
  if (!user) {
    return { success: false, error: 'Authentication required' }
  }

  const businessEmail = sanitizeEmail(input.businessEmail)
  const claimantName = sanitizeText(input.claimantName, 255)
  const roleTitle = sanitizeOptionalText(input.roleTitle, 120)
  const phone = sanitizeOptionalText(input.phone, 80)
  const message = sanitizeOptionalText(input.message, 2000)
  const proofUrl = sanitizeOptionalUrl(input.proofUrl)

  if (!businessEmail) return { success: false, error: 'Enter a valid business email' }
  if (!claimantName) return { success: false, error: 'Enter your name' }
  if (input.proofUrl && !proofUrl) return { success: false, error: 'Enter a valid proof link' }

  const [row] = await db
    .select({
      directory: directories,
      template: directoryTemplates,
      site: {
        id: sites.id,
        name: sites.name,
        subdomain: sites.subdomain,
        customDomain: sites.customDomain,
      },
    })
    .from(directories)
    .innerJoin(directoryTemplates, eq(directoryTemplates.id, directories.templateId))
    .innerJoin(sites, eq(sites.id, directories.siteId))
    .where(and(eq(directories.id, input.directoryId), eq(directories.status, 'published')))
    .limit(1)

  if (!row) {
    return { success: false, error: 'Listing not found' }
  }

  const [approvedByOther] = await db
    .select({ id: directoryClaims.id })
    .from(directoryClaims)
    .where(and(
      eq(directoryClaims.directoryId, input.directoryId),
      eq(directoryClaims.status, 'approved'),
      ne(directoryClaims.userId, user.id)
    ))
    .limit(1)

  if (approvedByOther) {
    return { success: false, error: 'This listing has already been claimed' }
  }

  const [existingClaim] = await db
    .select()
    .from(directoryClaims)
    .where(and(eq(directoryClaims.directoryId, input.directoryId), eq(directoryClaims.userId, user.id)))
    .limit(1)

  if (existingClaim?.status === 'approved') {
    return { success: true, status: 'approved', message: 'This listing is already approved for your account.' }
  }

  if (existingClaim?.status === 'pending_review') {
    return { success: true, status: 'pending_review', message: 'Your claim is already waiting for review.' }
  }

  const now = new Date()
  if (
    existingClaim?.status === 'pending_email' &&
    existingClaim.updatedAt &&
    now.getTime() - existingClaim.updatedAt.getTime() < CLAIM_EMAIL_RESEND_COOLDOWN_MS
  ) {
    return {
      success: true,
      status: 'pending_email',
      message: 'A verification email was recently sent. Please wait a few minutes before requesting another.',
    }
  }

  const token = createVerificationToken()
  const expiresAt = new Date(now.getTime() + CLAIM_EMAIL_EXPIRES_MS)
  const contentBlocks = getMergedContentBlocks(row.directory, row.template)
  const domainMatches = buildDomainMatch(contentBlocks, businessEmail)

  const claimValues = {
    siteId: row.directory.siteId,
    directoryId: row.directory.id,
    userId: user.id,
    status: 'pending_email' as const,
    businessEmail,
    businessEmailVerifiedAt: null,
    verificationTokenHash: hashToken(token),
    verificationTokenExpiresAt: expiresAt,
    claimantName,
    roleTitle,
    phone,
    message,
    proofUrl,
    domainMatches,
    reviewedByUserId: null,
    reviewedAt: null,
    reviewNote: null,
    updatedAt: now,
  }

  if (existingClaim && MUTABLE_CLAIM_STATUSES.includes(existingClaim.status as DirectoryClaimStatus)) {
    await db
      .update(directoryClaims)
      .set(claimValues)
      .where(eq(directoryClaims.id, existingClaim.id))
  } else {
    await db
      .insert(directoryClaims)
      .values({
        ...claimValues,
        createdAt: now,
      })
  }

  try {
    await sendClaimVerificationEmail({
      site: row.site,
      directory: row.directory,
      businessEmail,
      token,
    })
  } catch (error) {
    console.error('Failed to send directory claim verification email:', error)
    return {
      success: false,
      status: 'pending_email',
      error: 'Claim saved, but the verification email could not be sent. Try again after email is configured.',
    }
  }

  return {
    success: true,
    status: 'pending_email',
    message: 'Check your business email to confirm this claim.',
  }
}

export async function getDirectoryClaimListActionImpl(siteId: string, status?: DirectoryClaimStatus): Promise<{
  data: DirectoryClaimListItem[]
  counts: Record<DirectoryClaimStatus, number>
  error: string | null
}> {
  const emptyCounts = {
    pending_email: 0,
    pending_review: 0,
    approved: 0,
    rejected: 0,
    revoked: 0,
  }

  if (!UUID_REGEX.test(siteId)) {
    return { data: [], counts: emptyCounts, error: 'Invalid site ID' }
  }
  if (status && !CLAIM_STATUSES.includes(status)) {
    return { data: [], counts: emptyCounts, error: 'Invalid claim status' }
  }

  const user = await getAuthenticatedUser()
  if (!user) return { data: [], counts: emptyCounts, error: 'Authentication required' }
  if (user.role !== 'super_admin') {
    return { data: [], counts: emptyCounts, error: 'Access denied' }
  }

  const [countRows, rows] = await Promise.all([
    db
      .select({ status: directoryClaims.status, count: sql<number>`count(*)::int` })
      .from(directoryClaims)
      .where(eq(directoryClaims.siteId, siteId))
      .groupBy(directoryClaims.status),
    db
      .select({
        id: directoryClaims.id,
        siteId: directoryClaims.siteId,
        directoryId: directoryClaims.directoryId,
        userId: directoryClaims.userId,
        status: directoryClaims.status,
        businessEmail: directoryClaims.businessEmail,
        businessEmailVerifiedAt: directoryClaims.businessEmailVerifiedAt,
        claimantName: directoryClaims.claimantName,
        roleTitle: directoryClaims.roleTitle,
        phone: directoryClaims.phone,
        message: directoryClaims.message,
        proofUrl: directoryClaims.proofUrl,
        domainMatches: directoryClaims.domainMatches,
        reviewedAt: directoryClaims.reviewedAt,
        reviewNote: directoryClaims.reviewNote,
        createdAt: directoryClaims.createdAt,
        directoryTitle: directories.title,
        directorySlug: directories.slug,
        accountEmail: authUsers.email,
        accountName: authUsers.name,
        displayName: authUsers.displayName,
      })
      .from(directoryClaims)
      .innerJoin(directories, eq(directories.id, directoryClaims.directoryId))
      .innerJoin(authUsers, eq(authUsers.id, directoryClaims.userId))
      .where(status
        ? and(eq(directoryClaims.siteId, siteId), eq(directoryClaims.status, status))
        : eq(directoryClaims.siteId, siteId)
      )
      .orderBy(desc(directoryClaims.createdAt))
      .limit(100),
  ])

  const counts = { ...emptyCounts }
  for (const row of countRows) {
    counts[row.status as DirectoryClaimStatus] = row.count
  }

  return { data: rows.map(rowToClaimListItem), counts, error: null }
}

export async function reviewDirectoryClaimActionImpl(input: {
  claimId: string
  status: 'approved' | 'rejected' | 'revoked'
  note?: string
}): Promise<{ success: boolean; error: string | null }> {
  if (!UUID_REGEX.test(input.claimId)) return { success: false, error: 'Invalid claim ID' }
  if (input.status !== 'approved' && input.status !== 'rejected' && input.status !== 'revoked') {
    return { success: false, error: 'Invalid claim status' }
  }

  const user = await getAuthenticatedUser()
  if (!user) return { success: false, error: 'Authentication required' }

  const [row] = await db
    .select({
      claim: directoryClaims,
    })
    .from(directoryClaims)
    .where(eq(directoryClaims.id, input.claimId))
    .limit(1)

  if (!row || user.role !== 'super_admin') {
    return { success: false, error: 'Access denied' }
  }

  if (input.status === 'approved' && !row.claim.businessEmailVerifiedAt) {
    return { success: false, error: 'Business email must be confirmed before approval' }
  }

  const now = new Date()
  if (input.status === 'approved') {
    await ensureOwnerListingsAccountPage(row.claim.siteId)
  }

  await db.transaction(async (tx) => {
    if (input.status === 'approved') {
      await tx
        .update(directoryClaims)
        .set({
          status: 'revoked',
          reviewedByUserId: user.id,
          reviewedAt: now,
          reviewNote: 'Revoked by another approved claim.',
          updatedAt: now,
        })
        .where(and(
          eq(directoryClaims.directoryId, row.claim.directoryId),
          eq(directoryClaims.status, 'approved'),
          ne(directoryClaims.id, row.claim.id)
        ))
    }

    await tx
      .update(directoryClaims)
      .set({
        status: input.status,
        verificationTokenHash: null,
        verificationTokenExpiresAt: null,
        reviewedByUserId: user.id,
        reviewedAt: now,
        reviewNote: sanitizeOptionalText(input.note, 1000),
        updatedAt: now,
      })
      .where(eq(directoryClaims.id, row.claim.id))
  })

  if (input.status === 'approved') {
    await upsertSiteMembership({
      siteId: row.claim.siteId,
      userId: row.claim.userId,
      role: 'member',
      status: 'active',
      lastEngagedAt: now,
    })
  }

  revalidateTag('directory')
  revalidateTag(`directory-${row.claim.directoryId}`)
  revalidateTag(`site-${row.claim.siteId}`)

  return { success: true, error: null }
}

export async function getMyClaimedDirectoriesActionImpl(siteId: string): Promise<{
  data: ClaimedDirectoryEditorItem[]
  customBlockTemplates: DirectoryCustomBlockTemplate[]
  categories: ClaimedDirectoryCategory[]
  error: string | null
}> {
  if (!UUID_REGEX.test(siteId)) return { data: [], customBlockTemplates: [], categories: [], error: 'Invalid site ID' }

  const user = await getAuthenticatedUser()
  if (!user) return { data: [], customBlockTemplates: [], categories: [], error: 'Authentication required' }

  const rows = await db
    .select({ claimId: directoryClaims.id, directory: directories, template: directoryTemplates })
    .from(directoryClaims)
    .innerJoin(directories, eq(directories.id, directoryClaims.directoryId))
    .innerJoin(directoryTemplates, eq(directoryTemplates.id, directories.templateId))
    .where(and(
      eq(directoryClaims.siteId, siteId),
      eq(directoryClaims.userId, user.id),
      eq(directoryClaims.status, 'approved'),
      eq(directories.status, 'published')
    ))
    .orderBy(desc(directoryClaims.createdAt))

  if (!rows.length) return { data: [], customBlockTemplates: [], categories: [], error: null }

  const claimIds = rows.map((row) => row.claimId)
  const directoryIds = rows.map((row) => row.directory.id)
  const customTemplateIds = [...new Set(rows.flatMap((row) => getDirectoryCustomTemplateIds(row.template.contentBlocks)))]
  const [pendingRows, relationshipRows, customBlockRows, assignableCategories] = await Promise.all([
    db
      .select()
      .from(directoryOwnerEditRequests)
      .where(and(
        inArray(directoryOwnerEditRequests.claimId, claimIds),
        eq(directoryOwnerEditRequests.status, 'pending')
      )),
    db
      .select({
        directoryId: contentCategoryRelationships.contentId,
        categoryId: contentCategoryRelationships.categoryId,
        isPrimary: contentCategoryRelationships.isPrimary,
      })
      .from(contentCategoryRelationships)
      .where(and(
        inArray(contentCategoryRelationships.contentId, directoryIds),
        eq(contentCategoryRelationships.contentType, 'directory')
      )),
    customTemplateIds.length
      ? db
        .select()
        .from(directoryCustomBlocks)
        .where(and(
          eq(directoryCustomBlocks.siteId, siteId),
          inArray(directoryCustomBlocks.id, customTemplateIds)
        ))
        .orderBy(desc(directoryCustomBlocks.updatedAt))
      : Promise.resolve([]),
    getOwnerAssignableCategories(siteId),
  ])

  const pendingByClaimId = new Map(pendingRows.map((row) => [row.claimId, row]))
  const categoryById = new Map(assignableCategories.map((category) => [category.id, category]))
  const relationshipsByDirectoryId = new Map<string, typeof relationshipRows>()
  relationshipRows.forEach((relationship) => {
    const current = relationshipsByDirectoryId.get(relationship.directoryId) || []
    current.push(relationship)
    relationshipsByDirectoryId.set(relationship.directoryId, current)
  })

  return {
    customBlockTemplates: customBlockRows.map(serializeCustomBlockTemplate),
    categories: assignableCategories,
    data: rows.map(({ claimId, directory, template }) => {
      const pending = pendingByClaimId.get(claimId)
      const listingValues = pending ? getListingValues(pending.listingValues) : null
      const valueBlocks = pending ? getObjectBlocks(pending.contentBlocks) : getObjectBlocks(directory.contentBlocks)
      const contentBlocks = mergeDirectoryTemplateBlocks(getObjectBlocks(template.contentBlocks), valueBlocks)
      const liveRelationships = relationshipsByDirectoryId.get(directory.id) || []
      const pendingCategoryIds = pending ? getStringArray(pending.categoryIds) : null
      const categoryIds = pendingCategoryIds || liveRelationships.map((relationship) => relationship.categoryId)
      const primaryCategoryId = pending
        ? pending.primaryCategoryId
        : liveRelationships.find((relationship) => relationship.isPrimary)?.categoryId || liveRelationships[0]?.categoryId || null

      return {
        id: directory.id,
        claim_id: claimId,
        title: listingValues?.title || directory.title,
        slug: listingValues?.slug || directory.slug,
        featured_image: listingValues?.featured_image ?? directory.featuredImage,
        meta_description: listingValues?.meta_description ?? directory.metaDescription,
        content_blocks: contentBlocks,
        categories: categoryIds.map((id) => categoryById.get(id)).filter((category): category is ClaimedDirectoryCategory => !!category),
        primary_category_id: primaryCategoryId,
        pending_edit: pending
          ? {
              id: pending.id,
              status: pending.status as DirectoryOwnerEditRequestStatus,
              review_note: pending.reviewNote,
              updated_at: pending.updatedAt.toISOString(),
            }
          : null,
      }
    }),
    error: null,
  }
}

export async function submitMyClaimedDirectoryEditRequestActionImpl(input: {
  siteId: string
  directoryId: string
  title: string
  slug?: string
  featuredImage?: string | null
  metaDescription?: string | null
  contentBlocks: Record<string, any>
  categoryIds?: unknown[]
  primaryCategoryId?: string | null
}): Promise<{ success: boolean; error: string | null; message?: string }> {
  if (!UUID_REGEX.test(input.siteId) || !UUID_REGEX.test(input.directoryId)) {
    return { success: false, error: 'Invalid listing ID' }
  }

  const user = await getAuthenticatedUser()
  if (!user) return { success: false, error: 'Authentication required' }

  const [row] = await db
    .select({ directory: directories, template: directoryTemplates, claim: directoryClaims })
    .from(directoryClaims)
    .innerJoin(directories, eq(directories.id, directoryClaims.directoryId))
    .innerJoin(directoryTemplates, eq(directoryTemplates.id, directories.templateId))
    .where(and(
      eq(directoryClaims.siteId, input.siteId),
      eq(directoryClaims.directoryId, input.directoryId),
      eq(directoryClaims.userId, user.id),
      eq(directoryClaims.status, 'approved'),
      eq(directories.status, 'published')
    ))
    .limit(1)

  if (!row) return { success: false, error: 'Approved claim required' }

  const title = sanitizeText(input.title, 255)
  const featuredImage = sanitizeOptionalUrl(input.featuredImage)
  const metaDescription = sanitizeOptionalText(input.metaDescription, 500)
  if (!title) return { success: false, error: 'Listing title is required' }
  if (input.featuredImage && !featuredImage) return { success: false, error: 'Enter a valid image URL' }

  const slugResult = await validateDirectoryOwnerSlug(row.directory.siteId, row.directory.id, input.slug, title)
  if (slugResult.error || !slugResult.slug) return { success: false, error: slugResult.error || 'Invalid slug' }

  const categoryResult = await validateOwnerDirectoryCategories(row.directory.siteId, input.categoryIds || [], input.primaryCategoryId)
  if (categoryResult.error) return { success: false, error: categoryResult.error }

  const contentBlocks = getObjectBlocks(input.contentBlocks)
  const contentBlocksJson = JSON.stringify(contentBlocks)
  if (contentBlocksJson.length > 250_000) return { success: false, error: 'Listing content is too large' }

  const valueBlocks = pruneDirectoryValueBlocksForTemplate(
    contentBlocks,
    getObjectBlocks(row.template.contentBlocks)
  )
  const now = new Date()
  const [existingPending] = await db
    .select({ id: directoryOwnerEditRequests.id })
    .from(directoryOwnerEditRequests)
    .where(and(
      eq(directoryOwnerEditRequests.claimId, row.claim.id),
      eq(directoryOwnerEditRequests.status, 'pending')
    ))
    .limit(1)

  const requestValues = {
    siteId: row.directory.siteId,
    directoryId: row.directory.id,
    claimId: row.claim.id,
    submittedByUserId: user.id,
    listingValues: {
      title,
      slug: slugResult.slug,
      featured_image: featuredImage,
      meta_description: metaDescription,
    },
    contentBlocks: valueBlocks,
    categoryIds: categoryResult.categoryIds,
    primaryCategoryId: categoryResult.primaryCategoryId,
    reviewedByUserId: null,
    reviewedAt: null,
    reviewNote: null,
    updatedAt: now,
  }

  const [requestRow] = existingPending
    ? await db
      .update(directoryOwnerEditRequests)
      .set(requestValues)
      .where(eq(directoryOwnerEditRequests.id, existingPending.id))
      .returning({ id: directoryOwnerEditRequests.id })
    : await db
      .insert(directoryOwnerEditRequests)
      .values({
        ...requestValues,
        status: 'pending',
        createdAt: now,
      })
      .returning({ id: directoryOwnerEditRequests.id })

  await createHubNotificationForSuperAdmins({
    type: 'directory_owner_edit',
    siteId: row.directory.siteId,
    sourceId: requestRow.id,
    title: 'Directory owner edit ready for review',
    message: `${user.email || 'A listing owner'} submitted edits for ${row.directory.title}.`,
    targetHref: '/admin/directory/claims',
    metadata: {
      directory_id: row.directory.id,
      directory_slug: row.directory.slug,
      claim_id: row.claim.id,
    },
  })

  return { success: true, error: null, message: 'Changes submitted for review.' }
}

export async function getDirectoryOwnerEditRequestListActionImpl(siteId: string, status?: DirectoryOwnerEditRequestStatus): Promise<{
  data: DirectoryOwnerEditRequestListItem[]
  counts: Record<DirectoryOwnerEditRequestStatus, number>
  error: string | null
}> {
  const emptyCounts = { pending: 0, approved: 0, rejected: 0 }

  if (!UUID_REGEX.test(siteId)) return { data: [], counts: emptyCounts, error: 'Invalid site ID' }
  if (status && !OWNER_EDIT_STATUSES.includes(status)) {
    return { data: [], counts: emptyCounts, error: 'Invalid owner edit status' }
  }

  const user = await getAuthenticatedUser()
  if (!user) return { data: [], counts: emptyCounts, error: 'Authentication required' }
  if (user.role !== 'super_admin') return { data: [], counts: emptyCounts, error: 'Access denied' }

  const [countRows, rows] = await Promise.all([
    db
      .select({ status: directoryOwnerEditRequests.status, count: sql<number>`count(*)::int` })
      .from(directoryOwnerEditRequests)
      .where(eq(directoryOwnerEditRequests.siteId, siteId))
      .groupBy(directoryOwnerEditRequests.status),
    db
      .select({
        id: directoryOwnerEditRequests.id,
        siteId: directoryOwnerEditRequests.siteId,
        directoryId: directoryOwnerEditRequests.directoryId,
        status: directoryOwnerEditRequests.status,
        listingValues: directoryOwnerEditRequests.listingValues,
        contentBlocks: directoryOwnerEditRequests.contentBlocks,
        categoryIds: directoryOwnerEditRequests.categoryIds,
        primaryCategoryId: directoryOwnerEditRequests.primaryCategoryId,
        reviewedAt: directoryOwnerEditRequests.reviewedAt,
        reviewNote: directoryOwnerEditRequests.reviewNote,
        createdAt: directoryOwnerEditRequests.createdAt,
        updatedAt: directoryOwnerEditRequests.updatedAt,
        directoryTitle: directories.title,
        directorySlug: directories.slug,
        accountEmail: authUsers.email,
        accountName: authUsers.name,
        displayName: authUsers.displayName,
      })
      .from(directoryOwnerEditRequests)
      .innerJoin(directories, eq(directories.id, directoryOwnerEditRequests.directoryId))
      .innerJoin(authUsers, eq(authUsers.id, directoryOwnerEditRequests.submittedByUserId))
      .where(status
        ? and(eq(directoryOwnerEditRequests.siteId, siteId), eq(directoryOwnerEditRequests.status, status))
        : eq(directoryOwnerEditRequests.siteId, siteId)
      )
      .orderBy(desc(directoryOwnerEditRequests.createdAt))
      .limit(100),
  ])

  const counts = { ...emptyCounts }
  countRows.forEach((row) => {
    counts[row.status as DirectoryOwnerEditRequestStatus] = row.count
  })

  return { data: rows.map(rowToOwnerEditRequestListItem), counts, error: null }
}

export async function reviewDirectoryOwnerEditRequestActionImpl(input: {
  requestId: string
  status: 'approved' | 'rejected'
  note?: string
}): Promise<{ success: boolean; error: string | null }> {
  if (!UUID_REGEX.test(input.requestId)) return { success: false, error: 'Invalid request ID' }
  if (input.status !== 'approved' && input.status !== 'rejected') {
    return { success: false, error: 'Invalid review status' }
  }

  const user = await getAuthenticatedUser()
  if (!user) return { success: false, error: 'Authentication required' }
  if (user.role !== 'super_admin') return { success: false, error: 'Access denied' }

  const [row] = await db
    .select({
      request: directoryOwnerEditRequests,
      directory: directories,
      template: directoryTemplates,
      claim: directoryClaims,
    })
    .from(directoryOwnerEditRequests)
    .innerJoin(directories, eq(directories.id, directoryOwnerEditRequests.directoryId))
    .innerJoin(directoryTemplates, eq(directoryTemplates.id, directories.templateId))
    .innerJoin(directoryClaims, eq(directoryClaims.id, directoryOwnerEditRequests.claimId))
    .where(eq(directoryOwnerEditRequests.id, input.requestId))
    .limit(1)

  if (!row) return { success: false, error: 'Owner edit request not found' }
  if (row.request.status !== 'pending') return { success: false, error: 'Owner edit request has already been reviewed' }
  if (row.claim.status !== 'approved') return { success: false, error: 'Approved claim required' }

  const now = new Date()
  const reviewNote = sanitizeOptionalText(input.note, 1000)

  if (input.status === 'rejected') {
    await db
      .update(directoryOwnerEditRequests)
      .set({
        status: 'rejected',
        reviewedByUserId: user.id,
        reviewedAt: now,
        reviewNote,
        updatedAt: now,
      })
      .where(eq(directoryOwnerEditRequests.id, input.requestId))

    return { success: true, error: null }
  }

  const listingValues = getListingValues(row.request.listingValues)
  const title = sanitizeText(listingValues.title, 255)
  const featuredImage = sanitizeOptionalUrl(listingValues.featured_image)
  const metaDescription = sanitizeOptionalText(listingValues.meta_description, 500)
  if (!title) return { success: false, error: 'Listing title is required' }
  if (listingValues.featured_image && !featuredImage) return { success: false, error: 'Enter a valid image URL' }

  const slugResult = await validateDirectoryOwnerSlug(row.directory.siteId, row.directory.id, listingValues.slug, title)
  if (slugResult.error || !slugResult.slug) return { success: false, error: slugResult.error || 'Invalid slug' }

  const categoryResult = await validateOwnerDirectoryCategories(row.directory.siteId, row.request.categoryIds, row.request.primaryCategoryId)
  if (categoryResult.error) return { success: false, error: categoryResult.error }

  const valueBlocks = pruneDirectoryValueBlocksForTemplate(
    getObjectBlocks(row.request.contentBlocks),
    getObjectBlocks(row.template.contentBlocks)
  )

  // Geocode outside the transaction (network call); best-effort like builder saves.
  const coordinateUpdates = await resolveDirectoryCoordinateUpdates({
    siteId: row.directory.siteId,
    current: {
      latitude: row.directory.latitude,
      longitude: row.directory.longitude,
      geocodedAddress: row.directory.geocodedAddress,
    },
    contentBlocks: valueBlocks,
  })

  await db.transaction(async (tx) => {
    await tx
      .update(directories)
      .set({
        ...coordinateUpdates,
        title,
        slug: slugResult.slug,
        featuredImage,
        metaDescription,
        contentBlocks: valueBlocks,
        updatedAt: now,
      })
      .where(eq(directories.id, row.directory.id))

    await tx
      .delete(contentCategoryRelationships)
      .where(and(
        eq(contentCategoryRelationships.contentId, row.directory.id),
        eq(contentCategoryRelationships.contentType, 'directory')
      ))

    if (categoryResult.categoryIds.length > 0) {
      await tx.insert(contentCategoryRelationships).values(categoryResult.categoryIds.map((categoryId) => ({
        contentId: row.directory.id,
        contentType: 'directory',
        categoryId,
        isPrimary: categoryId === categoryResult.primaryCategoryId,
      })))
    }

    await tx
      .update(directoryOwnerEditRequests)
      .set({
        status: 'approved',
        reviewedByUserId: user.id,
        reviewedAt: now,
        reviewNote,
        updatedAt: now,
      })
      .where(eq(directoryOwnerEditRequests.id, input.requestId))
  })

  revalidateTag('directory')
  revalidateTag('listing-views')
  revalidateTag('content-categories')
  revalidateTag(`directory-${row.directory.id}`)
  revalidateTag(`site-${row.directory.siteId}`)

  return { success: true, error: null }
}
