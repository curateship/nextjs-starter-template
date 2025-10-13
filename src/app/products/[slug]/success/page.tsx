import { notFound } from 'next/navigation'
import { getProductBySlug } from '@/lib/actions/products/product-frontend-actions'
import { verifyCheckoutSession } from '@/lib/actions/stripe/checkout-actions'
import { SuccessContent } from '@/components/frontend/checkout/SuccessContent'

interface SuccessPageProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ session_id?: string }>
}

export default async function SuccessPage({ params, searchParams }: SuccessPageProps) {
  const { slug } = await params
  const { session_id } = await searchParams

  // Fetch product data
  const result = await getProductBySlug(slug)

  if (!result.success || !result.product) {
    notFound()
  }

  const product = result.product

  // Get pricing block data
  const pricingBlockData = product.blocks?.find((block: any) => block.type === 'product-pricing')
  const downloadSettings = pricingBlockData?.content?.downloadSettings

  // Verify the checkout session if session_id is provided
  let sessionData = null
  let sessionError = null

  if (session_id) {
    const verificationResult = await verifyCheckoutSession(session_id)
    if (verificationResult.success) {
      sessionData = verificationResult.session
    } else {
      sessionError = verificationResult.error
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-12 max-w-3xl">
        <SuccessContent
          product={product}
          downloadSettings={downloadSettings}
          sessionData={sessionData}
          sessionError={sessionError}
        />
      </div>
    </div>
  )
}
