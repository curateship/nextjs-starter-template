import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm'

import { db } from '@/lib/db'
import { getAuthenticatedUser } from '@/lib/db/helpers'
import {
  directories,
  directoryClaimOutreach,
  directoryClaimOutreachOptouts,
  directoryClaims,
  sites,
} from '@/lib/db/schema'
import { getEmailConfig } from '@/lib/actions/integrations/config-helpers'
import { getEmailProvider } from '@/lib/actions/email/provider'
import { getSiteUrl } from '@/lib/utils/site-url-generator'
import { generateUnsubscribeToken } from '@/lib/utils/unsubscribe-token'
import { UUID_REGEX } from '@/lib/utils/validation'
import { CLAIM_OUTREACH_COOLDOWN_DAYS, resolveDirectoryContactEmail } from './directory-claim-outreach-email'

// How many published listings we scan for a contact email when building the
// outreach list. Bounds the work for very large directories; the newest
// listings are scanned first.
const OUTREACH_LISTING_SCAN_LIMIT = 1000
// Most invitations one Send click will process. Sequential sends past this would
// keep the request open too long, so the rest are reported back as skipped and
// the admin sends them in another click (the same throttle idea as the
// newsletter cron's fixed batch size).
const OUTREACH_SEND_BATCH_LIMIT = 50
const COOLDOWN_MS = CLAIM_OUTREACH_COOLDOWN_DAYS * 24 * 60 * 60 * 1000

// 'not_invited'      never invited
// 'invited'          invited before, past the cooldown (may be invited again)
// 'recently_invited' invited within the cooldown (send is skipped)
// 'opted_out'        the contact email unsubscribed (send is skipped)
export type ClaimOutreachStatus = 'not_invited' | 'invited' | 'recently_invited' | 'opted_out'

export interface ClaimOutreachListItem {
  directory_id: string
  title: string
  slug: string
  contact_email: string
  status: ClaimOutreachStatus
  last_invited_at: string | null
  times_invited: number
  last_send_failed: boolean
}

export interface ClaimOutreachListResult {
  data: ClaimOutreachListItem[]
  email_configured: boolean
  cooldown_days: number
  scanned_at_limit: boolean
  error: string | null
}

export type ClaimOutreachSendOutcomeKind = 'sent' | 'skipped' | 'failed'
// Skip/fail reasons, mapped to friendly text in the admin UI.
export type ClaimOutreachSendReason =
  | 'not_found'
  | 'not_published'
  | 'no_email'
  | 'already_claimed'
  | 'opted_out'
  | 'recently_invited'
  | 'batch_limit'
  | 'send_failed'

export interface ClaimOutreachSendOutcome {
  directory_id: string
  outcome: ClaimOutreachSendOutcomeKind
  reason?: ClaimOutreachSendReason
}

export interface ClaimOutreachSendResult {
  success: boolean
  error: string | null
  sent: number
  skipped: number
  failed: number
  cooldown_days: number
  outcomes: ClaimOutreachSendOutcome[]
}

function isEmailConfigured(config: Awaited<ReturnType<typeof getEmailConfig>>) {
  const apiKey = config?.apiKey || process.env.RESEND_API_KEY
  const fromEmail = config?.fromEmail || process.env.AUTH_FROM_EMAIL || process.env.RESEND_FROM_EMAIL
  return Boolean(apiKey && fromEmail)
}

