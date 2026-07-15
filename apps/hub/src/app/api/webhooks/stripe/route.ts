import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getStripeConfig } from '@/lib/actions/integrations/config-helpers'
import { db } from '@/lib/db'
import { siteIntegrations } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getProductIdFromPurchaseMetadata, recordPaidPurchase } from '@/lib/actions/products/paid-purchase-recording'
import {
  activateDirectoryFeaturedEntitlement,
  isDirectoryFeaturedPurchaseMetadata,
} from '@/lib/actions/directories/directory-featured-activation'

/**
 * Stripe Webhook Handler
 * Resolves Stripe config per-site from the integration settings.
 * Each site must have its own webhook endpoint secret configured.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.text()
    const signature = req.headers.get('stripe-signature')

    if (!signature) {
      return NextResponse.json(
        { error: 'No signature provided' },
        { status: 400 }
      )
    }

    // We need to find which site this webhook belongs to.
    // Try all sites with Stripe integrations and verify signature against each.
    const integrations = await db
      .select({ siteId: siteIntegrations.siteId })
      .from(siteIntegrations)
      .where(eq(siteIntegrations.integrationType, 'stripe'))

    if (!integrations.length) {
      return NextResponse.json(
        { error: 'No Stripe integrations configured' },
        { status: 400 }
      )
    }

    let event: Stripe.Event | null = null
    let matchedStripe: Stripe | null = null
    let matchedSiteId: string | null = null

    for (const integration of integrations) {
      const config = await getStripeConfig(integration.siteId)
      if (!config?.webhookSecret) continue

      try {
        const stripe = new Stripe(config.secretKey, {
          apiVersion: '2025-10-29.clover',
        })
        event = stripe.webhooks.constructEvent(body, signature, config.webhookSecret)
        matchedStripe = stripe
        matchedSiteId = integration.siteId
        break
      } catch {
        // Signature didn't match this site, try next
        continue
      }
    }

    if (!event) {
      console.error('Webhook signature verification failed for all sites')
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 400 }
      )
    }

    // Handle the event
    switch (event.type) {
      // async_payment_succeeded is the paid signal for delayed payment methods
      // (bank debits etc.) whose checkout.session.completed arrives unpaid.
      // Both recordPaidPurchase and the featured activation are idempotent.
      case 'checkout.session.async_payment_succeeded':
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session

        if (isDirectoryFeaturedPurchaseMetadata(session.metadata)) {
          if (matchedSiteId) {
            const result = await activateDirectoryFeaturedEntitlement({
              siteId: matchedSiteId,
              metadata: session.metadata,
              paymentStatus: session.payment_status,
              stripeSessionId: session.id,
              stripePaymentIntentId: typeof session.payment_intent === 'string'
                ? session.payment_intent
                : session.payment_intent?.id ?? null,
              amountTotal: session.amount_total,
              currency: session.currency,
            })

            if (result.error) {
              console.error('Directory featured activation failed:', result.error)
            }
          }
          break
        }

        const customerEmail = session.customer_details?.email
        const sessionSiteId = matchedSiteId || session.metadata?.siteId
        const sessionProductId = sessionSiteId
          ? await getProductIdFromPurchaseMetadata(sessionSiteId, session.metadata)
          : null
        const sessionPaymentIntentId = typeof session.payment_intent === 'string'
          ? session.payment_intent
          : session.payment_intent?.id ?? null

        await recordPaidPurchase({
          siteId: sessionSiteId,
          productId: sessionProductId,
          customerEmail,
          stripeSessionId: session.id,
          stripePaymentIntentId: sessionPaymentIntentId,
          amountTotal: session.amount_total,
          currency: session.currency,
          paymentStatus: event.type === 'checkout.session.async_payment_succeeded' || session.payment_status === 'paid'
            ? 'succeeded'
            : 'pending',
          metadata: {
            stripe_event_type: event.type,
            product_slug: session.metadata?.productSlug || null,
            tier_id: session.metadata?.tierId || null,
            tier_name: session.metadata?.tierName || null,
          },
        })

        break
      }

      case 'checkout.session.expired': {
        break
      }

      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent

        // Directory featured upgrades are activated from checkout.session.completed
        // (or the success-redirect confirmation); the payment intent carries the
        // same metadata so it can be recognized and skipped here.
        if (isDirectoryFeaturedPurchaseMetadata(paymentIntent.metadata)) {
          break
        }

        let fullPaymentIntent = paymentIntent

        if (matchedStripe) {
          try {
            fullPaymentIntent = await matchedStripe.paymentIntents.retrieve(paymentIntent.id, {
              expand: ['latest_charge'],
            })
          } catch (err) {
            console.error('Failed to retrieve payment intent details:', err)
          }
        }

        const charge = typeof fullPaymentIntent.latest_charge === 'object'
          ? fullPaymentIntent.latest_charge as Stripe.Charge
          : null
        const customerEmail = fullPaymentIntent.receipt_email || charge?.billing_details?.email || null
        const intentSiteId = matchedSiteId || fullPaymentIntent.metadata?.siteId
        const intentProductId = intentSiteId
          ? await getProductIdFromPurchaseMetadata(intentSiteId, fullPaymentIntent.metadata)
          : null

        await recordPaidPurchase({
          siteId: intentSiteId,
          productId: intentProductId,
          customerEmail,
          stripePaymentIntentId: fullPaymentIntent.id,
          amountTotal: fullPaymentIntent.amount,
          currency: fullPaymentIntent.currency,
          paymentStatus: 'succeeded',
          metadata: {
            stripe_event_type: event.type,
            product_slug: fullPaymentIntent.metadata?.productSlug || null,
            tier_id: fullPaymentIntent.metadata?.tierId || null,
            tier_name: fullPaymentIntent.metadata?.tierName || null,
          },
        })

        break
      }

      case 'payment_intent.payment_failed': {
        break
      }

      default:
        break
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    )
  }
}
