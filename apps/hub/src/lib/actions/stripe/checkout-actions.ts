'use server'

import Stripe from 'stripe'
import { getStripeConfig } from '@/lib/actions/integrations/config-helpers'
import { db } from '@/lib/db'
import { products } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { UUID_REGEX } from '@/lib/utils/validation'

/**
 * Create a Stripe client for a specific site.
 * Reads from site integration config.
 */
async function getStripeClient(siteId: string | undefined): Promise<Stripe> {
  if (!siteId) {
    throw new Error('siteId is required for Stripe operations')
  }
  const config = await getStripeConfig(siteId)
  if (!config) {
    throw new Error('Stripe is not configured for this site. Add your Stripe keys in site Integration settings.')
  }

  return new Stripe(config.secretKey, {
    apiVersion: '2025-10-29.clover',
  })
}

export interface OrderBump {
  id: string
  title: string
  description: string
  price: number
  stripePriceId: string
  isPreSelected: boolean
  imageUrl?: string
}

type ResolvedOrderBump = Pick<OrderBump, 'id' | 'title' | 'stripePriceId'>

function getSelectedBumpIds(selectedBumps: Array<OrderBump | string>) {
  return selectedBumps
    .map((bump) => typeof bump === 'string' ? bump : bump.id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
}

function getCheckoutBlock(contentBlocks: Record<string, any>) {
  return Object.values(contentBlocks || {}).find((block: any) => block?.type === 'product-checkout') as any | undefined
}

async function resolveCheckoutSelection(data: {
  siteId?: string
  productId?: string
  tierId?: string
  mainPriceId?: string
  selectedBumps: Array<OrderBump | string>
}): Promise<{
  product: {
    id: string
    siteId: string
    title: string
    slug: string
  }
  tier: Record<string, any>
  selectedBumps: ResolvedOrderBump[]
  mainPriceId: string
  successUrl: string
}> {
  if (!data.siteId || !UUID_REGEX.test(data.siteId)) {
    throw new Error('Valid siteId is required')
  }
  if (!data.productId || !UUID_REGEX.test(data.productId)) {
    throw new Error('Valid productId is required')
  }

  const [product] = await db
    .select({
      id: products.id,
      siteId: products.siteId,
      title: products.title,
      slug: products.slug,
      isPublished: products.isPublished,
      contentBlocks: products.contentBlocks,
    })
    .from(products)
    .where(and(
      eq(products.id, data.productId),
      eq(products.siteId, data.siteId),
      eq(products.isPublished, true),
    ))
    .limit(1)

  if (!product) {
    throw new Error('Product not found')
  }

  const checkoutBlock = getCheckoutBlock((product.contentBlocks || {}) as Record<string, any>)
  const content = checkoutBlock?.content || {}
  const tiers = Array.isArray(content.productPricingTiers)
    ? content.productPricingTiers
    : Array.isArray(content.tiers)
      ? content.tiers
      : []
  const tier = tiers.find((item: any) => item?.id === data.tierId)

  if (!tier?.stripePriceId) {
    throw new Error('Selected checkout tier is not available')
  }
  if (data.mainPriceId && data.mainPriceId !== tier.stripePriceId) {
    throw new Error('Selected price does not match this product')
  }

  const selectedBumpIds = new Set(getSelectedBumpIds(data.selectedBumps))
  const allowedBumps = tier.enableOrderBumps && Array.isArray(tier.orderBumps) ? tier.orderBumps : []
  const selectedBumps = allowedBumps
    .filter((bump: any) => selectedBumpIds.has(bump.id) && bump.stripePriceId)
    .map((bump: any) => ({
      id: bump.id,
      title: String(bump.title || ''),
      stripePriceId: String(bump.stripePriceId),
    }))

  const checkoutSettings = content.checkoutSettings || {}
  const successUrl = typeof checkoutSettings.successUrl === 'string' && checkoutSettings.successUrl
    ? checkoutSettings.successUrl.replace('[slug]', product.slug)
    : `/products/${product.slug}/success`

  return {
    product,
    tier,
    selectedBumps,
    mainPriceId: String(tier.stripePriceId),
    successUrl,
  }
}

/**
 * Verify a checkout session and retrieve session details
 */
export async function verifyCheckoutSession(sessionId: string, siteId?: string) {
  try {
    const stripe = await getStripeClient(siteId)

    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['line_items', 'customer'],
    })

    if (session.payment_status !== 'paid') {
      return {
        success: false,
        error: 'Payment not completed',
      }
    }
    if (siteId && session.metadata?.siteId !== siteId) {
      return {
        success: false,
        error: 'Checkout session does not belong to this site',
      }
    }

    return {
      success: true,
      session: {
        id: session.id,
        customerEmail: session.customer_details?.email,
        amountTotal: session.amount_total,
        currency: session.currency,
        paymentStatus: session.payment_status,
        metadata: session.metadata,
        lineItems: session.line_items?.data.map((item) => ({
          description: item.description,
          amount: item.amount_total,
          quantity: item.quantity,
        })),
      },
    }
  } catch (error) {
    console.error('Error verifying checkout session:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to verify session',
    }
  }
}

