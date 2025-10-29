'use client'

import { CheckCircle2, Download, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'

interface DownloadSettings {
  enabled: boolean
  thankYouMessage: string
  content: string
}

interface Product {
  id: string
  slug: string
  title: string
}

interface SessionData {
  id: string
  customerEmail?: string | null
  amountTotal?: number | null
  currency?: string | null
  paymentStatus: string
  metadata?: {
    productName?: string
    orderBumps?: string
  }
}

interface SuccessContentProps {
  product: Product
  downloadSettings?: DownloadSettings
  sessionData?: SessionData | null
  sessionError?: string | null
}

export function SuccessContent({
  product,
  downloadSettings,
  sessionData,
  sessionError,
}: SuccessContentProps) {
  const showDownloads = downloadSettings?.enabled && downloadSettings.content

  // Parse order bumps from metadata
  let orderBumps: Array<{ id: string; title: string; priceId: string }> = []
  if (sessionData?.metadata?.orderBumps) {
    try {
      orderBumps = JSON.parse(sessionData.metadata.orderBumps)
    } catch (e) {
      console.error('Failed to parse order bumps:', e)
    }
  }

  return (
    <div className="space-y-8">
      {/* Success Header */}
      <div className="text-center">
        <div className="flex justify-center mb-4">
          <div className="rounded-full bg-green-100 p-3">
            <CheckCircle2 className="h-12 w-12 text-green-600" />
          </div>
        </div>
        <h1 className="text-4xl font-bold mb-2">Payment Successful!</h1>
        <p className="text-lg text-muted-foreground">
          Thank you for your purchase!
        </p>
      </div>

      {/* Session Error */}
      {sessionError && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-yellow-900">Payment verification pending</p>
                <p className="text-sm text-yellow-700 mt-1">
                  Your payment is being processed. You will receive a confirmation email shortly.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Order Details */}
      {sessionData && (
        <Card>
          <CardHeader>
            <CardTitle>Order Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Line Items */}
            <div className="space-y-2">
              <div className="flex justify-between py-2">
                <span className="font-medium">{product.title}</span>
              </div>
              {orderBumps.length > 0 && (
                <div className="space-y-1 border-t pt-2">
                  {orderBumps.map((bump) => (
                    <div key={bump.id} className="flex justify-between py-1 text-sm">
                      <span className="text-muted-foreground">+ {bump.title}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Order Info */}
            <div className="space-y-3 border-t pt-4">
              {sessionData.customerEmail && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Email:</span>
                  <span className="font-medium">{sessionData.customerEmail}</span>
                </div>
              )}
              {sessionData.amountTotal != null && (
                <div className="flex justify-between text-lg font-semibold">
                  <span>Total Paid:</span>
                  <span>
                    ${(sessionData.amountTotal / 100).toFixed(2)}{' '}
                    {sessionData.currency?.toUpperCase()}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Payment Status:</span>
                <span className="font-medium capitalize text-green-600">
                  {sessionData.paymentStatus}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Order ID:</span>
                <span className="font-mono text-sm">{sessionData.id}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Content */}
      {showDownloads && (
        <Card>
          <CardHeader>
            <CardTitle>Your Purchase</CardTitle>
          </CardHeader>
          <CardContent>
            {/* Rich text content */}
            <div
              className="prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: downloadSettings.content }}
            />
          </CardContent>
        </Card>
      )}

      {/* What's Next */}
      <Card>
        <CardHeader>
          <CardTitle>What's Next?</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-primary/10 p-2 flex-shrink-0">
              <CheckCircle2 className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="font-medium">Check your email</p>
              <p className="text-sm text-muted-foreground">
                You'll receive a confirmation email with your order details and receipt.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-4 justify-center">
        <Button asChild variant="outline" size="lg">
          <Link href={`/products/${product.slug}`}>
            View Product Page
          </Link>
        </Button>
        <Button asChild size="lg">
          <Link href="/">
            Return to Home
          </Link>
        </Button>
      </div>
    </div>
  )
}
