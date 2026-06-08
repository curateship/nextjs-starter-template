'use server'

import { createHash, randomBytes } from 'crypto'
import { revalidateTag } from 'next/cache'
import { and, desc, eq, ne, sql } from 'drizzle-orm'

import { getEmailProvider } from '@/lib/actions/email/provider'
import { getEmailConfig } from '@/lib/actions/integrations/config-helpers'
import { getPublicAuthPagePath } from '@/lib/actions/pages/page-frontend-actions'
import { createHubNotificationForSuperAdmins } from '@/lib/actions/notifications/notification-service'
import { db } from '@/lib/db'
import { getAuthenticatedUser } from '@/lib/db/helpers'
import { authUsers, directories, directoryClaims, directoryTemplates, sites } from '@/lib/db/schema'
import {
  buildDirectoryCoreMenuHref,
  DIRECTORY_CORE_BLOCK_TYPE,
  normalizeDirectoryCoreContent,
  normalizeDirectoryCoreMenuLink,
  normalizeDirectoryCoreSocialLink,
} from '@/lib/actions/directories/directory-core'
import { DIRECTORY_GOOGLE_MAP_BLOCK_TYPE } from '@/lib/actions/directories/directory-google-map'
import { DIRECTORY_OPENING_HOURS_BLOCK_TYPE } from '@/lib/actions/directories/directory-opening-hours'
import {
  mergeDirectoryTemplateBlocks,
  pruneDirectoryValueBlocksForTemplate,
} from '@/lib/actions/directories/directory-template-inheritance'
import { upsertSiteMembership } from '@/lib/utils/site-membership-runtime'
import { getSiteUrl } from '@/lib/utils/site-url-generator'

export type DirectoryClaimStatus = 'pending_email' | 'pending_review' | 'approved' | 'rejected' | 'revoked'

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
  title: string
  slug: string
  featured_image: string | null
  meta_description: string | null
  core: Record<string, any>
  google_map: Record<string, any> | null
  opening_hours: Record<string, any> | null
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CLAIM_EMAIL_EXPIRES_MS = 48 * 60 * 60 * 1000
const CLAIM_EMAIL_RESEND_COOLDOWN_MS = 10 * 60 * 1000
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const CLAIM_STATUSES: DirectoryClaimStatus[] = ['pending_email', 'pending_review', 'approved', 'rejected', 'revoked']
const MUTABLE_CLAIM_STATUSES: DirectoryClaimStatus[] = ['pending_email', 'rejected', 'revoked']

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

function getMergedContentBlocks(directory: { contentBlocks: unknown }, template: { contentBlocks: unknown }) {
  return mergeDirectoryTemplateBlocks(
    getObjectBlocks(template.contentBlocks),
    getObjectBlocks(directory.contentBlocks)
  )
}

function getCoreBlockEntry(contentBlocks: Record<string, any>) {
  return Object.entries(contentBlocks).find(([, block]) => block?.type === DIRECTORY_CORE_BLOCK_TYPE) || null
}

