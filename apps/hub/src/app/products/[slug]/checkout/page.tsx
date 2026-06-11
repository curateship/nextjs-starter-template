import { notFound, redirect } from 'next/navigation'
import { getProductBySlugDirect } from '@/lib/actions/products/product-frontend-actions'
import { CheckoutForm } from '@/components/frontend/checkout/CheckoutForm'
import { getStripeConfig } from '@/lib/actions/integrations/config-helpers'

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
  const site = result.site
  const stripeConfig = site?.id ? await getStripeConfig(site.id) : null

  // Normalize the site domain into an absolute origin for Stripe redirect URLs
  const domain = site?.custom_domain || process.env.NEXT_PUBLIC_APP_DOMAIN
  let checkoutOrigin: string | undefined
  if (domain) {
    if (/^https?:\/\//i.test(domain)) checkoutOrigin = domain.replace(/\/$/, '')
    else if (domain.startsWith('localhost') || domain.startsWith('127.')) checkoutOrigin = `http://${domain}`
    else checkoutOrigin = `https://${domain}`
  }

  // Get checkout block data
  const pricingBlockData = product.blocks?.find((block: any) => block.type === 'product-checkout')
  const checkoutSettings = pricingBlockData?.content?.checkoutSettings

  // Check if checkout is enabled
  if (!checkoutSettings?.enabled) {
    // If checkout is not enabled, redirect to product page
    redirect(`/products/${slug}`)
  }

  // Get the selected tier
  const tiers = pricingBlockData?.content?.productPricingTiers || pricingBlockData?.content?.tiers || []
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
    <CheckoutForm
      product={{
        id: product.id,
        slug: product.slug,
        title: product.title,
        featuredImage: product.featured_image || undefined,
      }}
      site={{
        id: site.id,
        name: site?.name || 'Store',
        logo: site?.settings?.logo,
        favicon: site?.settings?.favicon,
      }}
      selectedTier={selectedTier}
      checkoutSettings={checkoutSettings}
      stripePublishableKey={stripeConfig?.publishableKey}
      checkoutOrigin={checkoutOrigin}
    />
  )
}
