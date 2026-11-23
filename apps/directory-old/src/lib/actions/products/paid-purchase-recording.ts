import { randomBytes } from 'crypto'
import { and, eq, isNull, lt, or, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { emailAutomationEnrollments, emailAutomations, emailAutomationSteps, newsletterContacts, productOrders, products } from '@/lib/db/schema'
import { getEmailConfig } from '@/lib/actions/integrations/config-helpers'
import { emailService } from '@/lib/actions/email/email-service'
import { createHubNotificationForSuperAdmins } from '@/lib/actions/notifications/notification-service'
import {
  buildSystemEmailTokens,
  getSystemEmailTemplate,
  renderSystemEmailContent,
  renderSystemEmailSubject,
} from '@/lib/actions/email/system-email'
import { convertContentBlocksToArray } from '@/lib/utils/block-utils'
import {
  resolvePaidPurchaseStatus,
  shouldClaimPaidPurchaseFulfillment,
} from '@/lib/utils/paid-purchase-state'

function generateAccessToken() {
  return randomBytes(32).toString('base64url')
}

async function markMatchingAutomationGoalsMet(params: {
  siteId: string
  productId: string
  customerEmail: string
  orderId?: string
}) {
  const email = params.customerEmail.toLowerCase().trim()
  const [contact] = await db
    .select({ id: newsletterContacts.id })
    .from(newsletterContacts)
    .where(and(
      eq(newsletterContacts.siteId, params.siteId),
      eq(newsletterContacts.email, email),
    ))
    .limit(1)

  if (!contact) return

  await db
    .update(emailAutomationEnrollments)
    .set({
      status: 'goal_met',
      goalMetAt: new Date(),
      endedAt: new Date(),
      lastStepSentAt: new Date(),
      metadata: sql`coalesce(${emailAutomationEnrollments.metadata}, '{}'::jsonb) || ${JSON.stringify({
        source: 'paid_purchase',
        goal_product_id: params.productId,
        ...(params.orderId ? { goal_order_id: params.orderId } : {}),
      })}::jsonb`,
    })
    .from(emailAutomations)
    .where(and(
      eq(emailAutomationEnrollments.automationId, emailAutomations.id),
      eq(emailAutomationEnrollments.contactId, contact.id),
      eq(emailAutomationEnrollments.status, 'active'),
      eq(emailAutomations.siteId, params.siteId),
      sql`(
        coalesce(${emailAutomations.goalConfig}->'product_ids', '[]'::jsonb) ? ${params.productId}
        or ${emailAutomations.goalConfig}->>'product_id' = ${params.productId}
        or exists (
          select 1
          from ${emailAutomationSteps}
          where ${emailAutomationSteps.automationId} = ${emailAutomations.id}
            and ${emailAutomationSteps.nodeType} = 'end_rules'
            and coalesce(${emailAutomationSteps.nodeConfig}->'product_ids', '[]'::jsonb) ? ${params.productId}
        )
      )`,
    ))
}

export async function getProductIdFromPurchaseMetadata(
  siteId: string,
  metadata: Record<string, string> | null | undefined
) {
  if (metadata?.productId) {
    const [product] = await db
      .select({ id: products.id })
      .from(products)
      .where(and(eq(products.siteId, siteId), eq(products.id, metadata.productId)))
      .limit(1)

    if (product) return product.id
  }

  if (!metadata?.productSlug) return null

  const [product] = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.siteId, siteId), eq(products.slug, metadata.productSlug)))
    .limit(1)

  return product?.id ?? null
}

