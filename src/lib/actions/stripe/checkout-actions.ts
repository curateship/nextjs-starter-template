'use server'

import Stripe from 'stripe'

// Initialize Stripe with secret key
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder', {
  apiVersion: '2025-09-30.clover',
})

export interface OrderBump {
  id: string
  title: string
  description: string
  price: number
  stripePriceId: string
  isPreSelected: boolean
  imageUrl?: string
}

export interface CheckoutSessionData {
  productSlug: string
  productName: string
  mainPriceId: string
  selectedBumps: OrderBump[]
  mode: 'payment' | 'subscription'
  successUrl: string
  cancelUrl: string
  uiMode?: 'hosted' | 'embedded'
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
    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: data.mode,
      line_items: lineItems,
      metadata: {
        productSlug: data.productSlug,
        productName: data.productName,
      },
      allow_promotion_codes: true,
      billing_address_collection: 'required',
    }

    // Add UI mode specific parameters
    if (data.uiMode === 'embedded') {
      sessionParams.ui_mode = 'embedded'
      sessionParams.return_url = `${process.env.NEXT_PUBLIC_APP_DOMAIN}${data.successUrl}?session_id={CHECKOUT_SESSION_ID}`
    } else {
      sessionParams.success_url = `${process.env.NEXT_PUBLIC_APP_DOMAIN}${data.successUrl}?session_id={CHECKOUT_SESSION_ID}`
      sessionParams.cancel_url = `${process.env.NEXT_PUBLIC_APP_DOMAIN}${data.cancelUrl}`
    }

    const session = await stripe.checkout.sessions.create(sessionParams)

    return {
      success: true,
      sessionId: session.id,
      url: session.url,
      clientSecret: session.client_secret,
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
 * Create a Payment Intent for Payment Element
 */
export async function createPaymentIntent(data: {
  productSlug: string
  productName: string
  mainPriceId: string
  selectedBumps: OrderBump[]
  mode: 'payment' | 'subscription'
}) {
  try {
    // Get price details to calculate amount
    const mainPrice = await stripe.prices.retrieve(data.mainPriceId)

    let totalAmount = mainPrice.unit_amount || 0

    // Add order bump amounts
    for (const bump of data.selectedBumps) {
      const bumpPrice = await stripe.prices.retrieve(bump.stripePriceId)
      totalAmount += bumpPrice.unit_amount || 0
    }

    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: totalAmount,
      currency: mainPrice.currency || 'usd',
      metadata: {
        productSlug: data.productSlug,
        productName: data.productName,
        mainPriceId: data.mainPriceId,
        orderBumps: JSON.stringify(data.selectedBumps.map(b => ({
          id: b.id,
          title: b.title,
          priceId: b.stripePriceId,
        }))),
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
}) {
  try {
    // Get price details to calculate new amount
    const mainPrice = await stripe.prices.retrieve(data.mainPriceId)

    let totalAmount = mainPrice.unit_amount || 0

    // Add order bump amounts
    for (const bump of data.selectedBumps) {
      const bumpPrice = await stripe.prices.retrieve(bump.stripePriceId)
      totalAmount += bumpPrice.unit_amount || 0
    }

    // Update payment intent
    const paymentIntent = await stripe.paymentIntents.update(data.paymentIntentId, {
      amount: totalAmount,
      metadata: {
        orderBumps: JSON.stringify(data.selectedBumps.map(b => ({
          id: b.id,
          title: b.title,
          priceId: b.stripePriceId,
        }))),
      },
    })

    return {
      success: true,
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

/**
 * Verify a payment intent and retrieve details
 */
export async function verifyPaymentIntent(paymentIntentId: string) {
  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId)

    if (paymentIntent.status !== 'succeeded') {
      return {
        success: false,
        error: 'Payment not completed',
      }
    }

    return {
      success: true,
      paymentIntent: {
        id: paymentIntent.id,
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
