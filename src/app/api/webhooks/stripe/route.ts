import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getStripeConfig } from '@/lib/actions/integrations/config-helpers'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

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
    const { data: integrations } = await supabaseAdmin
      .from('site_integrations')
      .select('site_id, config')
      .eq('integration_type', 'stripe')
      .eq('is_enabled', true)

    if (!integrations || integrations.length === 0) {
      return NextResponse.json(
        { error: 'No Stripe integrations configured' },
        { status: 400 }
      )
    }

    let event: Stripe.Event | null = null

    for (const integration of integrations) {
      const webhookSecret = integration.config?.webhook_secret
      if (!webhookSecret) continue

      try {
        const stripe = new Stripe(integration.config.secret_key, {
          apiVersion: '2025-09-30.clover',
        })
        event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
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
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session

        console.log('Payment successful:', {
          sessionId: session.id,
          customerEmail: session.customer_details?.email,
          amount: session.amount_total,
          productSlug: session.metadata?.productSlug,
          siteId: session.metadata?.siteId,
        })

        // TODO: Paid product email delivery integration
        break
      }

      case 'checkout.session.expired': {
        const session = event.data.object as Stripe.Checkout.Session
        console.log('Checkout session expired:', session.id)
        break
      }

      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent
        console.log('Payment intent succeeded:', paymentIntent.id)
        break
      }

      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent
        console.log('Payment failed:', paymentIntent.id)
        break
      }

      default:
        console.log(`Unhandled event type: ${event.type}`)
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