export async function recordPaidPurchase(params: {
  siteId?: string | null
  productId?: string | null
  customerEmail?: string | null
  stripeSessionId?: string | null
  stripePaymentIntentId?: string | null
  amountTotal?: number | null
  currency?: string | null
  paymentStatus: 'pending' | 'succeeded' | 'failed' | 'canceled'
  metadata?: Record<string, any>
}) {
  const { siteId, productId, customerEmail, stripeSessionId, stripePaymentIntentId } = params
  if (!siteId || !productId || !customerEmail) {
    console.error('Skipping paid purchase recording: missing required fields', {
      hasSiteId: !!siteId,
      hasProductId: !!productId,
      hasCustomerEmail: !!customerEmail,
      stripeSessionId,
      stripePaymentIntentId,
    })
    return
  }

  if (!stripeSessionId && !stripePaymentIntentId) {
    console.error('Skipping paid purchase recording: missing Stripe identifier')
    return
  }

  const normalizedEmail = customerEmail.toLowerCase().trim()

  const existingChecks = [
    stripeSessionId ? eq(productOrders.stripeSessionId, stripeSessionId) : null,
    stripePaymentIntentId ? eq(productOrders.stripePaymentIntentId, stripePaymentIntentId) : null,
  ].filter((check): check is NonNullable<typeof check> => check !== null)

  const matchExistingOrder = existingChecks.length === 1 ? existingChecks[0] : or(...existingChecks)
  const staleClaimBefore = new Date(Date.now() - 15 * 60 * 1000)

  const outcome = await db.transaction(async (tx) => {
    const selectExisting = async () => {
      const [existing] = await tx
        .select({
          id: productOrders.id,
          siteId: productOrders.siteId,
          productId: productOrders.productId,
          accessToken: productOrders.accessToken,
          emailSentAt: productOrders.emailSentAt,
          paymentStatus: productOrders.paymentStatus,
        })
        .from(productOrders)
        .where(matchExistingOrder)
        .limit(1)
      return existing
    }

    let order = await selectExisting()
    let created = false

    if (!order) {
      const [inserted] = await tx
        .insert(productOrders)
        .values({
          siteId,
          productId,
          customerEmail: normalizedEmail,
          orderType: 'paid_purchase',
          stripeSessionId: stripeSessionId || null,
          stripePaymentIntentId: stripePaymentIntentId || null,
          amountTotal: params.amountTotal ?? null,
          currency: params.currency || null,
          paymentStatus: params.paymentStatus,
          accessToken: generateAccessToken(),
          metadata: params.metadata || null,
        })
        .onConflictDoNothing()
        .returning({
          id: productOrders.id,
          siteId: productOrders.siteId,
          productId: productOrders.productId,
          accessToken: productOrders.accessToken,
          emailSentAt: productOrders.emailSentAt,
          paymentStatus: productOrders.paymentStatus,
        })

      order = inserted || await selectExisting()
      created = Boolean(inserted)
    }

    if (!order) {
      throw new Error('Unable to create or resolve paid purchase order')
    }
    if (order.siteId !== siteId || order.productId !== productId) {
      throw new Error('Stripe payment identifier is already attached to another order')
    }

    const becameSucceeded = params.paymentStatus === 'succeeded' && order.paymentStatus !== 'succeeded'
    const nextStatus = resolvePaidPurchaseStatus(order.paymentStatus, params.paymentStatus)

    if (!created) {
      const [updated] = await tx
        .update(productOrders)
        .set({
          stripeSessionId: stripeSessionId || undefined,
          stripePaymentIntentId: stripePaymentIntentId || undefined,
          amountTotal: params.amountTotal ?? undefined,
          currency: params.currency || undefined,
          paymentStatus: nextStatus,
          metadata: sql`coalesce(${productOrders.metadata}, '{}'::jsonb) || ${JSON.stringify(params.metadata || {})}::jsonb`,
          updatedAt: new Date(),
        })
        .where(eq(productOrders.id, order.id))
        .returning({
          id: productOrders.id,
          siteId: productOrders.siteId,
          productId: productOrders.productId,
          accessToken: productOrders.accessToken,
          emailSentAt: productOrders.emailSentAt,
          paymentStatus: productOrders.paymentStatus,
        })
      order = updated || order
    }

    let claimedForFulfillment = false
    if (shouldClaimPaidPurchaseFulfillment(order.paymentStatus, order.emailSentAt)) {
      const [claim] = await tx
        .update(productOrders)
        .set({ fulfillmentStartedAt: new Date(), updatedAt: new Date() })
        .where(and(
          eq(productOrders.id, order.id),
          isNull(productOrders.emailSentAt),
          or(
            isNull(productOrders.fulfillmentStartedAt),
            lt(productOrders.fulfillmentStartedAt, staleClaimBefore),
          ),
        ))
        .returning({ id: productOrders.id })
      claimedForFulfillment = Boolean(claim)
    }

    return {
      order,
      claimedForFulfillment,
      shouldNotify: order.paymentStatus === 'succeeded' && (created || becameSucceeded),
    }
  })

  const { order } = outcome
  if (outcome.claimedForFulfillment) {
    let delivered = false
    try {
      delivered = await sendPaidProductEmail({
        siteId,
        productId,
        customerEmail: normalizedEmail,
        orderId: order.id,
        accessToken: order.accessToken,
        tierId: params.metadata?.tier_id || params.metadata?.tierId,
        tierName: params.metadata?.tier_name || params.metadata?.tierName,
      })
    } finally {
      if (!delivered) {
        await db
          .update(productOrders)
          .set({ fulfillmentStartedAt: null, updatedAt: new Date() })
          .where(and(eq(productOrders.id, order.id), isNull(productOrders.emailSentAt)))
      }
    }
  }

  if (outcome.shouldNotify) {
    const [product] = await db
      .select({ title: products.title })
      .from(products)
      .where(and(eq(products.id, productId), eq(products.siteId, siteId)))
      .limit(1)

    try {
      await createHubNotificationForSuperAdmins({
        type: 'product_order',
        siteId,
        sourceId: order.id,
        title: 'New paid purchase',
        message: `${normalizedEmail} purchased ${product?.title ?? 'a product'}.`,
        targetHref: '/admin/orders?type=paid_purchase',
        metadata: {
          product_id: productId,
          order_type: 'paid_purchase',
          payment_status: 'succeeded',
        },
      })
    } catch (error) {
      console.error('Failed to create paid purchase notification:', error)
    }
  }

  if (order.paymentStatus !== 'succeeded') return

  try {
    await db
      .insert(newsletterContacts)
      .values({
        siteId,
        email: normalizedEmail,
        metadata: {
          source: 'paid_purchase',
          source_product_id: productId,
        },
      })
      .onConflictDoUpdate({
        target: [newsletterContacts.siteId, newsletterContacts.email],
        set: {
          metadata: sql`coalesce(${newsletterContacts.metadata}, '{}'::jsonb) || ${JSON.stringify({
            source: 'paid_purchase',
            source_product_id: productId,
          })}::jsonb`,
          updatedAt: new Date(),
        },
      })
  } catch (error) {
    console.error('Failed to record paid purchase contact:', error)
  }

  if (params.paymentStatus === 'succeeded') {
    try {
      await markMatchingAutomationGoalsMet({
        siteId,
        productId,
        customerEmail: normalizedEmail,
        orderId: order.id,
      })
    } catch (error) {
      console.error('Failed to update paid purchase automation goals:', error)
    }
  }
}

