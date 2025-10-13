'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { createCheckoutSession } from '@/lib/actions/stripe/checkout-actions'
import { Check, Loader2 } from 'lucide-react'

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
  name: string
}

interface CheckoutFormProps {
  product: Product
  selectedTier: PricingTier
  checkoutSettings: CheckoutSettings
}

export function CheckoutForm({
  product,
  selectedTier,
  checkoutSettings,
}: CheckoutFormProps) {
  const router = useRouter()
  const [selectedBumps, setSelectedBumps] = useState<Set<string>>(
    new Set(
      checkoutSettings.orderBumps
        .filter((bump) => bump.isPreSelected)
        .map((bump) => bump.id)
    )
  )
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const toggleBump = (bumpId: string) => {
    setSelectedBumps((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(bumpId)) {
        newSet.delete(bumpId)
      } else {
        newSet.add(bumpId)
      }
      return newSet
    })
  }

  // Calculate total price
  const getTotalPrice = () => {
    // Parse the main tier price (remove $ and convert to number)
    const mainPrice = parseFloat(selectedTier.price.replace(/[^0-9.-]+/g, ''))

    // Add selected order bump prices
    const bumpsTotal = checkoutSettings.orderBumps
      .filter((bump) => selectedBumps.has(bump.id))
      .reduce((sum, bump) => sum + bump.price, 0)

    return mainPrice + bumpsTotal
  }

  const handleCheckout = async () => {
    setIsLoading(true)
    setError(null)

    try {
      // Get selected order bumps
      const selectedOrderBumps = checkoutSettings.orderBumps.filter((bump) =>
        selectedBumps.has(bump.id)
      )

      // Replace [slug] placeholder in URLs
      const successUrl = checkoutSettings.successUrl.replace('[slug]', product.slug)
      const cancelUrl = checkoutSettings.cancelUrl.replace('[slug]', product.slug)

      // Create checkout session
      const result = await createCheckoutSession({
        productSlug: product.slug,
        productName: product.name,
        mainPriceId: selectedTier.stripePriceId,
        selectedBumps: selectedOrderBumps,
        mode: checkoutSettings.mode,
        successUrl,
        cancelUrl,
      })

      if (!result.success || !result.url) {
        throw new Error(result.error || 'Failed to create checkout session')
      }

      // Redirect to Stripe checkout
      window.location.href = result.url
    } catch (err) {
      console.error('Checkout error:', err)
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-2">Checkout</h1>
        <p className="text-muted-foreground">Complete your purchase</p>
      </div>

      {/* Order Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Order Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Main Product */}
          <div className="flex items-start justify-between pb-4 border-b">
            <div className="flex-1">
              <h3 className="font-semibold text-lg">{selectedTier.name}</h3>
              <p className="text-sm text-muted-foreground">{selectedTier.description}</p>

              {/* Features */}
              <ul className="mt-3 space-y-2">
                {selectedTier.features.slice(0, 3).map((feature, index) => (
                  <li key={index} className="flex items-center gap-2 text-sm">
                    <Check className="h-4 w-4 text-primary flex-shrink-0" />
                    <span>{feature}</span>
                  </li>
                ))}
                {selectedTier.features.length > 3 && (
                  <li className="text-sm text-muted-foreground ml-6">
                    +{selectedTier.features.length - 3} more features
                  </li>
                )}
              </ul>
            </div>
            <div className="text-right ml-4">
              <div className="text-2xl font-bold">{selectedTier.price}</div>
              <div className="text-sm text-muted-foreground">{selectedTier.period}</div>
            </div>
          </div>

          {/* Order Bumps */}
          {checkoutSettings.orderBumps.length > 0 && (
            <div className="space-y-3">
              <h4 className="font-semibold">Add to your order</h4>
              {checkoutSettings.orderBumps.map((bump) => (
                <div
                  key={bump.id}
                  className={`border rounded-lg p-4 cursor-pointer transition-colors ${
                    selectedBumps.has(bump.id)
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  }`}
                  onClick={() => toggleBump(bump.id)}
                >
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={selectedBumps.has(bump.id)}
                      onCheckedChange={() => toggleBump(bump.id)}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="flex items-start justify-between">
                        <div>
                          <h5 className="font-semibold">{bump.title}</h5>
                          <p className="text-sm text-muted-foreground mt-1">
                            {bump.description}
                          </p>
                        </div>
                        <div className="text-right ml-4">
                          <div className="font-semibold">
                            ${bump.price.toFixed(2)}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Total */}
          <div className="pt-4 border-t">
            <div className="flex items-center justify-between text-lg">
              <span className="font-semibold">Total</span>
              <div className="text-right">
                <div className="text-2xl font-bold">
                  ${getTotalPrice().toFixed(2)}
                </div>
                <div className="text-sm text-muted-foreground">
                  {checkoutSettings.mode === 'subscription' ? selectedTier.period : 'one-time'}
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Error Message */}
      {error && (
        <div className="bg-destructive/10 border border-destructive text-destructive px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Checkout Button */}
      <div className="space-y-4">
        <Button
          onClick={handleCheckout}
          disabled={isLoading}
          className="w-full py-6 text-lg"
          size="lg"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Processing...
            </>
          ) : (
            `Proceed to Payment`
          )}
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          Secure checkout powered by Stripe
        </p>
      </div>

      {/* Back Link */}
      <div className="text-center">
        <Button
          variant="ghost"
          onClick={() => router.push(`/products/${product.slug}`)}
          disabled={isLoading}
        >
          ← Back to Product
        </Button>
      </div>
    </div>
  )
}
