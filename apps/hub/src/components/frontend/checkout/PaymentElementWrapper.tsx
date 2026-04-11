'use client'

import { useState, useEffect, useRef } from 'react'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

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
  enableOrderBumps?: boolean
  orderBumps?: OrderBump[]
}

interface Product {
  id: string
  slug: string
  title: string
}

interface PaymentElementWrapperProps {
  product: Product
  siteId: string
  selectedTier: PricingTier
  checkoutSettings: CheckoutSettings
  selectedBumps: string[]
  stripePublishableKey?: string
}

function CheckoutForm({
  product,
  checkoutSettings,
  totalAmount,
  isUpdating,
}: {
  product: Product;
  checkoutSettings: CheckoutSettings;
  totalAmount: number;
  isUpdating: boolean;
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [isProcessing, setIsProcessing] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [email, setEmail] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!stripe || !elements) {
      return
    }

    // Wait for any pending updates to complete
    if (isUpdating) {
      setErrorMessage('Please wait while we update your order...')
      return
    }

    setIsProcessing(true)
    setErrorMessage(null)

    // Add a small delay to ensure payment intent update has propagated
    await new Promise(resolve => setTimeout(resolve, 500))

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${process.env.NEXT_PUBLIC_APP_DOMAIN}${checkoutSettings.successUrl.replace('[slug]', product.slug)}`,
        payment_method_data: {
          billing_details: {
            email: email,
          },
        },
      },
    })

    if (error) {
      setErrorMessage(error.message || 'An error occurred')
      setIsProcessing(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="email" className="text-sm font-semibold">Email</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="your@email.com"
          required
          className="bg-gray-50 border-none shadow-none py-[12.6px] px-3 h-auto focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-0"
        />
      </div>

      <PaymentElement
        options={{
          wallets: {
            link: 'never'
          },
          fields: {
            billingDetails: {
              email: 'never'
            }
          },
          layout: 'tabs',
          paymentMethodOrder: ['card']
        }}
      />

      {errorMessage && (
        <div className="bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded-lg text-sm">
          {errorMessage}
        </div>
      )}

      <Button
        type="submit"
        disabled={!stripe || isProcessing || isUpdating}
        className="w-full"
        size="lg"
      >
        {isUpdating ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Updating order...
          </>
        ) : isProcessing ? (
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
  siteId,
  selectedTier,
  checkoutSettings,
  selectedBumps,
  stripePublishableKey,
}: PaymentElementWrapperProps) {
  const resolvedKey = stripePublishableKey
  const stripePromiseRef = useRef(resolvedKey ? loadStripe(resolvedKey) : null)

  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [totalAmount, setTotalAmount] = useState<number>(0)
  const [paymentIntentId, setPaymentIntentId] = useState<string | null>(null)
  const [isUpdating, setIsUpdating] = useState(false)
  const previousBumps = useRef<string[]>(selectedBumps)
  const hasInitialized = useRef(false)

  // Create payment intent only once on mount
  useEffect(() => {
    if (!siteId) {
      setError('Stripe configuration error. Please check your site settings.')
      return
    }

    if (!stripePromiseRef.current) {
      return
    }

    // Prevent double execution in React Strict Mode
    if (hasInitialized.current) {
      return
    }

    // Set immediately to prevent race condition with Strict Mode double mount
    hasInitialized.current = true

    const createIntent = async () => {
      try {
        // Get initial order bumps from the selected tier
        const tierOrderBumps = selectedTier.enableOrderBumps ? selectedTier.orderBumps || [] : []
        const selectedOrderBumps = tierOrderBumps.filter((bump) =>
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
          tierId: selectedTier.id,
          tierName: selectedTier.name,
          selectedBumps: selectedOrderBumps,
          siteId,
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
    // Don't run until initial payment intent is created
    if (!hasInitialized.current || !paymentIntentId) {
      previousBumps.current = selectedBumps
      return
    }

    // Check if bumps actually changed (order-independent comparison)
    const currentSet = new Set(selectedBumps)
    const previousSet = new Set(previousBumps.current)

    const bumpsChanged =
      currentSet.size !== previousSet.size ||
      [...currentSet].some(id => !previousSet.has(id))

    if (!bumpsChanged) {
      return
    }

    previousBumps.current = selectedBumps

    const updateIntent = async () => {
      try {
        setIsUpdating(true)

        // Get current order bumps from the selected tier
        const tierOrderBumps = selectedTier.enableOrderBumps ? selectedTier.orderBumps || [] : []
        const selectedOrderBumps = tierOrderBumps.filter((bump) =>
          selectedBumps.includes(bump.id)
        )

        // Calculate new total
        const tierPrice = parseFloat(selectedTier.price.replace(/[^0-9.-]+/g, ''))
        const bumpsTotal = selectedOrderBumps.reduce((sum, bump) => sum + bump.price, 0)
        const total = (tierPrice + bumpsTotal) * 100
        setTotalAmount(total)

        // Update existing payment intent with new amount
        const result = await updatePaymentIntent({
          paymentIntentId,
          mainPriceId: selectedTier.stripePriceId,
          selectedBumps: selectedOrderBumps,
          siteId,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBumps])

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
      stripe={stripePromiseRef.current}
      options={{
        clientSecret,
        appearance,
      }}
    >
      <CheckoutForm
        product={product}
        checkoutSettings={checkoutSettings}
        totalAmount={totalAmount}
        isUpdating={isUpdating}
      />
    </Elements>
  )
}