async function sendPaidProductEmail(params: {
  siteId: string
  productId: string
  customerEmail: string
  orderId: string
  accessToken: string
  tierId?: string | null
  tierName?: string | null
}) {
  const [product] = await db
    .select({
      title: products.title,
      slug: products.slug,
      contentBlocks: products.contentBlocks,
    })
    .from(products)
    .where(and(eq(products.id, params.productId), eq(products.siteId, params.siteId)))
    .limit(1)

  if (!product) return false

  const config = await getEmailConfig(params.siteId)
  if (!config?.apiKey || !config.fromEmail) {
    console.error('Skipping paid product email: Resend is not configured for site', params.siteId)
    return false
  }

  const downloadPageContent = getTierDownloadPageContent(
    product.contentBlocks as Record<string, any> | null | undefined,
    params.tierId
  )

  const template = await getSystemEmailTemplate('paid_purchase_delivery', params.siteId)
  const tokens = await buildSystemEmailTokens({
    siteId: params.siteId,
    productId: params.productId,
    productName: product.title,
    productSlug: product.slug,
    tierName: params.tierName || undefined,
    downloadPageContent,
  })

  const result = await emailService.sendProductDeliveryEmail({
    to: params.customerEmail,
    subject: renderSystemEmailSubject(template.subject, tokens),
    productTitle: product.title,
    content: '',
    productSlug: product.slug,
    token: params.accessToken,
    replyTo: template.reply_to || undefined,
    rawHtml: renderSystemEmailContent(template, tokens),
    config: {
      ...config,
      fromName: template.from_name || config.fromName,
      replyTo: template.reply_to || undefined,
    },
  })

  if (!result.success) {
    console.error('Failed to send paid product email:', result.error)
    return false
  }

  await db
    .update(productOrders)
    .set({
      emailSentAt: new Date(),
      fulfillmentStartedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(productOrders.id, params.orderId))

  return true
}

function getTierDownloadPageContent(
  contentBlocks: Record<string, any> | null | undefined,
  tierId?: string | null
) {
  if (!contentBlocks || !tierId) return ''

  const checkoutBlock = convertContentBlocksToArray(contentBlocks, '')
    .find((block) => block.type === 'product-checkout')

  const tiers = checkoutBlock?.content?.productPricingTiers || checkoutBlock?.content?.tiers
  if (!Array.isArray(tiers)) return ''

  const tier = tiers.find((entry: any) => entry?.id === tierId)
  if (!tier || typeof tier.downloadContent !== 'string') return ''

  return tier.downloadContent
}
