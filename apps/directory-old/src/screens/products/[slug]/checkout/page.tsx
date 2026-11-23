import { notFound, redirect } from '@/lib/navigation-server'
import { getProductBySlugForSite } from '@/lib/actions/products/product-frontend-actions'
import { CheckoutForm } from '@/components/frontend/checkout/CheckoutForm'
import { getStripeConfig } from '@/lib/actions/integrations/config-helpers'
import { getSiteFromHeaders } from '@/lib/utils/site-resolver'
import { headers } from '@/lib/request-headers'

interface CheckoutPageProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ tier?: string }>
}

export default async function CheckoutPage({ params, searchParams }: CheckoutPageProps) {
  const { slug } = await params
  const { tier: tierId } = await searchParams

  const siteResult = await getSiteFromHeaders()
  if (!siteResult.success || !siteResult.site) {
    notFound()
  }

  const result = await getProductBySlugForSite(siteResult.site.id, slug)

  if (!result.success || !result.product) {
    notFound()
  }

  const product = result.product
  const site = result.site
  const stripeConfig = site?.id ? await getStripeConfig(site.id) : null

  const requestHeaders = await headers()
  const host = requestHeaders.get('host')
  const forwardedProtocol = requestHeaders.get('x-forwarded-proto')?.split(',')[0]?.trim()
  const protocol = forwardedProtocol === 'http' || forwardedProtocol === 'https'
    ? forwardedProtocol
    : process.env.NODE_ENV === 'development' ? 'http' : 'https'
  const checkoutOrigin = host ? `${protocol}://${host}` : undefined

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
