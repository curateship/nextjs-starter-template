import { notFound } from 'next/navigation'
import { getProductBySlug } from '@/lib/actions/products/product-frontend-actions'
import { XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import Link from 'next/link'

interface CancelledPageProps {
  params: Promise<{ slug: string }>
}

export default async function CancelledPage({ params }: CancelledPageProps) {
  const { slug } = await params

  // Fetch product data
  const result = await getProductBySlug(slug)

  if (!result.success || !result.product) {
    notFound()
  }

  const product = result.product

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-12 max-w-2xl">
        <div className="space-y-8">
          {/* Header */}
          <div className="text-center">
            <div className="flex justify-center mb-4">
              <div className="rounded-full bg-yellow-100 p-3">
                <XCircle className="h-12 w-12 text-yellow-600" />
              </div>
            </div>
            <h1 className="text-4xl font-bold mb-2">Payment Cancelled</h1>
            <p className="text-lg text-muted-foreground">
              Your payment was cancelled. No charges were made.
            </p>
          </div>

          {/* Info Card */}
          <Card>
            <CardContent className="pt-6 space-y-4">
              <p>
                Your checkout session was cancelled and no payment was processed. If you
                experienced any issues or have questions, please don't hesitate to contact us.
              </p>
              <p className="text-sm text-muted-foreground">
                If you'd like to complete your purchase, you can return to the product page
                and try again.
              </p>
            </CardContent>
          </Card>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button asChild variant="outline" size="lg">
              <Link href="/">
                Return to Home
              </Link>
            </Button>
            <Button asChild size="lg">
              <Link href={`/products/${product.slug}`}>
                Back to {product.name}
              </Link>
            </Button>
          </div>

          {/* Support */}
          <div className="text-center text-sm text-muted-foreground">
            <p>Need help? Contact us at support@example.com</p>
          </div>
        </div>
      </div>
    </div>
  )
}
