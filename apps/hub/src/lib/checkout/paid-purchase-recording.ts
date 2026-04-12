import { randomBytes } from 'crypto'
import { and, eq, or, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { newsletterContacts, productOrders, products } from '@/lib/db/schema'
import { getEmailConfig } from '@/lib/actions/integrations/config-helpers'
import { emailService } from '@/lib/actions/email/email-service'
import {
  buildSystemEmailTokens,
  getSystemEmailTemplate,
  renderSystemEmailContent,
  renderSystemEmailSubject,
} from '@/lib/email/system-email'

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
      .select({
        id: productOrders.id,
        accessToken: productOrders.accessToken,
        emailSentAt: productOrders.emailSentAt,
      })
      .from(productOrders)
      .where(existingChecks.length === 1 ? existingChecks[0] : or(...existingChecks))
      .limit(1)

    if (existingOrder) {
      if (!existingOrder.emailSentAt) {
        await sendPaidProductEmail({
          siteId,
          productId,
          customerEmail,
          orderId: existingOrder.id,
          accessToken: existingOrder.accessToken,
          tierId: params.metadata?.tier_id || params.metadata?.tierId,
          tierName: params.metadata?.tier_name || params.metadata?.tierName,
        })
      }
      return
    }
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

  try {
    await db
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
  } catch (error) {
    console.error('Failed to record paid purchase contact:', error)
  }

  if (order) {
    await sendPaidProductEmail({
      siteId,
      productId,
      customerEmail,
      orderId: order.id,
      accessToken: order.accessToken,
      tierId: params.metadata?.tier_id || params.metadata?.tierId,
      tierName: params.metadata?.tier_name || params.metadata?.tierName,
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
  tierName?: string | null
}) {
  const [product] = await db
    .select({
      title: products.title,
      slug: products.slug,
    })
    .from(products)
    .where(and(eq(products.id, params.productId), eq(products.siteId, params.siteId)))
    .limit(1)

  if (!product) return

  const config = await getEmailConfig(params.siteId)
  if (!config?.apiKey || !config.fromEmail) {
    console.error('Skipping paid product email: Resend is not configured for site', params.siteId)
    return
  }

  const template = await getSystemEmailTemplate('paid_purchase_delivery', params.siteId)
  const tokens = await buildSystemEmailTokens({
    templateKey: 'paid_purchase_delivery',
    siteId: params.siteId,
    productId: params.productId,
    productName: product.title,
    productSlug: product.slug,
    tierName: params.tierName || undefined,
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
