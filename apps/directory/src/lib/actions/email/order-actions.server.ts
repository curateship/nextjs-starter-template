import { db } from '@/lib/db'
import { productOrders, products, sites } from '@/lib/db/schema'
import { eq, desc, inArray, and, sql } from 'drizzle-orm'
import { getAuthenticatedUser } from '@/lib/db/helpers'
import { normalizePagination } from '@/lib/utils/validation'

/**
 * Verify the authenticated user owns the given site.
 */
async function verifySiteOwnership(siteId: string): Promise<void> {
  const user = await getAuthenticatedUser()
  if (!user) throw new Error('Authentication required')

  const result = await db
    .select({ id: sites.id })
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.userId, user.id)))
    .limit(1)

  if (result.length === 0) throw new Error('Site not found or access denied')
}

/**
 * Order type enum
 */
export type OrderType = 'lead_magnet' | 'paid_purchase'

/**
 * Payment status enum
 */
export type PaymentStatus = 'pending' | 'succeeded' | 'failed' | 'canceled'

/**
 * Product order data structure
 */
export interface ProductOrder {
  id: string
  site_id: string
  product_id: string
  customer_email: string
  order_type: OrderType
  stripe_session_id: string | null
  stripe_payment_intent_id: string | null
  amount_total: number | null
  currency: string | null
  payment_status: PaymentStatus | null
  access_token: string
  clicked_at: string | null
  click_count: number
  email_sent_at: string | null
  recovery_email_sent_at: string | null
  metadata: Record<string, any> | null
  created_at: string
  updated_at: string
}

/**
 * Map a Drizzle row to the ProductOrder interface (snake_case keys)
 */
function toProductOrder(row: typeof productOrders.$inferSelect): ProductOrder {
  return {
    id: row.id,
    site_id: row.siteId,
    product_id: row.productId,
    customer_email: row.customerEmail,
    order_type: row.orderType as OrderType,
    stripe_session_id: row.stripeSessionId,
    stripe_payment_intent_id: row.stripePaymentIntentId,
    amount_total: row.amountTotal,
    currency: row.currency,
    payment_status: row.paymentStatus as PaymentStatus | null,
    access_token: row.accessToken,
    clicked_at: row.clickedAt?.toISOString() ?? null,
    click_count: row.clickCount ?? 0,
    email_sent_at: row.emailSentAt?.toISOString() ?? null,
    recovery_email_sent_at: row.recoveryEmailSentAt?.toISOString() ?? null,
    metadata: row.metadata as Record<string, any> | null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  }
}

/** Returns only order IDs for bulk selection — lightweight alternative to full record fetch */
export async function getOrderIdsActionImpl(siteId: string): Promise<{ ids: string[]; error: string | null }> {
  try {
    await verifySiteOwnership(siteId)

    const rows = await db
      .select({ id: productOrders.id })
      .from(productOrders)
      .where(eq(productOrders.siteId, siteId))

    return { ids: rows.map(r => r.id), error: null }
  } catch (error) {
    return { ids: [], error: `Server error: ${error instanceof Error ? error.message : String(error)}` }
  }
}

/**
 * Get orders + product name map in a single auth check
 */
export async function getOrdersWithProductsImpl(
  siteId: string,
  options?: { page?: number; pageSize?: number }
): Promise<{ data: ProductOrder[]; total: number; recoverySentTotal: number; productMap: Record<string, string> }> {
  try {
    await verifySiteOwnership(siteId)

    const { page, pageSize, offset } = normalizePagination(options)

    const [ordersResult, countResult, productsResult] = await Promise.all([
      db
        .select()
        .from(productOrders)
        .where(eq(productOrders.siteId, siteId))
        .orderBy(desc(productOrders.createdAt))
        .limit(pageSize)
        .offset(offset),
      db
        .select({
          count: sql<number>`count(*)::int`,
          recoverySent: sql<number>`count(*) filter (where ${productOrders.recoveryEmailSentAt} is not null)::int`,
        })
        .from(productOrders)
        .where(eq(productOrders.siteId, siteId)),
      db
        .select({ id: products.id, title: products.title })
        .from(products)
        .where(eq(products.siteId, siteId)),
    ])

    const productMap: Record<string, string> = {}
    for (const p of productsResult) {
      productMap[p.id] = p.title
    }

    return {
      data: ordersResult.map(toProductOrder),
      total: countResult[0]?.count ?? 0,
      recoverySentTotal: countResult[0]?.recoverySent ?? 0,
      productMap,
    }
  } catch (error) {
    console.error('Error in getOrdersWithProducts:', error)
    return { data: [], total: 0, recoverySentTotal: 0, productMap: {} }
  }
}

/**
 * Delete orders by IDs
 */
export async function deleteOrdersImpl(orderIds: string[]): Promise<void> {
  try {
    if (orderIds.length === 0) return

    // Verify ownership: check that all orders belong to a site the user owns
    const orders = await db
      .select({ siteId: productOrders.siteId })
      .from(productOrders)
      .where(inArray(productOrders.id, orderIds))

    if (!orders || orders.length === 0) throw new Error('Orders not found')

    const siteIds = [...new Set(orders.map(o => o.siteId))]
    for (const siteId of siteIds) {
      await verifySiteOwnership(siteId)
    }

    await db
      .delete(productOrders)
      .where(inArray(productOrders.id, orderIds))
  } catch (error) {
    console.error('Error in deleteOrders:', error)
    throw error
  }
}
