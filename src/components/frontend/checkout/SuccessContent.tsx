'use client'

import { CheckCircle2, Download, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import Link from 'next/link'

interface DownloadFile {
  id: string
  name: string
  url: string
}

interface DownloadSettings {
  enabled: boolean
  thankYouMessage: string
  files: DownloadFile[]
}

interface Product {
  id: string
  slug: string
  title: string
}

interface SessionData {
  id: string
  customerEmail?: string
  amountTotal?: number
  currency?: string
  paymentStatus: string
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
  const showDownloads = downloadSettings?.enabled && downloadSettings.files.length > 0

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
          Thank you for your purchase of {product.title}
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
            <CardTitle>Order Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {sessionData.customerEmail && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Email:</span>
                <span className="font-medium">{sessionData.customerEmail}</span>
              </div>
            )}
            {sessionData.amountTotal !== undefined && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount Paid:</span>
                <span className="font-medium">
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
          </CardContent>
        </Card>
      )}

      {/* Thank You Message & Downloads */}
      {showDownloads && (
        <Card>
          <CardHeader>
            <CardTitle>Your Downloads</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Custom thank you message */}
            {downloadSettings.thankYouMessage && (
              <p className="text-muted-foreground whitespace-pre-wrap">
                {downloadSettings.thankYouMessage}
              </p>
            )}

            {/* Download files */}
            <div className="space-y-3">
              {downloadSettings.files.map((file) => (
                <div
                  key={file.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Download className="h-5 w-5 text-primary" />
                    <span className="font-medium">{file.name}</span>
                  </div>
                  <Button asChild size="sm">
                    <a
                      href={file.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      download
                    >
                      Download
                    </a>
                  </Button>
                </div>
              ))}
            </div>
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
          {showDownloads && (
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-primary/10 p-2 flex-shrink-0">
                <Download className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-medium">Download your files</p>
                <p className="text-sm text-muted-foreground">
                  Your download links are available above and in your confirmation email.
                </p>
              </div>
            </div>
          )}
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

      {/* Support */}
      <div className="text-center text-sm text-muted-foreground">
        <p>Need help? Contact us at support@example.com</p>
      </div>
    </div>
  )
}
