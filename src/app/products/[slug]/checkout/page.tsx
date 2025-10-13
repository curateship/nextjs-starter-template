import { notFound, redirect } from 'next/navigation'
import { getProductBySlugDirect } from '@/lib/actions/products/product-frontend-actions'
import { CheckoutForm } from '@/components/frontend/checkout/CheckoutForm'

interface CheckoutPageProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ tier?: string }>
}

export default async function CheckoutPage({ params, searchParams }: CheckoutPageProps) {
  const { slug } = await params
  const { tier: tierId } = await searchParams

  // Fetch product data
  const result = await getProductBySlugDirect(slug)

  if (!result.success || !result.product) {
    notFound()
  }

  const product = result.product

  // Get pricing block data
  const pricingBlockData = product.blocks?.find((block: any) => block.type === 'product-pricing')
  const checkoutSettings = pricingBlockData?.content?.checkoutSettings

  // Check if checkout is enabled
  if (!checkoutSettings?.enabled) {
    // If checkout is not enabled, redirect to product page
    redirect(`/products/${slug}`)
  }

  // Get the selected tier
  const tiers = pricingBlockData?.content?.tiers || []
  const selectedTier = tiers.find((t: any) => t.id === tierId)

  if (!selectedTier) {
    // If no valid tier selected, redirect to product page
    redirect(`/products/${slug}`)
  }

  // Check if tier has a Stripe price ID
  if (!selectedTier.stripePriceId) {
    // If no Stripe price ID, redirect to product page
    redirect(`/products/${slug}`)
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <CheckoutForm
          product={product}
          selectedTier={selectedTier}
          checkoutSettings={checkoutSettings}
        />
      </div>
    </div>
  )
}