function getBlockEntry(contentBlocks: Record<string, any>, blockType: string) {
  return Object.entries(contentBlocks).find(([, block]) => block?.type === blockType) || null
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

export async function getDirectoryClaimStateAction(directoryId: string): Promise<{
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

export async function submitDirectoryClaimAction(input: {
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

export async function getDirectoryClaimListAction(siteId: string, status?: DirectoryClaimStatus): Promise<{
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

export async function reviewDirectoryClaimAction(input: {
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

export async function verifyDirectoryClaimEmailToken(token: string): Promise<{
  success: boolean
  directorySlug?: string
  error?: string
}> {
  const tokenValue = typeof token === 'string' ? token.trim() : ''
  if (!tokenValue) return { success: false, error: 'Invalid verification link' }

  const tokenHash = hashToken(tokenValue)
  const [row] = await db
    .select({
      claim: directoryClaims,
      directorySlug: directories.slug,
      directoryTitle: directories.title,
    })
    .from(directoryClaims)
    .innerJoin(directories, eq(directories.id, directoryClaims.directoryId))
    .where(and(
      eq(directoryClaims.verificationTokenHash, tokenHash),
      eq(directoryClaims.status, 'pending_email')
    ))
    .limit(1)

  if (!row || !row.claim.verificationTokenExpiresAt || row.claim.verificationTokenExpiresAt < new Date()) {
    return { success: false, error: 'This verification link is invalid or expired' }
  }

  await db
    .update(directoryClaims)
    .set({
      status: 'pending_review',
      businessEmailVerifiedAt: new Date(),
      verificationTokenHash: null,
      verificationTokenExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(eq(directoryClaims.id, row.claim.id))

  await createHubNotificationForSuperAdmins({
    type: 'directory_claim',
    siteId: row.claim.siteId,
    sourceId: row.claim.id,
    title: 'Directory claim ready for review',
    message: `${row.claim.businessEmail} verified a claim for ${row.directoryTitle}.`,
    targetHref: '/admin/directory/claims',
    metadata: {
      directory_id: row.claim.directoryId,
      directory_slug: row.directorySlug,
    },
  })

  return { success: true, directorySlug: row.directorySlug }
}

export async function getMyClaimedDirectoriesAction(siteId: string): Promise<{
  data: ClaimedDirectoryEditorItem[]
  error: string | null
}> {
  if (!UUID_REGEX.test(siteId)) return { data: [], error: 'Invalid site ID' }

  const user = await getAuthenticatedUser()
  if (!user) return { data: [], error: 'Authentication required' }

  const rows = await db
    .select({ directory: directories, template: directoryTemplates })
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

  return {
    data: rows.map(({ directory, template }) => {
      const contentBlocks = getMergedContentBlocks(directory, template)
      const coreEntry = getCoreBlockEntry(contentBlocks)
      const googleMapEntry = getBlockEntry(contentBlocks, DIRECTORY_GOOGLE_MAP_BLOCK_TYPE)
      const openingHoursEntry = getBlockEntry(contentBlocks, DIRECTORY_OPENING_HOURS_BLOCK_TYPE)

      return {
        id: directory.id,
        title: directory.title,
        slug: directory.slug,
        featured_image: directory.featuredImage,
        meta_description: directory.metaDescription,
        core: normalizeDirectoryCoreContent(coreEntry?.[1]?.content || {}),
        google_map: googleMapEntry?.[1]?.content || null,
        opening_hours: openingHoursEntry?.[1]?.content || null,
      }
    }),
    error: null,
  }
}

export async function updateMyClaimedDirectoryAction(input: {
  siteId: string
  directoryId: string
  title: string
  featuredImage?: string | null
  metaDescription?: string | null
  socialLinks?: unknown[]
  menuLinks?: unknown[]
  googleMap?: { locationQuery?: string; caption?: string } | null
  openingHours?: { title?: string; placeId?: string } | null
}): Promise<{ success: boolean; error: string | null }> {
  if (!UUID_REGEX.test(input.siteId) || !UUID_REGEX.test(input.directoryId)) {
    return { success: false, error: 'Invalid listing ID' }
  }

  const user = await getAuthenticatedUser()
  if (!user) return { success: false, error: 'Authentication required' }

  const [row] = await db
    .select({ directory: directories, template: directoryTemplates, claimId: directoryClaims.id })
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

  const contentBlocks = getMergedContentBlocks(row.directory, row.template)
  const coreEntry = getCoreBlockEntry(contentBlocks)
  const nextContentBlocks = { ...contentBlocks }

  if (coreEntry) {
    const [coreId, coreBlock] = coreEntry
    const currentCore = normalizeDirectoryCoreContent(coreBlock.content || {})
    nextContentBlocks[coreId] = {
      ...coreBlock,
      content: {
        ...currentCore,
        socialLinks: Array.isArray(input.socialLinks)
          ? input.socialLinks.map(normalizeDirectoryCoreSocialLink).filter(Boolean)
          : [],
        menuLinks: Array.isArray(input.menuLinks)
          ? input.menuLinks.map(normalizeDirectoryCoreMenuLink).filter(Boolean)
          : [],
      },
    }
  }

  const googleMapEntry = getBlockEntry(nextContentBlocks, DIRECTORY_GOOGLE_MAP_BLOCK_TYPE)
  if (googleMapEntry && input.googleMap) {
    const [blockId, block] = googleMapEntry
    nextContentBlocks[blockId] = {
      ...block,
      content: {
        ...(block.content || {}),
        locationQuery: sanitizeText(input.googleMap.locationQuery, 300),
        caption: sanitizeOptionalText(input.googleMap.caption, 200) || '',
      },
    }
  }

  const openingHoursEntry = getBlockEntry(nextContentBlocks, DIRECTORY_OPENING_HOURS_BLOCK_TYPE)
  if (openingHoursEntry && input.openingHours) {
    const [blockId, block] = openingHoursEntry
    nextContentBlocks[blockId] = {
      ...block,
      content: {
        ...(block.content || {}),
        title: sanitizeText(input.openingHours.title, 120) || 'Business Hours',
        placeId: sanitizeText(input.openingHours.placeId, 255),
      },
    }
  }

  await db
    .update(directories)
    .set({
      title,
      featuredImage,
      metaDescription,
      contentBlocks: pruneDirectoryValueBlocksForTemplate(
        nextContentBlocks,
        getObjectBlocks(row.template.contentBlocks)
      ),
      updatedAt: new Date(),
    })
    .where(eq(directories.id, input.directoryId))

  revalidateTag('directory')
  revalidateTag(`directory-${input.directoryId}`)
  revalidateTag(`site-${input.siteId}`)

  return { success: true, error: null }
}
