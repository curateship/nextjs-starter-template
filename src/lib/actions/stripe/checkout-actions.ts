'use server'

import Stripe from 'stripe'

// Initialize Stripe with secret key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-09-30.clover',
})

export interface OrderBump {
  id: string
  title: string
  description: string
  price: number
  stripePriceId: string
  isPreSelected: boolean
}

export interface CheckoutSessionData {
  productSlug: string
  productName: string
  mainPriceId: string
  selectedBumps: OrderBump[]
  mode: 'payment' | 'subscription'
  successUrl: string
  cancelUrl: string
}

/**
 * Create a Stripe Checkout Session with main product and order bumps
 */
export async function createCheckoutSession(data: CheckoutSessionData) {
  try {
    // Build line items array
    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = [
      {
        price: data.mainPriceId,
        quantity: 1,
      },
    ]

    // Add selected order bumps
    data.selectedBumps.forEach((bump) => {
      lineItems.push({
        price: bump.stripePriceId,
        quantity: 1,
      })
    })

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      mode: data.mode,
      line_items: lineItems,
      success_url: `${process.env.NEXT_PUBLIC_APP_DOMAIN}${data.successUrl}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_DOMAIN}${data.cancelUrl}`,
      metadata: {
        productSlug: data.productSlug,
        productName: data.productName,
      },
      allow_promotion_codes: true,
      billing_address_collection: 'required',
    })

    return {
      success: true,
      sessionId: session.id,
      url: session.url,
    }
  } catch (error) {
    console.error('Error creating checkout session:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create checkout session',
    }
  }
}

/**
 * Verify a checkout session and retrieve session details
 */
export async function verifyCheckoutSession(sessionId: string) {
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ['line_items', 'customer'],
    })

    if (session.payment_status !== 'paid') {
      return {
        success: false,
        error: 'Payment not completed',
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
 * Create a Stripe Price for a product (utility function for admin)
 */
export async function createStripePrice(params: {
  productName: string
  amount: number
  currency: string
  interval?: 'month' | 'year'
  intervalCount?: number
}) {
  try {
    // First, create or retrieve product
    const products = await stripe.products.search({
      query: `name:'${params.productName}'`,
    })

    let product: Stripe.Product

    if (products.data.length > 0) {
      product = products.data[0]
    } else {
      product = await stripe.products.create({
        name: params.productName,
      })
    }

    // Create price
    const priceData: Stripe.PriceCreateParams = {
      product: product.id,
      unit_amount: params.amount * 100, // Convert to cents
      currency: params.currency,
    }

    if (params.interval) {
      priceData.recurring = {
        interval: params.interval,
        interval_count: params.intervalCount || 1,
      }
    }

    const price = await stripe.prices.create(priceData)

    return {
      success: true,
      priceId: price.id,
      productId: product.id,
    }
  } catch (error) {
    console.error('Error creating Stripe price:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create price',
    }
  }
}