// Per-site Resend sender, falling back to the platform env keys. A per-site
// sender keeps unsolicited claim outreach off the shared platform reputation.
async function getOutreachSender(site: { id: string; name: string }) {
  let config: Awaited<ReturnType<typeof getEmailConfig>> = null
  try {
    config = await getEmailConfig(site.id)
  } catch (error) {
    console.error('Failed to read site email config:', error)
  }

  const apiKey = config?.apiKey || process.env.RESEND_API_KEY
  const fromEmail = config?.fromEmail || process.env.AUTH_FROM_EMAIL || process.env.RESEND_FROM_EMAIL
  const fromName = config?.fromName || site.name

  if (!apiKey || !fromEmail) {
    throw new Error('Email sending is not configured for this site')
  }

  const provider = getEmailProvider(apiKey, config?.providerType || 'resend')
  return { provider, from: fromName ? `${fromName} <${fromEmail}>` : fromEmail }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function buildInvitationEmailHtml(input: {
  businessName: string
  siteName: string
  claimUrl: string
  unsubscribeUrl: string
}) {
  const business = escapeHtml(input.businessName)
  const site = escapeHtml(input.siteName)
  const claimUrl = escapeHtml(input.claimUrl)
  const unsubscribeUrl = escapeHtml(input.unsubscribeUrl)

  return `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111;">
      <p style="font-size:15px;line-height:1.5;">Hi,</p>
      <p style="font-size:15px;line-height:1.5;"><strong>${business}</strong> is listed on ${site}, but no one has claimed it yet.</p>
      <p style="font-size:15px;line-height:1.5;">Claiming the listing lets you keep its details accurate and unlock owner tools. It only takes a minute.</p>
      <p style="margin:28px 0;">
        <a href="${claimUrl}" style="background:#111;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;display:inline-block;font-size:15px;">Claim ${business}</a>
      </p>
      <p style="font-size:13px;line-height:1.5;color:#666;">If the button doesn't work, copy and paste this link:<br><a href="${claimUrl}" style="color:#666;">${claimUrl}</a></p>
      <p style="font-size:12px;line-height:1.5;color:#999;margin-top:32px;border-top:1px solid #eee;padding-top:16px;">
        You received this because ${business} is listed on ${site}.
        <a href="${unsubscribeUrl}" style="color:#999;">Don't email me about this listing</a>.
      </p>
    </div>
  `
}

/**
 * Published listings on this site that have no approved claim and carry a
 * business contact email — the candidates for a claim invitation, each with its
 * outreach status (never invited, invited, recently invited, or opted out).
 */
export async function getDirectoryClaimOutreachListActionImpl(siteId: string): Promise<ClaimOutreachListResult> {
  const base: ClaimOutreachListResult = {
    data: [],
    email_configured: false,
    cooldown_days: CLAIM_OUTREACH_COOLDOWN_DAYS,
    scanned_at_limit: false,
    error: null,
  }

  if (!UUID_REGEX.test(siteId)) return { ...base, error: 'Invalid site ID' }

  const user = await getAuthenticatedUser()
  if (!user) return { ...base, error: 'Authentication required' }
  if (user.role !== 'super_admin') return { ...base, error: 'Access denied' }

  try {
    return await buildOutreachList(siteId, base)
  } catch (error) {
    console.error('Failed to load claim outreach list:', error)
    return { ...base, error: 'Could not load listings. Please try again.' }
  }
}

async function buildOutreachList(siteId: string, base: ClaimOutreachListResult): Promise<ClaimOutreachListResult> {
  const emailConfigured = isEmailConfigured(await getEmailConfig(siteId).catch(() => null))

  // Published listings with no approved claim, newest first. The contact email
  // lives in the Core block content, so we resolve it in JS after fetching.
  const rows = await db
    .select({
      id: directories.id,
      title: directories.title,
      slug: directories.slug,
      contentBlocks: directories.contentBlocks,
    })
    .from(directories)
    .where(and(
      eq(directories.siteId, siteId),
      eq(directories.status, 'published'),
      sql`not exists (
        select 1 from directory_claims dc
        where dc.directory_id = ${directories.id} and dc.status = 'approved'
      )`,
    ))
    .orderBy(desc(directories.createdAt))
    .limit(OUTREACH_LISTING_SCAN_LIMIT + 1)

  const scannedAtLimit = rows.length > OUTREACH_LISTING_SCAN_LIMIT
  const scanned = scannedAtLimit ? rows.slice(0, OUTREACH_LISTING_SCAN_LIMIT) : rows

  const withEmail = scanned
    .map((row) => ({ ...row, email: resolveDirectoryContactEmail(row.contentBlocks) }))
    .filter((row): row is typeof row & { email: string } => Boolean(row.email))

  if (!withEmail.length) {
    return { ...base, email_configured: emailConfigured, scanned_at_limit: scannedAtLimit }
  }

  const directoryIds = withEmail.map((row) => row.id)
  const emails = [...new Set(withEmail.map((row) => row.email))]

  // One aggregate per listing: newest 'sent', how many 'sent', and the newest
  // attempt overall (to flag a most-recent failed send).
  const aggRows = await db
    .select({
      directoryId: directoryClaimOutreach.directoryId,
      lastSentAt: sql<Date | null>`max(${directoryClaimOutreach.createdAt}) filter (where ${directoryClaimOutreach.status} = 'sent')`,
      sentCount: sql<number>`count(*) filter (where ${directoryClaimOutreach.status} = 'sent')`,
      lastCreatedAt: sql<Date>`max(${directoryClaimOutreach.createdAt})`,
    })
    .from(directoryClaimOutreach)
    .where(and(eq(directoryClaimOutreach.siteId, siteId), inArray(directoryClaimOutreach.directoryId, directoryIds)))
    .groupBy(directoryClaimOutreach.directoryId)

  const aggByDir = new Map(aggRows.map((row) => [row.directoryId, row]))

  const optoutRows = await db
    .select({ email: directoryClaimOutreachOptouts.email })
    .from(directoryClaimOutreachOptouts)
    .where(and(eq(directoryClaimOutreachOptouts.siteId, siteId), inArray(directoryClaimOutreachOptouts.email, emails)))
  const optoutSet = new Set(optoutRows.map((row) => row.email))

  const now = Date.now()

  const data: ClaimOutreachListItem[] = withEmail.map((row) => {
    const agg = aggByDir.get(row.id)
    const lastSentAt = agg?.lastSentAt ? new Date(agg.lastSentAt) : null
    const sentCount = agg ? Number(agg.sentCount) : 0
    const lastCreatedAt = agg?.lastCreatedAt ? new Date(agg.lastCreatedAt) : null

    let status: ClaimOutreachStatus
    if (optoutSet.has(row.email)) {
      status = 'opted_out'
    } else if (lastSentAt && now - lastSentAt.getTime() < COOLDOWN_MS) {
      status = 'recently_invited'
    } else if (sentCount > 0) {
      status = 'invited'
    } else {
      status = 'not_invited'
    }

    // Newest attempt is a failure when the latest row postdates the latest 'sent'
    // (or there is an attempt but nothing was ever sent successfully).
    const lastSendFailed = Boolean(
      lastCreatedAt && (!lastSentAt || lastCreatedAt.getTime() > lastSentAt.getTime()),
    )

    return {
      directory_id: row.id,
      title: row.title,
      slug: row.slug,
      contact_email: row.email,
      status,
      last_invited_at: lastSentAt ? lastSentAt.toISOString() : null,
      times_invited: sentCount,
      last_send_failed: lastSendFailed,
    }
  })

  return {
    data,
    email_configured: emailConfigured,
    cooldown_days: CLAIM_OUTREACH_COOLDOWN_DAYS,
    scanned_at_limit: scannedAtLimit,
    error: null,
  }
}

/**
 * Send claim invitations to the selected listings. Each eligible listing gets
 * one personalized email whose link lands in the claim flow for that exact
 * listing, and one log row. Listings that are already claimed, opted out, or
 * invited within the cooldown are skipped (and reported), never re-sent.
 */
export async function sendDirectoryClaimOutreachActionImpl(input: {
  siteId: string
  directoryIds: string[]
}): Promise<ClaimOutreachSendResult> {
  const base: ClaimOutreachSendResult = {
    success: false,
    error: null,
    sent: 0,
    skipped: 0,
    failed: 0,
    cooldown_days: CLAIM_OUTREACH_COOLDOWN_DAYS,
    outcomes: [],
  }

  if (!UUID_REGEX.test(input.siteId)) return { ...base, error: 'Invalid site ID' }

  const requestedIds = Array.isArray(input.directoryIds) ? input.directoryIds : []
  const uniqueIds = [...new Set(requestedIds.filter((id) => typeof id === 'string' && UUID_REGEX.test(id)))]
  if (!uniqueIds.length) return { ...base, error: 'Select at least one listing.' }

  const user = await getAuthenticatedUser()
  if (!user) return { ...base, error: 'Authentication required' }
  if (user.role !== 'super_admin') return { ...base, error: 'Access denied' }

  const [site] = await db
    .select({ id: sites.id, name: sites.name, subdomain: sites.subdomain, customDomain: sites.customDomain })
    .from(sites)
    .where(eq(sites.id, input.siteId))
    .limit(1)
  if (!site) return { ...base, error: 'Site not found' }

  let sender: Awaited<ReturnType<typeof getOutreachSender>>
  try {
    sender = await getOutreachSender(site)
  } catch {
    return { ...base, error: 'Email sending is not configured for this site.' }
  }

  const siteUrl = getSiteUrl({ subdomain: site.subdomain, customDomain: site.customDomain })

  const capped = uniqueIds.slice(0, OUTREACH_SEND_BATCH_LIMIT)
  const overflow = uniqueIds.slice(OUTREACH_SEND_BATCH_LIMIT)

  // Load only the selected listings and the eligibility inputs for them.
  const listingRows = await db
    .select({
      id: directories.id,
      title: directories.title,
      slug: directories.slug,
      status: directories.status,
      contentBlocks: directories.contentBlocks,
    })
    .from(directories)
    .where(and(eq(directories.siteId, input.siteId), inArray(directories.id, capped)))
  const listingById = new Map(listingRows.map((row) => [row.id, row]))

  const claimedRows = await db
    .select({ directoryId: directoryClaims.directoryId })
    .from(directoryClaims)
    .where(and(
      eq(directoryClaims.siteId, input.siteId),
      eq(directoryClaims.status, 'approved'),
      inArray(directoryClaims.directoryId, capped),
    ))
  const claimedSet = new Set(claimedRows.map((row) => row.directoryId))

  const cutoff = new Date(Date.now() - COOLDOWN_MS)
  const recentRows = await db
    .select({ directoryId: directoryClaimOutreach.directoryId })
    .from(directoryClaimOutreach)
    .where(and(
      eq(directoryClaimOutreach.siteId, input.siteId),
      eq(directoryClaimOutreach.status, 'sent'),
      inArray(directoryClaimOutreach.directoryId, capped),
      gte(directoryClaimOutreach.createdAt, cutoff),
    ))
  const cooldownSet = new Set(recentRows.map((row) => row.directoryId))

  // Resolve emails for the selected listings, then look up opt-outs for those.
  const emailByDir = new Map<string, string>()
  for (const row of listingRows) {
    const email = resolveDirectoryContactEmail(row.contentBlocks)
    if (email) emailByDir.set(row.id, email)
  }
  const selectedEmails = [...new Set(emailByDir.values())]
  const optoutSet = new Set<string>()
  if (selectedEmails.length) {
    const optoutRows = await db
      .select({ email: directoryClaimOutreachOptouts.email })
      .from(directoryClaimOutreachOptouts)
      .where(and(
        eq(directoryClaimOutreachOptouts.siteId, input.siteId),
        inArray(directoryClaimOutreachOptouts.email, selectedEmails),
      ))
    for (const row of optoutRows) optoutSet.add(row.email)
  }

  const outcomes: ClaimOutreachSendOutcome[] = []
  let sent = 0
  let failed = 0

  for (const directoryId of capped) {
    const listing = listingById.get(directoryId)
    if (!listing) {
      outcomes.push({ directory_id: directoryId, outcome: 'skipped', reason: 'not_found' })
      continue
    }
    if (listing.status !== 'published') {
      outcomes.push({ directory_id: directoryId, outcome: 'skipped', reason: 'not_published' })
      continue
    }
    const email = emailByDir.get(directoryId)
    if (!email) {
      outcomes.push({ directory_id: directoryId, outcome: 'skipped', reason: 'no_email' })
      continue
    }
    if (claimedSet.has(directoryId)) {
      outcomes.push({ directory_id: directoryId, outcome: 'skipped', reason: 'already_claimed' })
      continue
    }
    if (optoutSet.has(email)) {
      outcomes.push({ directory_id: directoryId, outcome: 'skipped', reason: 'opted_out' })
      continue
    }
    if (cooldownSet.has(directoryId)) {
      outcomes.push({ directory_id: directoryId, outcome: 'skipped', reason: 'recently_invited' })
      continue
    }

    // ?claim=start makes the listing page open the claim flow on arrival.
    const claimUrl = `${siteUrl}/directory/${listing.slug}?claim=start`
    const token = generateUnsubscribeToken(input.siteId, email)
    const unsubscribeUrl = `${siteUrl}/api/directory-claim-outreach/unsubscribe?site=${input.siteId}&email=${encodeURIComponent(email)}&token=${token}`

    try {
      const result = await sender.provider.send({
        from: sender.from,
        to: email,
        subject: `Claim ${listing.title} on ${site.name}`,
        html: buildInvitationEmailHtml({
          businessName: listing.title,
          siteName: site.name,
          claimUrl,
          unsubscribeUrl,
        }),
        headers: {
          'List-Unsubscribe': `<${unsubscribeUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      })

      if (result.success) {
        await db.insert(directoryClaimOutreach).values({
          siteId: input.siteId,
          directoryId,
          toEmail: email,
          status: 'sent',
          sentByUserId: user.id,
        })
        sent++
        outcomes.push({ directory_id: directoryId, outcome: 'sent' })
      } else {
        await db.insert(directoryClaimOutreach).values({
          siteId: input.siteId,
          directoryId,
          toEmail: email,
          status: 'failed',
          error: (result.error || 'Send failed').slice(0, 500),
          sentByUserId: user.id,
        })
        failed++
        outcomes.push({ directory_id: directoryId, outcome: 'failed', reason: 'send_failed' })
      }
    } catch (error) {
      console.error('Failed to send claim invitation for listing', directoryId, error)
      await db.insert(directoryClaimOutreach).values({
        siteId: input.siteId,
        directoryId,
        toEmail: email,
        status: 'failed',
        error: (error instanceof Error ? error.message : 'Send failed').slice(0, 500),
        sentByUserId: user.id,
      }).catch(() => {})
      failed++
      outcomes.push({ directory_id: directoryId, outcome: 'failed', reason: 'send_failed' })
    }
  }

  for (const directoryId of overflow) {
    outcomes.push({ directory_id: directoryId, outcome: 'skipped', reason: 'batch_limit' })
  }

  const skipped = outcomes.filter((outcome) => outcome.outcome === 'skipped').length

  return {
    success: true,
    error: null,
    sent,
    skipped,
    failed,
    cooldown_days: CLAIM_OUTREACH_COOLDOWN_DAYS,
    outcomes,
  }
}

/**
 * Record a claim-outreach opt-out for a site + email after the unsubscribe token
 * is verified. Idempotent: a repeat unsubscribe is a no-op.
 */
export async function recordClaimOutreachOptOut(siteId: string, email: string): Promise<void> {
  const normalized = email.trim().toLowerCase()
  if (!UUID_REGEX.test(siteId) || !normalized) return

  await db
    .insert(directoryClaimOutreachOptouts)
    .values({ siteId, email: normalized })
    .onConflictDoNothing()
}
