'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Check } from 'lucide-react'
import { PaymentElementWrapper } from './PaymentElementWrapper'
import Image from 'next/image'

interface OrderBump {
  id: string
  title: string
  description: string
  price: number
  stripePriceId: string
  isPreSelected: boolean
  imageUrl?: string
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
  description?: string
  featuredImage?: string
}

interface Site {
  name: string
  logo?: string
  favicon?: string
}

interface CheckoutFormProps {
  product: Product
  site: Site
  selectedTier: PricingTier
  checkoutSettings: CheckoutSettings
}

export function CheckoutForm({
  product,
  site,
  selectedTier,
  checkoutSettings,
}: CheckoutFormProps) {
  const router = useRouter()

  // Get order bumps from the selected tier
  const tierOrderBumps = selectedTier.orderBumps || []

  const [selectedBumps, setSelectedBumps] = useState<Set<string>>(
    new Set(
      tierOrderBumps
        .filter((bump) => bump.isPreSelected)
        .map((bump) => bump.id)
    )
  )

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

  // Memoize the selected bumps array to prevent unnecessary re-renders
  const selectedBumpsArray = useMemo(() => Array.from(selectedBumps), [selectedBumps])

  // Calculate total price
  const getTotalPrice = () => {
    // Parse the main tier price (remove $ and convert to number)
    const mainPrice = parseFloat(selectedTier.price.replace(/[^0-9.-]+/g, ''))

    // Add selected order bump prices
    const bumpsTotal = tierOrderBumps
      .filter((bump) => selectedBumps.has(bump.id))
      .reduce((sum, bump) => sum + bump.price, 0)

    return mainPrice + bumpsTotal
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        {/* Logo/Brand */}
        <div className="flex items-center justify-center gap-2 mb-6 pt-4">
          {(site.logo || site.favicon) && (
            <div className="relative w-8 h-8 flex-shrink-0">
              <Image
                src={site.logo || site.favicon || ''}
                alt={site.name}
                fill
                className="object-contain"
              />
            </div>
          )}
          <span className="font-semibold text-lg">{site.name}</span>
        </div>

        <Card className="shadow-lg overflow-hidden border-0">
          <div className="flex flex-col lg:flex-row">
            {/* Left Column - Product Info with light gray background */}
            <div className="bg-gray-50 p-8 lg:p-12 space-y-6 flex-1">
              {/* Product Title and Price */}
              <div className="flex items-center justify-between">
                <h1 className="text-2xl font-semibold">{product.title}</h1>
                <div className="text-2xl font-semibold">{selectedTier.price}</div>
              </div>

              {/* Product Image */}
              {product.featuredImage && (
                <div className="relative w-full aspect-video rounded-lg overflow-hidden border border-border">
                  <Image
                    src={product.featuredImage}
                    alt={product.title}
                    fill
                    className="object-cover"
                  />
                </div>
              )}

              {/* Product Description */}
              {selectedTier.description && (
                <p className="text-base leading-relaxed">
                  {selectedTier.description}
                </p>
              )}

              {/* Order Bumps */}
              {tierOrderBumps.length > 0 && (
                <div className="space-y-3">
                  {tierOrderBumps.map((bump) => (
                    <div
                      key={bump.id}
                      className={`border-2 rounded-xl p-5 cursor-pointer transition-all bg-white ${
                        selectedBumps.has(bump.id)
                          ? 'border-foreground'
                          : 'border-gray-300 hover:border-gray-400'
                      }`}
                      onClick={() => toggleBump(bump.id)}
                    >
                      <div className="flex items-start gap-4">
                        <Checkbox
                          checked={selectedBumps.has(bump.id)}
                          onCheckedChange={(checked) => {
                            toggleBump(bump.id)
                          }}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-1"
                        />
                        <div className="flex-1 flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <h5 className="font-medium mb-3">{bump.title}</h5>
                            {bump.imageUrl && (
                              <div className="relative w-full aspect-square max-w-sm mb-3 rounded-lg overflow-hidden border border-border">
                                <Image
                                  src={bump.imageUrl}
                                  alt={bump.title}
                                  fill
                                  className="object-cover"
                                />
                              </div>
                            )}
                            <p className="text-base text-muted-foreground mt-0.5">
                              {bump.description}
                            </p>
                          </div>
                          <div className="text-lg font-semibold whitespace-nowrap">
                            ${bump.price.toFixed(2)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Footer */}
              <div className="pt-4 flex items-center gap-2 text-sm text-muted-foreground">
                {site.favicon && (
                  <div className="relative w-4 h-4">
                    <Image
                      src={site.favicon}
                      alt=""
                      fill
                      className="object-contain"
                    />
                  </div>
                )}
                <span>Made with care at {site.name}</span>
              </div>
            </div>

            {/* Right Column - Payment Element with white background */}
            <div className="bg-white p-8 lg:p-12 flex-1">
              <PaymentElementWrapper
                product={product}
                selectedTier={selectedTier}
                checkoutSettings={checkoutSettings}
                selectedBumps={selectedBumpsArray}
              />
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
