'use client'

import { useState, useEffect, useRef } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from '@stripe/react-stripe-js'
import { createCheckoutSession } from '@/lib/actions/stripe/checkout-actions'
import { Loader2 } from 'lucide-react'

interface OrderBump {
  id: string
  title: string
  description: string
  price: number
  stripePriceId: string
  isPreSelected: boolean
}

interface CheckoutSettings {
  enabled: boolean
  successUrl: string
}

interface PricingTier {
  id: string
  name: string
  price: string
  period: string
  description: string
  features: string[]
  stripePriceId: string
  orderBumps?: OrderBump[]
}

interface Product {
  id: string
  slug: string
  title: string
}

interface EmbeddedCheckoutWrapperProps {
  product: Product
  selectedTier: PricingTier
  checkoutSettings: CheckoutSettings
  selectedBumps: string[]
  stripePublishableKey?: string
}

export function EmbeddedCheckoutWrapper({
  product,
  selectedTier,
  checkoutSettings,
  selectedBumps,
  stripePublishableKey,
}: EmbeddedCheckoutWrapperProps) {
  const resolvedKey = stripePublishableKey || process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
  const stripePromiseRef = useRef(resolvedKey ? loadStripe(resolvedKey) : null)

  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Reset state when selectedBumps changes to force recreation
    setClientSecret(null)
    setError(null)

    const createSession = async () => {
      try {
        // Get selected order bumps from the selected tier
        const tierOrderBumps = selectedTier.orderBumps || []
        const selectedOrderBumps = tierOrderBumps.filter((bump) =>
          selectedBumps.includes(bump.id)
        )

        // Replace [slug] placeholder in URLs
        const successUrl = checkoutSettings.successUrl.replace('[slug]', product.slug)

        // Create checkout session with embedded mode
        const result = await createCheckoutSession({
          productSlug: product.slug,
          productName: product.title,
          mainPriceId: selectedTier.stripePriceId,
          tierId: selectedTier.id,
          tierName: selectedTier.name,
          selectedBumps: selectedOrderBumps,
          successUrl,
          uiMode: 'embedded',
        })

        if (!result.success || !result.clientSecret) {
          throw new Error(result.error || 'Failed to create checkout session')
        }

        setClientSecret(result.clientSecret)
      } catch (err) {
        console.error('Checkout error:', err)
        setError(err instanceof Error ? err.message : 'Something went wrong')
      }
    }

    createSession()
  }, [product, selectedTier, checkoutSettings, selectedBumps])

  if (!stripePromiseRef.current) {
    return (
      <div className="bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded-lg">
        Stripe configuration error. Please check your environment variables.
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded-lg">
        {error}
      </div>
    )
  }

  if (!clientSecret) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <EmbeddedCheckoutProvider
      stripe={stripePromiseRef.current}
      options={{ clientSecret }}
    >
      <EmbeddedCheckout />
    </EmbeddedCheckoutProvider>
  )
}
