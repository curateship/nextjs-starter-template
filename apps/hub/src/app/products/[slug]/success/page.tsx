import { notFound } from 'next/navigation'
import { getProductBySlugForSite } from '@/lib/actions/products/product-frontend-actions'
import { verifyPaymentIntent } from '@/lib/actions/stripe/checkout-actions'
import { SuccessContent } from '@/components/frontend/checkout/SuccessContent'
import { recordPaidPurchase } from '@/lib/actions/products/paid-purchase-recording'
import { getSiteFromHeaders } from '@/lib/utils/site-resolver'

interface SuccessPageProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ payment_intent?: string }>
}

export default async function SuccessPage({ params, searchParams }: SuccessPageProps) {
  const { slug } = await params
  const { payment_intent } = await searchParams

  const siteResult = await getSiteFromHeaders()
  if (!siteResult.success || !siteResult.site) {
    notFound()
  }

  const result = await getProductBySlugForSite(siteResult.site.id, slug)

  if (!result.success || !result.product) {
    notFound()
  }

  const product = result.product
  const siteId = result.site?.id

  // Get checkout block data
  const pricingBlockData = product.blocks?.find((block: any) => block.type === 'product-checkout')
  const pricingTiers = pricingBlockData?.content?.productPricingTiers || []

  // Only the current Payment Element flow is supported.
  let sessionData = null
  let sessionError: string | null = payment_intent ? null : 'Missing payment confirmation'
  let tierId: string | null = null

  if (payment_intent) {
    // Payment Element flow
    const verificationResult = await verifyPaymentIntent(payment_intent, siteId, product.id)
    if (verificationResult.success && verificationResult.paymentIntent) {
      // Convert payment intent to session-like structure for SuccessContent
      const metadata = verificationResult.paymentIntent.metadata
      tierId = metadata?.tierId as string | null
      sessionData = {
        id: verificationResult.paymentIntent.id,
        customerEmail: verificationResult.paymentIntent.customerEmail ?? null,
        amountTotal: verificationResult.paymentIntent.amount ?? null,
        currency: verificationResult.paymentIntent.currency ?? null,
        paymentStatus: verificationResult.paymentIntent.status ?? 'unknown',
        metadata: metadata ? {
          productName: metadata.productName as string | undefined,
          orderBumps: metadata.orderBumps as string | undefined,
          tierId: metadata.tierId as string | undefined,
          tierName: metadata.tierName as string | undefined,
        } : undefined,
      }

      try {
        await recordPaidPurchase({
          siteId,
          productId: product.id,
          customerEmail: verificationResult.paymentIntent.customerEmail ?? null,
          stripePaymentIntentId: verificationResult.paymentIntent.id,
          amountTotal: verificationResult.paymentIntent.amount ?? null,
          currency: verificationResult.paymentIntent.currency ?? null,
          paymentStatus: 'succeeded',
          metadata: {
            source: 'success_page_verification',
            product_slug: product.slug,
            tier_id: metadata?.tierId || null,
            tier_name: metadata?.tierName || null,
          },
        })
      } catch (error) {
        console.error('Failed to record verified purchase from success page:', error)
      }
    } else {
      sessionError = verificationResult.error || 'Payment verification failed'
    }
  }

  // Find the purchased tier and get its download content
  const purchasedTier = tierId ? pricingTiers.find((tier: any) => tier.id === tierId) : null
  const tierDownloadContent = purchasedTier?.downloadContent
  const showDownloads = Boolean(sessionData && purchasedTier?.enableDownloadPage === true && tierDownloadContent)

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-12 max-w-3xl">
        <SuccessContent
          product={product}
          showDownloads={showDownloads}
          downloadContent={tierDownloadContent}
          sessionData={sessionData}
          sessionError={sessionError}
        />
      </div>
    </div>
  )
}
