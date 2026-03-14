'use server'

import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'
import { createServerSupabaseClient } from '@/lib/supabase/server'

// Create admin client with service role key
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
)

/**
 * Verify the authenticated user owns the given site.
 */
async function verifySiteOwnership(siteId: string): Promise<void> {
  const supabase = await createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) throw new Error('Authentication required')

  const { data: site } = await supabaseAdmin
    .from('sites')
    .select('id')
    .eq('id', siteId)
    .eq('user_id', user.id)
    .single()

  if (!site) throw new Error('Site not found or access denied')
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

    const { data, error } = await supabaseAdmin
      .from('product_orders')
      .insert({
        site_id: params.siteId,
        product_id: params.productId,
        customer_email: params.email.toLowerCase().trim(),
        order_type: 'lead_magnet',
        access_token: accessToken,
        metadata: params.metadata || null,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating free signup:', error)
      throw new Error(`Failed to create signup: ${error.message}`)
    }

    return data
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

    const { data, error } = await supabaseAdmin
      .from('product_orders')
      .insert({
        site_id: params.siteId,
        product_id: params.productId,
        customer_email: params.email.toLowerCase().trim(),
        order_type: 'paid_purchase',
        stripe_session_id: params.stripeSessionId,
        stripe_payment_intent_id: params.stripePaymentIntentId,
        amount_total: params.amountTotal,
        currency: params.currency,
        payment_status: params.paymentStatus || 'succeeded',
        access_token: accessToken,
        metadata: params.metadata || null,
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating paid order:', error)
      throw new Error(`Failed to create order: ${error.message}`)
    }

    return data
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

    const { data, error } = await supabaseAdmin
      .from('product_orders')
      .select('*')
      .eq('access_token', token)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned
        return null
      }
      console.error('Error fetching order by token:', error)
      throw new Error(`Failed to fetch order: ${error.message}`)
    }

    return data
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

    const { data, error } = await supabaseAdmin
      .from('product_orders')
      .select('*')
      .eq('stripe_session_id', stripeSessionId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return null
      }
      console.error('Error fetching order by Stripe session:', error)
      throw new Error(`Failed to fetch order: ${error.message}`)
    }

    return data
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

    const { data, error } = await supabaseAdmin
      .from('product_orders')
      .select('*')
      .eq('customer_email', email.toLowerCase().trim())
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching orders by email:', error)
      throw new Error(`Failed to fetch orders: ${error.message}`)
    }

    return data || []
  } catch (error) {
    console.error('Error in getOrdersByEmail:', error)
    return []
  }
}

/**
 * Get all orders for a site
 */
export async function getOrdersBySite(
  siteId: string,
  options?: { page?: number; pageSize?: number }
): Promise<{ data: ProductOrder[]; total: number }> {
  try {
    await verifySiteOwnership(siteId)

    const page = options?.page ?? 1
    const pageSize = options?.pageSize ?? 50
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    const { data, error, count } = await supabaseAdmin
      .from('product_orders')
      .select('*', { count: 'exact' })
      .eq('site_id', siteId)
      .order('created_at', { ascending: false })
      .range(from, to)

    if (error) {
      console.error('Error fetching orders by site:', error)
      return { data: [], total: 0 }
    }

    return { data: data || [], total: count ?? 0 }
  } catch (error) {
    console.error('Error in getOrdersBySite:', error)
    return { data: [], total: 0 }
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
    const { data: product } = await supabaseAdmin
      .from('products')
      .select('site_id')
      .eq('id', productId)
      .single()

    if (!product) throw new Error('Product not found')
    await verifySiteOwnership(product.site_id)

    const { data, error } = await supabaseAdmin
      .from('product_orders')
      .select('*')
      .eq('product_id', productId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching orders by product:', error)
      throw new Error(`Failed to fetch orders: ${error.message}`)
    }

    return data || []
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

    const { error } = await supabaseAdmin
      .from('product_orders')
      .update({
        email_sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId)

    if (error) {
      console.error('Error marking email sent:', error)
      throw new Error(`Failed to mark email sent: ${error.message}`)
    }
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

    // Atomic increment to avoid race condition with concurrent clicks
    const now = new Date().toISOString()
    const { data, error } = await supabaseAdmin.rpc('increment_click_count', {
      p_token: token,
      p_now: now,
    })

    if (error) {
      // Fallback if RPC doesn't exist yet: use regular update
      const order = await getOrderByToken(token)
      if (!order) throw new Error('Order not found')

      const { data: updated, error: updateError } = await supabaseAdmin
        .from('product_orders')
        .update({
          click_count: order.click_count + 1,
          clicked_at: order.clicked_at || now,
          updated_at: now,
        })
        .eq('id', order.id)
        .select()
        .single()

      if (updateError) throw new Error(`Failed to mark link clicked: ${updateError.message}`)
      return updated
    }

    return data
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

    const { error } = await supabaseAdmin
      .from('product_orders')
      .update({
        flodesk_added_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId)

    if (error) {
      console.error('Error marking Flodesk added:', error)
      throw new Error(`Failed to mark Flodesk added: ${error.message}`)
    }
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
    // Verify ownership: check that all orders belong to a site the user owns
    if (orderIds.length === 0) return

    const { data: orders } = await supabaseAdmin
      .from('product_orders')
      .select('site_id')
      .in('id', orderIds)

    if (!orders || orders.length === 0) throw new Error('Orders not found')

    const siteIds = [...new Set(orders.map(o => o.site_id))]
    for (const siteId of siteIds) {
      await verifySiteOwnership(siteId)
    }

    const { error } = await supabaseAdmin
      .from('product_orders')
      .delete()
      .in('id', orderIds)

    if (error) {
      console.error('Error deleting orders:', error)
      throw new Error(`Failed to delete orders: ${error.message}`)
    }
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

    const { error } = await supabaseAdmin
      .from('product_orders')
      .update({
        payment_status: status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId)

    if (error) {
      console.error('Error updating payment status:', error)
      throw new Error(`Failed to update payment status: ${error.message}`)
    }
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

    const { data, error } = await supabaseAdmin
      .from('product_orders')
      .select('*')
      .eq('site_id', siteId)

    if (error) {
      throw new Error(`Failed to fetch analytics: ${error.message}`)
    }

    const orders = data || []

    const freeSignups = orders.filter((o) => o.order_type === 'lead_magnet')
    const paidPurchases = orders.filter((o) => o.order_type === 'paid_purchase')
    const clickedOrders = orders.filter((o) => o.clicked_at !== null)

    const totalRevenue = paidPurchases.reduce(
      (sum, order) => sum + (order.amount_total || 0),
      0
    )

    return {
      totalOrders: orders.length,
      freeSignups: freeSignups.length,
      paidPurchases: paidPurchases.length,
      totalRevenue: totalRevenue / 100, // Convert cents to dollars
      clickedRate:
        orders.length > 0 ? (clickedOrders.length / orders.length) * 100 : 0,
    }
  } catch (error) {
    console.error('Error in getOrderAnalytics:', error)
    throw error
  }
}
