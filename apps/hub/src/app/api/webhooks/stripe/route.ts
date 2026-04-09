import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getStripeConfig } from '@/lib/actions/integrations/config-helpers'
import { db } from '@/lib/db'
import { siteIntegrations, newsletterContacts, emailAutomationEnrollments, emailAutomations } from '@/lib/db/schema'
import { eq, and, sql } from 'drizzle-orm'
import { findActiveAutomations, enrollContact } from '@/lib/actions/newsletters/automation-actions'

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
      .select({ siteId: siteIntegrations.siteId, config: siteIntegrations.config })
      .from(siteIntegrations)
      .where(and(
        eq(siteIntegrations.integrationType, 'stripe'),
        eq(siteIntegrations.isEnabled, true),
      ))

    if (!integrations.length) {
      return NextResponse.json(
        { error: 'No Stripe integrations configured' },
        { status: 400 }
      )
    }

    let event: Stripe.Event | null = null

    for (const integration of integrations) {
      const config = integration.config as Record<string, any>
      const webhookSecret = config?.webhook_secret
      if (!webhookSecret) continue

      try {
        const stripe = new Stripe(config.secret_key, {
          apiVersion: '2025-10-29.clover',
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
            const [contact] = await db
              .insert(newsletterContacts)
              .values({
                siteId: sessionSiteId,
                email: customerEmail.toLowerCase(),
                metadata: {
                  source: 'paid_purchase',
                  source_product_id: sessionProductId || null,
                },
              })
              .onConflictDoUpdate({
                target: [newsletterContacts.siteId, newsletterContacts.email],
                set: {
                  metadata: sql`coalesce(${newsletterContacts.metadata}, '{}'::jsonb) || ${JSON.stringify({
                    source: 'paid_purchase',
                    source_product_id: sessionProductId || null,
                  })}::jsonb`,
                  updatedAt: new Date(),
                },
              })
              .returning({ id: newsletterContacts.id })

            if (contact) {
              // Enroll in purchase-triggered automations
              const automations = await findActiveAutomations(sessionSiteId, 'paid_purchase', sessionProductId)
              for (const automation of automations) {
                await enrollContact(automation.id, contact.id)
              }

              // Check if this purchase fulfills any automation goals
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
                  if (!goalProductId || goalProductId === sessionProductId) {
                    await db
                      .update(emailAutomationEnrollments)
                      .set({ status: 'goal_met', goalMetAt: new Date() })
                      .where(eq(emailAutomationEnrollments.id, enrollment.id))
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
