import { NextRequest, NextResponse } from '@/lib/web-response'
import { sql } from 'drizzle-orm'

import { db } from '@/lib/db'
import {
  RECOVERY_DELAY_HOURS,
  RECOVERY_MAX_AGE_DAYS,
  buildRecoveryCheckoutPath,
  isRecoveryEnabled,
  recoverySkipReason,
} from '@/lib/actions/products/checkout-recovery-core'
import { getEmailConfig } from '@/lib/actions/integrations/config-helpers'
import { getEmailProvider } from '@/lib/actions/email/provider'
import {
  buildSystemEmailTokens,
  getSystemEmailTemplate,
  renderSystemEmailContent,
  renderSystemEmailSubject,
} from '@/lib/actions/email/system-email'
import { generateUnsubscribeToken } from '@/lib/utils/unsubscribe-token'
import type { SiteSettings } from '@/lib/db/schema/sites'

// Safety valve so one tick never processes an unbounded backlog.
const BATCH_LIMIT = 200

interface RecoveryRow extends Record<string, unknown> {
  siteId: string
  productId: string
  customerEmail: string
  createdAt: string
  tierId: string | null
  productTitle: string
  productSlug: string
  siteSettings: SiteSettings | null
  hasCompletedPurchase: boolean
  contactStatus: string | null
}

/**
 * One person + one product = one candidate, however many pending rows they
 * left behind (each retried checkout attempt writes its own order row).
 * `distinct on` keeps the newest attempt; after a successful send the stamp
 * is written to every matching pending row so no sibling can fire later.
 *
 * The window and the exclusion checks are re-applied in JS by
 * recoverySkipReason — the SQL narrows for efficiency, the pure helper (and
 * its tests) is the authority on who gets emailed.
 */
async function loadRecoveryCandidates() {
  const result = await db.execute<RecoveryRow>(sql`
    select distinct on (o.site_id, o.product_id, o.customer_email)
      o.site_id as "siteId",
      o.product_id as "productId",
      o.customer_email as "customerEmail",
      o.created_at as "createdAt",
      o.metadata->>'tier_id' as "tierId",
      p.title as "productTitle",
      p.slug as "productSlug",
      s.settings as "siteSettings",
      exists (
        select 1 from product_orders done
        where done.site_id = o.site_id
          and done.product_id = o.product_id
          and done.customer_email = o.customer_email
          and done.payment_status = 'succeeded'
      ) as "hasCompletedPurchase",
      (
        select nc.status from newsletter_contacts nc
        where nc.site_id = o.site_id and nc.email = o.customer_email
        limit 1
      ) as "contactStatus"
    from product_orders o
    inner join products p on p.id = o.product_id
    inner join sites s on s.id = o.site_id
    where o.order_type = 'paid_purchase'
      and o.payment_status = 'pending'
      and o.recovery_email_sent_at is null
      and o.created_at <= now() - make_interval(hours => ${RECOVERY_DELAY_HOURS})
      and o.created_at >= now() - make_interval(days => ${RECOVERY_MAX_AGE_DAYS})
      and s.status = 'active'
      -- Same rule as isRecoveryEnabled (off only when explicitly false), so a
      -- switched-off site's backlog never occupies batch slots.
      and coalesce(s.settings->>'checkout_recovery_enabled', 'true') <> 'false'
    order by o.site_id, o.product_id, o.customer_email, o.created_at desc
    limit ${BATCH_LIMIT}
  `)
  return result.rows
}

/**
 * GET /api/cron/checkout-recovery
 *
 * Finds paid product checkouts that were started, never paid, and are at
 * least RECOVERY_DELAY_HOURS old, and sends each person one — and only one —
 * "you left this behind" email with a link straight back to the checkout.
 * The recovery_email_sent_at stamp on the order rows is the send-once guard,
 * written only after the provider accepts the email, so a failed send simply
 * retries next tick. Protected by CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const now = new Date()
    const candidates = await loadRecoveryCandidates()

    let sent = 0
    let skipped = 0

    for (const row of candidates) {
      try {
        const reason = recoverySkipReason({
          createdAt: new Date(row.createdAt),
          recoveryEmailSentAt: null,
          hasCompletedPurchase: row.hasCompletedPurchase,
          contactStatus: row.contactStatus,
          recoveryEnabled: isRecoveryEnabled(row.siteSettings),
        }, now)
        if (reason) {
          skipped++
          continue
        }

        const config = await getEmailConfig(row.siteId)
        // No mail sender configured: leave the rows unstamped so they retry
        // once the site sets one up (or age out of the window).
        if (!config?.apiKey || !config.fromEmail) continue

        const template = await getSystemEmailTemplate('abandoned_checkout_recovery', row.siteId)
        // The owner turned this email off in the template editor.
        if (!template.is_enabled) continue

        const tokens = await buildSystemEmailTokens({
          siteId: row.siteId,
          productId: row.productId,
          productName: row.productTitle,
          productSlug: row.productSlug,
        })
        if (!tokens.site_url) continue

        tokens.checkout_url = `${tokens.site_url}${buildRecoveryCheckoutPath(row.productSlug, row.tierId)}`
        const unsubToken = generateUnsubscribeToken(row.siteId, row.customerEmail)
        tokens.unsubscribe_url = `${tokens.site_url}/unsubscribe?site=${row.siteId}&email=${encodeURIComponent(row.customerEmail)}&token=${unsubToken}`

        const provider = getEmailProvider(config.apiKey, config.providerType)
        const fromName = template.from_name || config.fromName
        const from = fromName ? `${fromName} <${config.fromEmail}>` : config.fromEmail
        const result = await provider.send({
          from,
          to: row.customerEmail,
          subject: renderSystemEmailSubject(template.subject, tokens),
          html: renderSystemEmailContent(template, tokens),
          replyTo: template.reply_to || undefined,
        })

        if (!result.success) continue

        // Stamp every still-pending row for this person + product, so a
        // second abandoned attempt can never trigger a second email.
        await db.execute(sql`
          update product_orders
          set recovery_email_sent_at = now(), updated_at = now()
          where site_id = ${row.siteId}
            and product_id = ${row.productId}
            and customer_email = ${row.customerEmail}
            and order_type = 'paid_purchase'
            and payment_status = 'pending'
            and recovery_email_sent_at is null
        `)
        sent++
      } catch (error) {
        // One bad candidate must not abort the batch; it retries next tick.
        // Ids only — recipient addresses stay out of the logs.
        console.error('Failed to send checkout recovery email for site', row.siteId, 'product', row.productId, error)
      }
    }

    return NextResponse.json({
      message: `Sent ${sent} checkout recovery emails, skipped ${skipped}`,
      sent,
      skipped,
    })
  } catch (error) {
    console.error('Checkout recovery cron failed:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
