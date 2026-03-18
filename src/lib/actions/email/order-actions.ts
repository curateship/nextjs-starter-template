'use server'

import { randomBytes } from 'crypto'
import { db } from '@/lib/db'
import { productOrders, products, sites } from '@/lib/db/schema'
import { eq, desc, inArray, and, sql } from 'drizzle-orm'
import { getAuthenticatedUser } from '@/lib/db/helpers'

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
  flodesk_added_at: string | null
  metadata: Record<string, any> | null
  created_at: string
  updated_at: string
}

/**
 * Generate a cryptographically secure access token
 */
function generateAccessToken(): string {
  return randomBytes(32).toString('base64url')
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
    flodesk_added_at: row.flodeskAddedAt?.toISOString() ?? null,
    metadata: row.metadata as Record<string, any> | null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  }
}

/**
 * Create a free product signup record
 */
export async function createFreeSignup(params: {
  siteId: string
  productId: string
  email: string
  metadata?: Record<string, any>
}): Promise<ProductOrder> {
  try {
    const accessToken = generateAccessToken()

    const [row] = await db
      .insert(productOrders)
      .values({
        siteId: params.siteId,
        productId: params.productId,
        customerEmail: params.email.toLowerCase().trim(),
        orderType: 'lead_magnet' as any,
        accessToken,
        metadata: params.metadata || null,
      })
      .returning()

    return toProductOrder(row)
  } catch (error) {
    console.error('Error in createFreeSignup:', error)
    throw error
  }
}

/**
 * Create a paid purchase record
 */
export async function createPaidOrder(params: {
  siteId: string
  productId: string
  email: string
  stripeSessionId: string
  stripePaymentIntentId: string
  amountTotal: number
  currency: string
  paymentStatus?: PaymentStatus
  metadata?: Record<string, any>
}): Promise<ProductOrder> {
  try {
    const accessToken = generateAccessToken()

    const [row] = await db
      .insert(productOrders)
      .values({
        siteId: params.siteId,
        productId: params.productId,
        customerEmail: params.email.toLowerCase().trim(),
        orderType: 'paid_purchase' as any,
        stripeSessionId: params.stripeSessionId,
        stripePaymentIntentId: params.stripePaymentIntentId,
        amountTotal: params.amountTotal,
        currency: params.currency,
        paymentStatus: (params.paymentStatus || 'succeeded') as any,
        accessToken,
        metadata: params.metadata || null,
      })
      .returning()

    return toProductOrder(row)
  } catch (error) {
    console.error('Error in createPaidOrder:', error)
    throw error
  }
}

/**
 * Get order by access token
 */
export async function getOrderByToken(
  token: string
): Promise<ProductOrder | null> {
  try {
    const rows = await db
      .select()
      .from(productOrders)
      .where(eq(productOrders.accessToken, token))
      .limit(1)

    if (rows.length === 0) return null
    return toProductOrder(rows[0])
  } catch (error) {
    console.error('Error in getOrderByToken:', error)
    return null
  }
}

/**
 * Get order by Stripe session ID
 */
export async function getOrderByStripeSession(
  stripeSessionId: string
): Promise<ProductOrder | null> {
  try {
    const rows = await db
      .select()
      .from(productOrders)
      .where(eq(productOrders.stripeSessionId, stripeSessionId))
      .limit(1)

    if (rows.length === 0) return null
    return toProductOrder(rows[0])
  } catch (error) {
    console.error('Error in getOrderByStripeSession:', error)
    return null
  }
}

/**
 * Get all orders for a customer email
 */
export async function getOrdersByEmail(
  email: string
): Promise<ProductOrder[]> {
  try {
    const rows = await db
      .select()
      .from(productOrders)
      .where(eq(productOrders.customerEmail, email.toLowerCase().trim()))
      .orderBy(desc(productOrders.createdAt))

    return rows.map(toProductOrder)
  } catch (error) {
    console.error('Error in getOrdersByEmail:', error)
    return []
  }
}

/**
 * Get orders + product name map in a single auth check
 */
