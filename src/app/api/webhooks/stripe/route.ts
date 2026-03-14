import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getStripeConfig } from '@/lib/actions/integrations/config-helpers'
import { createClient } from '@supabase/supabase-js'
import { findActiveAutomations, enrollContact } from '@/lib/actions/newsletters/automation-actions'

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

        const customerEmail = session.customer_details?.email
        const sessionSiteId = session.metadata?.siteId
        const sessionProductId = session.metadata?.productId

        console.log('Payment successful:', {
          sessionId: session.id,
          customerEmail,
          amount: session.amount_total,
          productSlug: session.metadata?.productSlug,
          siteId: sessionSiteId,
        })

        // Add to newsletter contacts + enroll in automations
        if (customerEmail && sessionSiteId) {
          try {
            const { data: contact } = await supabaseAdmin
              .from('newsletter_contacts')
              .upsert({
                site_id: sessionSiteId,
                email: customerEmail.toLowerCase(),
                metadata: {
                  source: 'paid_purchase',
                  source_product_id: sessionProductId || null,
                },
              }, { onConflict: 'site_id,email' })
              .select('id')
              .single()

            if (contact) {
              // Enroll in purchase-triggered automations
              const automations = await findActiveAutomations(sessionSiteId, 'paid_purchase', sessionProductId)
              for (const automation of automations) {
                await enrollContact(automation.id, contact.id)
              }

              // Check if this purchase fulfills any automation goals
              const { data: enrollments } = await supabaseAdmin
                .from('email_automation_enrollments')
                .select('id, automation_id')
                .eq('contact_id', contact.id)
                .eq('status', 'active')

              for (const enrollment of enrollments || []) {
                const { data: automation } = await supabaseAdmin
                  .from('email_automations')
                  .select('goal_type, goal_config')
                  .eq('id', enrollment.automation_id)
                  .single()

                if (automation?.goal_type === 'purchase') {
                  const goalProductId = automation.goal_config?.product_id
                  if (!goalProductId || goalProductId === sessionProductId) {
                    await supabaseAdmin
                      .from('email_automation_enrollments')
                      .update({ status: 'goal_met', goal_met_at: new Date().toISOString() })
                      .eq('id', enrollment.id)
                  }
                }
              }
            }
          } catch (err) {
            console.error('Newsletter contact/enrollment error:', err)
          }
        }

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
