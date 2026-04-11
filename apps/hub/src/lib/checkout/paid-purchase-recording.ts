import { randomBytes } from 'crypto'
import { and, eq, or, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { emailAutomations, emailAutomationEnrollments, newsletterContacts, productOrders, products } from '@/lib/db/schema'
import { findActiveAutomations, enrollContact } from '@/lib/actions/newsletters/automation-actions'
import { getEmailConfig } from '@/lib/actions/integrations/config-helpers'
import { emailService } from '@/lib/actions/email/email-service'
import { convertContentBlocksToArray } from '@/lib/utils/block-utils'

function generateAccessToken() {
  return randomBytes(32).toString('base64url')
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

  const existingChecks = [
    stripeSessionId ? eq(productOrders.stripeSessionId, stripeSessionId) : null,
    stripePaymentIntentId ? eq(productOrders.stripePaymentIntentId, stripePaymentIntentId) : null,
  ].filter((check): check is NonNullable<typeof check> => check !== null)

  if (existingChecks.length) {
    const [existingOrder] = await db
      .select({ id: productOrders.id })
      .from(productOrders)
      .where(existingChecks.length === 1 ? existingChecks[0] : or(...existingChecks))
      .limit(1)

    if (existingOrder) return
  }

  const [order] = await db.insert(productOrders).values({
    siteId,
    productId,
    customerEmail: customerEmail.toLowerCase(),
    orderType: 'paid_purchase',
    stripeSessionId: stripeSessionId || null,
    stripePaymentIntentId: stripePaymentIntentId || null,
    amountTotal: params.amountTotal ?? null,
    currency: params.currency || null,
    paymentStatus: params.paymentStatus,
    accessToken: generateAccessToken(),
    metadata: params.metadata || null,
  }).returning({
    id: productOrders.id,
    accessToken: productOrders.accessToken,
  })

  const [contact] = await db
    .insert(newsletterContacts)
    .values({
      siteId,
      email: customerEmail.toLowerCase(),
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
    .returning({ id: newsletterContacts.id })

  if (!contact) return

  const activeEnrollments = await db
    .select({ id: emailAutomationEnrollments.id, automationId: emailAutomationEnrollments.automationId })
    .from(emailAutomationEnrollments)
    .where(and(
      eq(emailAutomationEnrollments.contactId, contact.id),
      eq(emailAutomationEnrollments.status, 'active'),
    ))

  for (const enrollment of activeEnrollments) {
    const [automation] = await db
      .select({ goalType: emailAutomations.goalType, goalConfig: emailAutomations.goalConfig })
      .from(emailAutomations)
      .where(eq(emailAutomations.id, enrollment.automationId))

    if (automation?.goalType === 'purchase') {
      const goalConfig = automation.goalConfig as Record<string, any> | null
      const goalProductId = goalConfig?.product_id
      if (!goalProductId || goalProductId === productId) {
        await db
          .update(emailAutomationEnrollments)
          .set({ status: 'goal_met', goalMetAt: new Date() })
          .where(eq(emailAutomationEnrollments.id, enrollment.id))
      }
    }
  }

  const automations = await findActiveAutomations(siteId, 'paid_purchase', productId)
  for (const automation of automations) {
    await enrollContact(automation.id, contact.id)
  }

  if (order) {
    await sendPaidProductEmail({
      siteId,
      productId,
      customerEmail,
      orderId: order.id,
      accessToken: order.accessToken,
      tierId: params.metadata?.tier_id || params.metadata?.tierId,
    })
  }
}

async function sendPaidProductEmail(params: {
  siteId: string
  productId: string
  customerEmail: string
  orderId: string
  accessToken: string
  tierId?: string | null
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

  if (!product) return

  const blocks = convertContentBlocksToArray((product.contentBlocks || {}) as Record<string, any>, params.productId)
  const checkoutBlock = blocks.find(block => block.type === 'product-checkout')
  const tiers = checkoutBlock?.content?.productPricingTiers || []
  const purchasedTier = params.tierId ? tiers.find((tier: any) => tier.id === params.tierId) : null
  const downloadContent = purchasedTier?.enableDownloadPage ? purchasedTier.downloadContent : null
  const content = downloadContent || `<p>Thank you for your purchase of ${product.title}.</p>`

  const config = await getEmailConfig(params.siteId)
  if (!config?.apiKey || !config.fromEmail) {
    console.error('Skipping paid product email: Resend is not configured for site', params.siteId)
    return
  }

  const result = await emailService.sendProductDeliveryEmail({
    to: params.customerEmail,
    subject: `Your ${product.title} is ready!`,
    productTitle: product.title,
    content,
    productSlug: product.slug,
    token: params.accessToken,
    config,
  })

  if (!result.success) {
    console.error('Failed to send paid product email:', result.error)
    return
  }

  await db
    .update(productOrders)
    .set({
      emailSentAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(productOrders.id, params.orderId))
}
