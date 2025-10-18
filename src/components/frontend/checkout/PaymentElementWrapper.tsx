'use client'

import { useState, useEffect } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js'
import { createPaymentIntent, updatePaymentIntent } from '@/lib/actions/stripe/checkout-actions'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

// Initialize Stripe
const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
const stripePromise = publishableKey ? loadStripe(publishableKey) : null

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
  mode: 'payment' | 'subscription'
  successUrl: string
  cancelUrl: string
  orderBumps: OrderBump[]
}

interface PricingTier {
  id: string
  name: string
  price: string
  period: string
  description: string
  features: string[]
  stripePriceId: string
}

interface Product {
  id: string
  slug: string
  title: string
}

interface PaymentElementWrapperProps {
  product: Product
  selectedTier: PricingTier
  checkoutSettings: CheckoutSettings
  selectedBumps: string[]
}

function CheckoutForm({
  product,
  checkoutSettings,
  totalAmount
}: {
  product: Product;
  checkoutSettings: CheckoutSettings;
  totalAmount: number;
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [isProcessing, setIsProcessing] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!stripe || !elements) {
      return
    }

    setIsProcessing(true)
    setErrorMessage(null)

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${process.env.NEXT_PUBLIC_APP_DOMAIN}${checkoutSettings.successUrl.replace('[slug]', product.slug)}`,
      },
    })

    if (error) {
      setErrorMessage(error.message || 'An error occurred')
      setIsProcessing(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <PaymentElement />

      {errorMessage && (
        <div className="bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded-lg text-sm">
          {errorMessage}
        </div>
      )}

      <Button
        type="submit"
        disabled={!stripe || isProcessing}
        className="w-full"
        size="lg"
      >
        {isProcessing ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Processing...
          </>
        ) : (
          `Complete purchase for $${(totalAmount / 100).toFixed(2)}`
        )}
      </Button>
    </form>
  )
}

export function PaymentElementWrapper({
  product,
  selectedTier,
  checkoutSettings,
  selectedBumps,
}: PaymentElementWrapperProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [totalAmount, setTotalAmount] = useState<number>(0)
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null)
  const [isUpdating, setIsUpdating] = useState(false)

  // Create payment intent only once on mount
  useEffect(() => {
    const createIntent = async () => {
      try {
        // Get initial order bumps
        const selectedOrderBumps = checkoutSettings.orderBumps.filter((bump) =>
          selectedBumps.includes(bump.id)
        )

        // Calculate initial total
        const tierPrice = parseFloat(selectedTier.price.replace(/[^0-9.-]+/g, ''))
        const bumpsTotal = selectedOrderBumps.reduce((sum, bump) => sum + bump.price, 0)
        const total = (tierPrice + bumpsTotal) * 100
        setTotalAmount(total)

        // Create payment intent with initial bumps
        const result = await createPaymentIntent({
          productSlug: product.slug,
          productName: product.title,
          mainPriceId: selectedTier.stripePriceId,
          selectedBumps: selectedOrderBumps,
          mode: checkoutSettings.mode,
        })

        if (!result.success || !result.clientSecret) {
          throw new Error(result.error || 'Failed to create payment intent')
        }

        setClientSecret(result.clientSecret)
        setPaymentIntentId(result.paymentIntentId || null)
      } catch (err) {
        console.error('Payment error:', err)
        setError(err instanceof Error ? err.message : 'Something went wrong')
      }
    }

    createIntent()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Only run once on mount

  // Update payment intent amount when selectedBumps changes
  useEffect(() => {
    if (!paymentIntentId) return

    const updateIntent = async () => {
      try {
        setIsUpdating(true)

        // Get current order bumps
        const selectedOrderBumps = checkoutSettings.orderBumps.filter((bump) =>
          selectedBumps.includes(bump.id)
        )

        // Calculate new total
        const tierPrice = parseFloat(selectedTier.price.replace(/[^0-9.-]+/g, ''))
        const bumpsTotal = selectedOrderBumps.reduce((sum, bump) => sum + bump.price, 0)
        const total = (tierPrice + bumpsTotal) * 100
        setTotalAmount(total)

        // Update payment intent with new amount
        const result = await updatePaymentIntent({
          paymentIntentId,
          mainPriceId: selectedTier.stripePriceId,
          selectedBumps: selectedOrderBumps,
        })

        if (!result.success) {
          console.error('Failed to update payment intent:', result.error)
        }
      } catch (err) {
        console.error('Error updating payment intent:', err)
      } finally {
        setIsUpdating(false)
      }
    }

    updateIntent()
  }, [selectedBumps, paymentIntentId, checkoutSettings.orderBumps, selectedTier.price, selectedTier.stripePriceId])

  if (!stripePromise) {
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

  const appearance = {
    theme: 'stripe' as const,
    variables: {
      colorPrimary: '#000000',
      colorBackground: '#ffffff',
      colorText: '#000000',
      colorDanger: '#df1b41',
      fontFamily: 'system-ui, sans-serif',
      spacingUnit: '4px',
      borderRadius: '8px',
    },
    rules: {
      '.Input': {
        border: 'none',
        boxShadow: 'none',
        backgroundColor: '#f9fafb',
        padding: '12px',
      },
      '.Input:focus': {
        border: 'none',
        boxShadow: '0 0 0 2px #000000',
      },
      '.Label': {
        fontSize: '14px',
        fontWeight: '500',
        marginBottom: '8px',
      },
      '.Tab': {
        border: 'none',
        boxShadow: 'none',
      },
      '.Tab--selected': {
        border: 'none',
        boxShadow: 'none',
      },
      '.TabIcon': {
        border: 'none',
        boxShadow: 'none',
      },
      '.Block': {
        border: 'none',
        boxShadow: 'none',
      },
      '.BlockDivider': {
        display: 'none',
      },
      '.AccordionItem': {
        border: 'none',
        boxShadow: 'none',
      },
      '.PickerItem': {
        border: 'none',
        boxShadow: 'none',
      },
      '.PickerItem--selected': {
        border: 'none',
        boxShadow: 'none',
      },
    },
  }

  return (
    <Elements
      stripe={stripePromise}
      options={{
        clientSecret,
        appearance,
      }}
    >
      <CheckoutForm
        product={product}
        checkoutSettings={checkoutSettings}
        totalAmount={totalAmount}
      />
    </Elements>
  )
}
