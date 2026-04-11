import { randomBytes } from 'crypto'
import { and, eq, or, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { emailAutomations, emailAutomationEnrollments, newsletterContacts, productOrders, products } from '@/lib/db/schema'
import { findActiveAutomations, enrollContact } from '@/lib/actions/newsletters/automation-actions'

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

  await db.insert(productOrders).values({
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

  const automations = await findActiveAutomations(siteId, 'paid_purchase', productId)
  for (const automation of automations) {
    await enrollContact(automation.id, contact.id)
  }

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
}