export async function getOrdersWithProducts(
  siteId: string,
  options?: { page?: number; pageSize?: number }
): Promise<{ data: ProductOrder[]; total: number; productMap: Record<string, string> }> {
  try {
    await verifySiteOwnership(siteId)

    const page = Math.max(1, Math.floor(options?.page ?? 1))
    const pageSize = Math.min(100, Math.max(1, Math.floor(options?.pageSize ?? 50)))
    const offset = (page - 1) * pageSize

    const [ordersResult, countResult, productsResult] = await Promise.all([
      db
        .select()
        .from(productOrders)
        .where(eq(productOrders.siteId, siteId))
        .orderBy(desc(productOrders.createdAt))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
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
      productMap,
    }
  } catch (error) {
    console.error('Error in getOrdersWithProducts:', error)
    return { data: [], total: 0, productMap: {} }
  }
}

/**
 * Get all orders for a product
 */
export async function getOrdersByProduct(
  productId: string
): Promise<ProductOrder[]> {
  try {
    // Verify the caller owns the site this product belongs to
    const productRows = await db
      .select({ siteId: products.siteId })
      .from(products)
      .where(eq(products.id, productId))
      .limit(1)

    if (productRows.length === 0) throw new Error('Product not found')
    await verifySiteOwnership(productRows[0].siteId)

    const rows = await db
      .select()
      .from(productOrders)
      .where(eq(productOrders.productId, productId))
      .orderBy(desc(productOrders.createdAt))

    return rows.map(toProductOrder)
  } catch (error) {
    console.error('Error in getOrdersByProduct:', error)
    return []
  }
}

/**
 * Mark email as sent for an order
 */
export async function markEmailSent(orderId: string): Promise<void> {
  try {
    await db
      .update(productOrders)
      .set({
        emailSentAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(productOrders.id, orderId))
  } catch (error) {
    console.error('Error in markEmailSent:', error)
    throw error
  }
}

/**
 * Mark link as clicked and increment click count
 */
export async function markLinkClicked(token: string): Promise<ProductOrder> {
  try {
    const now = new Date().toISOString()

    // Try RPC first for atomic increment
    try {
      const result = await db.execute(sql`SELECT * FROM increment_click_count(${token}, ${now}::timestamptz)`)
      if (result.rows && result.rows.length > 0) {
        return result.rows[0] as unknown as ProductOrder
      }
    } catch {
      // Fallback if RPC doesn't exist: use regular update
    }

    const order = await getOrderByToken(token)
    if (!order) throw new Error('Order not found')

    const [updated] = await db
      .update(productOrders)
      .set({
        clickCount: order.click_count + 1,
        clickedAt: order.clicked_at ? new Date(order.clicked_at) : new Date(),
        updatedAt: new Date(),
      })
      .where(eq(productOrders.id, order.id))
      .returning()

    return toProductOrder(updated)
  } catch (error) {
    console.error('Error in markLinkClicked:', error)
    throw error
  }
}

/**
 * Mark Flodesk addition for an order
 */
export async function markFlodeskAdded(orderId: string): Promise<void> {
  try {
    await db
      .update(productOrders)
      .set({
        flodeskAddedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(productOrders.id, orderId))
  } catch (error) {
    console.error('Error in markFlodeskAdded:', error)
    throw error
  }
}

/**
 * Delete orders by IDs
 */
export async function deleteOrders(orderIds: string[]): Promise<void> {
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

/**
 * Update payment status
 */
export async function updatePaymentStatus(
  orderId: string,
  status: PaymentStatus
): Promise<void> {
  try {
    await db
      .update(productOrders)
      .set({
        paymentStatus: status as any,
        updatedAt: new Date(),
      })
      .where(eq(productOrders.id, orderId))
  } catch (error) {
    console.error('Error in updatePaymentStatus:', error)
    throw error
  }
}

/**
 * Get order analytics for a site
 */
export async function getOrderAnalytics(siteId: string): Promise<{
  totalOrders: number
  freeSignups: number
  paidPurchases: number
  totalRevenue: number
  clickedRate: number
}> {
  try {
    await verifySiteOwnership(siteId)

    const orders = await db
      .select()
      .from(productOrders)
      .where(eq(productOrders.siteId, siteId))

    const mapped = orders.map(toProductOrder)

    const freeSignups = mapped.filter((o) => o.order_type === 'lead_magnet')
    const paidPurchases = mapped.filter((o) => o.order_type === 'paid_purchase')
    const clickedOrders = mapped.filter((o) => o.clicked_at !== null)

    const totalRevenue = paidPurchases.reduce(
      (sum, order) => sum + (order.amount_total || 0),
      0
    )

    return {
      totalOrders: mapped.length,
      freeSignups: freeSignups.length,
      paidPurchases: paidPurchases.length,
      totalRevenue: totalRevenue / 100, // Convert cents to dollars
      clickedRate:
        mapped.length > 0 ? (clickedOrders.length / mapped.length) * 100 : 0,
    }
  } catch (error) {
    console.error('Error in getOrderAnalytics:', error)
    throw error
  }
}
