import { NextRequest, NextResponse } from '@/lib/web-response'
import { and, asc, eq, gt, lte, sql } from 'drizzle-orm'

import { db } from '@/lib/db'
import {
  authUsers,
  directories,
  directoryClaims,
  directoryFeaturedEntitlements,
  directoryFeaturedPlans,
} from '@/lib/db/schema'
import { revalidateDirectoryFeaturedCaches } from '@/lib/actions/directories/directory-featured-activation'
import { getEmailConfig } from '@/lib/actions/integrations/config-helpers'
import { getEmailProvider } from '@/lib/actions/email/provider'
import {
  buildSystemEmailTokens,
  getSystemEmailTemplate,
  renderSystemEmailContent,
  renderSystemEmailSubject,
} from '@/lib/actions/email/system-email'
import { createHubNotificationForSuperAdmins } from '@/lib/actions/notifications/notification-service'
import {
  daysUntil,
  pendingReminderBucket,
  REMINDER_WINDOW_DAYS,
} from '@/lib/actions/directories/directory-renewal-reminders'

// Safety valve so one tick never processes an unbounded backlog.
const BATCH_LIMIT = 200

const expiresAtFormatter = new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' })

/**
 * GET /api/cron/featured-renewals
 *
 * Two passes over paid Featured placements:
 * 1. Reminders — email the owner at each configured threshold before expiry, deduped
 *    via reminder_threshold_days so each threshold sends exactly one email.
 * 2. Expiry — flip just-expired 'active' rows to 'expired' (persisting the transition
 *    that was previously only derived at read time) and notify super-admins once.
 *
 * Protected by CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const now = new Date()
    const remindersSent = await sendRenewalReminders(now)
    const expired = await expireLapsedPlacements()

    return NextResponse.json({
      message: `Sent ${remindersSent} renewal reminders, expired ${expired} placements`,
      remindersSent,
      expired,
    })
  } catch (error) {
    console.error('Featured renewals cron failed:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

async function sendRenewalReminders(now: Date): Promise<number> {
  // Only nudge placements that are still live: unexpired, unrevoked, claim still approved,
  // directory still published.
  const rows = await db
    .select({
      id: directoryFeaturedEntitlements.id,
      siteId: directoryFeaturedEntitlements.siteId,
      directoryId: directoryFeaturedEntitlements.directoryId,
      endsAt: directoryFeaturedEntitlements.endsAt,
      reminderThresholdDays: directoryFeaturedEntitlements.reminderThresholdDays,
      directoryTitle: directories.title,
      planName: directoryFeaturedPlans.name,
      ownerEmail: authUsers.email,
    })
    .from(directoryFeaturedEntitlements)
    .innerJoin(directories, eq(directories.id, directoryFeaturedEntitlements.directoryId))
    .innerJoin(directoryFeaturedPlans, eq(directoryFeaturedPlans.id, directoryFeaturedEntitlements.planId))
    .innerJoin(authUsers, eq(authUsers.id, directoryFeaturedEntitlements.userId))
    .innerJoin(directoryClaims, and(
      eq(directoryClaims.id, directoryFeaturedEntitlements.claimId),
      eq(directoryClaims.status, 'approved'),
      eq(directoryClaims.userId, directoryFeaturedEntitlements.userId),
      eq(directoryClaims.directoryId, directoryFeaturedEntitlements.directoryId),
    ))
    .where(and(
      eq(directoryFeaturedEntitlements.status, 'active'),
      eq(directories.status, 'published'),
      gt(directoryFeaturedEntitlements.endsAt, sql`now()`),
      lte(directoryFeaturedEntitlements.endsAt, sql`now() + make_interval(days => ${REMINDER_WINDOW_DAYS})`),
      // Skip if the owner already renewed: a later-ending active placement covers this directory.
      sql`not exists (
        select 1 from directory_featured_entitlements e2
        where e2.directory_id = ${directoryFeaturedEntitlements.directoryId}
          and e2.status = 'active'
          and e2.ends_at > ${directoryFeaturedEntitlements.endsAt}
      )`,
    ))
    .orderBy(asc(directoryFeaturedEntitlements.endsAt))
    .limit(BATCH_LIMIT)

  let sent = 0

  for (const row of rows) {
    try {
      const bucket = pendingReminderBucket(daysUntil(row.endsAt, now), row.reminderThresholdDays)
      if (bucket === null) continue
      if (!row.ownerEmail) continue

      const config = await getEmailConfig(row.siteId)
      // No Resend config: leave the row untouched so it retries once configured.
      if (!config?.apiKey || !config.fromEmail) continue

      const template = await getSystemEmailTemplate('featured_listing_renewal_reminder', row.siteId)
      const tokens = await buildSystemEmailTokens({
        siteId: row.siteId,
        listingName: row.directoryTitle,
        planName: row.planName,
        expiresAt: expiresAtFormatter.format(row.endsAt),
      })

      const provider = getEmailProvider(config.apiKey, config.providerType)
      const from = config.fromName ? `${config.fromName} <${config.fromEmail}>` : config.fromEmail
      const result = await provider.send({
        from,
        to: row.ownerEmail,
        subject: renderSystemEmailSubject(template.subject, tokens),
        html: renderSystemEmailContent(template, tokens),
        replyTo: template.reply_to || undefined,
      })

      if (!result.success) continue

      await db
        .update(directoryFeaturedEntitlements)
        .set({ reminderThresholdDays: bucket, updatedAt: now })
        .where(eq(directoryFeaturedEntitlements.id, row.id))
      sent++
    } catch (error) {
      // One bad entitlement must not abort the batch; it retries next tick.
      console.error('Failed to send renewal reminder for entitlement', row.id, error)
    }
  }

  return sent
}

async function expireLapsedPlacements(): Promise<number> {
  const rows = await db
    .select({
      id: directoryFeaturedEntitlements.id,
      siteId: directoryFeaturedEntitlements.siteId,
      directoryId: directoryFeaturedEntitlements.directoryId,
      directoryTitle: directories.title,
      directorySlug: directories.slug,
      planName: directoryFeaturedPlans.name,
    })
    .from(directoryFeaturedEntitlements)
    .innerJoin(directories, eq(directories.id, directoryFeaturedEntitlements.directoryId))
    .innerJoin(directoryFeaturedPlans, eq(directoryFeaturedPlans.id, directoryFeaturedEntitlements.planId))
    .where(and(
      eq(directoryFeaturedEntitlements.status, 'active'),
      lte(directoryFeaturedEntitlements.endsAt, sql`now()`),
    ))
    .limit(BATCH_LIMIT)

  let expired = 0

  for (const row of rows) {
    try {
      // Guard on status so a concurrent tick flips each row at most once.
      const [flipped] = await db
        .update(directoryFeaturedEntitlements)
        .set({ status: 'expired', updatedAt: new Date() })
        .where(and(
          eq(directoryFeaturedEntitlements.id, row.id),
          eq(directoryFeaturedEntitlements.status, 'active'),
        ))
        .returning({ id: directoryFeaturedEntitlements.id })

      if (!flipped) continue
      expired++

      revalidateDirectoryFeaturedCaches(row.siteId, row.directoryId)

      try {
        await createHubNotificationForSuperAdmins({
          type: 'directory_featured_expired',
          siteId: row.siteId,
          sourceId: row.id,
          title: 'Featured placement expired',
          message: `${row.directoryTitle}'s featured placement (${row.planName}) has expired.`,
          targetHref: '/admin/directory/monetization',
          metadata: {
            directory_id: row.directoryId,
            directory_slug: row.directorySlug,
          },
        })
      } catch (error) {
        console.error('Failed to create featured expiry notification:', error)
      }
    } catch (error) {
      console.error('Failed to expire entitlement', row.id, error)
    }
  }

  return expired
}
