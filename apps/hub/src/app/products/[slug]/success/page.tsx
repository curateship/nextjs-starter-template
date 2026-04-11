import { notFound } from 'next/navigation'
import { getProductBySlugDirect } from '@/lib/actions/products/product-frontend-actions'
import { verifyCheckoutSession, verifyPaymentIntent } from '@/lib/actions/stripe/checkout-actions'
import { SuccessContent } from '@/components/frontend/checkout/SuccessContent'

interface SuccessPageProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ session_id?: string; payment_intent?: string }>
}

export default async function SuccessPage({ params, searchParams }: SuccessPageProps) {
  const { slug } = await params
  const { session_id, payment_intent } = await searchParams

  // Fetch product data
  const result = await getProductBySlugDirect(slug)

  if (!result.success || !result.product) {
    notFound()
  }

  const product = result.product
  const siteId = result.site?.id

  // Get checkout block data
  const pricingBlockData = product.blocks?.find((block: any) => block.type === 'product-checkout')
  const pricingTiers = pricingBlockData?.content?.productPricingTiers || []

  // Verify payment - check for payment_intent (Payment Element) or session_id (Checkout Session)
  let sessionData = null
  let sessionError = null
  let tierId: string | null = null

  if (payment_intent) {
    // Payment Element flow
    const verificationResult = await verifyPaymentIntent(payment_intent, siteId)
    if (verificationResult.success && verificationResult.paymentIntent) {
      // Convert payment intent to session-like structure for SuccessContent
      const metadata = verificationResult.paymentIntent.metadata
      tierId = metadata?.tierId as string | null
      sessionData = {
        id: verificationResult.paymentIntent.id,
        customerEmail: null, // Payment Intent doesn't have customer email by default
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
    } else {
      sessionError = verificationResult.error
    }
  } else if (session_id) {
    // Legacy Checkout Session flow
    const verificationResult = await verifyCheckoutSession(session_id, siteId)
    if (verificationResult.success && verificationResult.session) {
      const session = verificationResult.session
      const metadata = session.metadata
      tierId = metadata?.tierId as string | null
      sessionData = {
        ...session,
        metadata: metadata ? {
          productName: metadata.productName as string | undefined,
          orderBumps: metadata.orderBumps as string | undefined,
          tierId: metadata.tierId as string | undefined,
          tierName: metadata.tierName as string | undefined,
        } : undefined,
      }
    } else {
      sessionError = verificationResult.error
    }
  }

  // Find the purchased tier and get its download content
  const purchasedTier = tierId ? pricingTiers.find((tier: any) => tier.id === tierId) : null
  const tierDownloadContent = purchasedTier?.downloadContent
  const showDownloads = purchasedTier?.enableDownloadPage === true && tierDownloadContent

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