/**
 * Create a Payment Intent for Payment Element
 */
export async function createPaymentIntent(data: {
  productId?: string
  productSlug: string
  productName: string
  mainPriceId: string
  tierId?: string
  tierName?: string
  selectedBumps: OrderBump[]
  siteId?: string
}) {
  try {
    const stripe = await getStripeClient(data.siteId)
    const selection = await resolveCheckoutSelection({
      siteId: data.siteId,
      productId: data.productId,
      tierId: data.tierId,
      mainPriceId: data.mainPriceId,
      selectedBumps: data.selectedBumps,
    })

    // Get price details to calculate amount
    const mainPrice = await stripe.prices.retrieve(selection.mainPriceId)

    let totalAmount = mainPrice.unit_amount || 0

    // Add order bump amounts
    for (const bump of selection.selectedBumps) {
      const bumpPrice = await stripe.prices.retrieve(bump.stripePriceId)
      totalAmount += bumpPrice.unit_amount || 0
    }

    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalAmount,
      currency: mainPrice.currency || 'usd',
      metadata: {
        productSlug: selection.product.slug,
        productName: selection.product.title,
        productId: selection.product.id,
        mainPriceId: selection.mainPriceId,
        tierId: selection.tier.id,
        tierName: selection.tier.name,
        siteId: selection.product.siteId,
        orderBumps: JSON.stringify(selection.selectedBumps),
      },
      automatic_payment_methods: {
        enabled: true,
      },
    })

    return {
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    }
  } catch (error) {
    console.error('Error creating payment intent:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create payment intent',
    }
  }
}

/**
 * Update a Payment Intent amount when order bumps change
 */
export async function updatePaymentIntent(data: {
  paymentIntentId: string
  mainPriceId: string
  selectedBumps: OrderBump[]
  siteId?: string
}) {
  try {
    const stripe = await getStripeClient(data.siteId)
    const existingIntent = await stripe.paymentIntents.retrieve(data.paymentIntentId)
    if (data.siteId && existingIntent.metadata?.siteId !== data.siteId) {
      throw new Error('Payment intent does not belong to this site')
    }

    const selection = await resolveCheckoutSelection({
      siteId: existingIntent.metadata?.siteId,
      productId: existingIntent.metadata?.productId,
      tierId: existingIntent.metadata?.tierId,
      mainPriceId: existingIntent.metadata?.mainPriceId || data.mainPriceId,
      selectedBumps: data.selectedBumps,
    })

    // Get price details to calculate new amount
    const mainPrice = await stripe.prices.retrieve(selection.mainPriceId)

    let totalAmount = mainPrice.unit_amount || 0

    // Add order bump amounts
    for (const bump of selection.selectedBumps) {
      const bumpPrice = await stripe.prices.retrieve(bump.stripePriceId)
      totalAmount += bumpPrice.unit_amount || 0
    }

    // Update payment intent
    const paymentIntent = await stripe.paymentIntents.update(data.paymentIntentId, {
      amount: totalAmount,
      metadata: {
        orderBumps: JSON.stringify(selection.selectedBumps),
      },
    })

    return {
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntent: {
        id: paymentIntent.id,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
      },
    }
  } catch (error) {
    console.error('Error updating payment intent:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update payment intent',
    }
  }
}

export async function updatePaymentIntentCustomer(data: {
  paymentIntentId: string
  email: string
  siteId?: string
}) {
  try {
    const stripe = await getStripeClient(data.siteId)
    const existingIntent = await stripe.paymentIntents.retrieve(data.paymentIntentId)
    if (data.siteId && existingIntent.metadata?.siteId !== data.siteId) {
      throw new Error('Payment intent does not belong to this site')
    }

    await stripe.paymentIntents.update(data.paymentIntentId, {
      receipt_email: data.email,
      metadata: {
        customerEmail: data.email,
      },
    })

    return { success: true }
  } catch (error) {
    console.error('Error updating payment intent customer:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update payment intent customer',
    }
  }
}

/**
 * Verify a payment intent and retrieve details
 */
export async function verifyPaymentIntent(paymentIntentId: string, siteId?: string) {
  try {
    const stripe = await getStripeClient(siteId)

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId, {
      expand: ['latest_charge'],
    })

    if (paymentIntent.status !== 'succeeded') {
      return {
        success: false,
        error: 'Payment not completed',
      }
    }
    if (siteId && paymentIntent.metadata?.siteId !== siteId) {
      return {
        success: false,
        error: 'Payment does not belong to this site',
      }
    }

    return {
      success: true,
      paymentIntent: {
        id: paymentIntent.id,
        customerEmail: paymentIntent.receipt_email || (paymentIntent.latest_charge && typeof paymentIntent.latest_charge === 'object' ? paymentIntent.latest_charge.billing_details?.email : null) || paymentIntent.metadata?.customerEmail || null,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        status: paymentIntent.status,
        metadata: paymentIntent.metadata,
      },
    }
  } catch (error) {
    console.error('Error verifying payment intent:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to verify payment',
    }
  }
}

