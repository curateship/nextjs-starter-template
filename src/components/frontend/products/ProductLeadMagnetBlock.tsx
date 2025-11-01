'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Mail, Check, Loader2 } from 'lucide-react'

interface LeadMagnetBlockContent {
  heading?: string
  subheading?: string
  buttonText?: string
  benefits?: string[]
  emailSettings?: {
    subject?: string
    fromName?: string
    replyTo?: string
    content?: string
  }
  flodeskSettings?: {
    enabled?: boolean
    segmentId?: string
    tags?: string[]
  }
  thankYou?: {
    heading?: string
    message?: string
  }
}

interface ProductLeadMagnetBlockProps {
  content: LeadMagnetBlockContent
  product: any
}

export default function ProductLeadMagnetBlock({
  content,
  product,
}: ProductLeadMagnetBlockProps) {
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      // Validate email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(email)) {
        setError('Please enter a valid email address')
        setIsLoading(false)
        return
      }

      // Submit to API
      const response = await fetch('/api/products/lead-magnet/signup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          productId: product.id,
          siteId: product.site_id,
        }),
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to sign up')
      }

      // Show success message
      setIsSuccess(true)
      setIsLoading(false)
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.')
      setIsLoading(false)
    }
  }

  // Success state
  if (isSuccess) {
    return (
      <div className="mx-auto my-16 max-w-2xl">
        <div className="rounded-xl border-2 border-green-200 bg-gradient-to-br from-green-50 to-emerald-50 p-12 text-center shadow-lg">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <Check className="h-8 w-8 text-green-600" />
          </div>
          <h3 className="mb-3 text-2xl font-bold text-gray-900">
            {content.thankYou?.heading || 'Check Your Email!'}
          </h3>
          <p className="text-lg text-gray-700">
            {content.thankYou?.message || "We've sent your content to your email address."}
          </p>
          <p className="mt-6 text-sm text-gray-600">
            Sent to: <strong>{email}</strong>
          </p>
        </div>
      </div>
    )
  }

  // Main form
  return (
    <div className="mx-auto my-16 max-w-2xl">
      <div className="rounded-xl border-2 border-indigo-100 bg-gradient-to-br from-indigo-50 to-purple-50 p-8 shadow-xl md:p-12">
        {/* Icon */}
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-100">
          <Mail className="h-8 w-8 text-indigo-600" />
        </div>

        {/* Heading */}
        <h2 className="mb-3 text-center text-3xl font-bold text-gray-900">
          {content.heading || 'Get Your Free Download'}
        </h2>

        {/* Subheading */}
        {content.subheading && (
          <p className="mb-6 text-center text-lg text-gray-700">
            {content.subheading}
          </p>
        )}

        {/* Benefits List */}
        {content.benefits && content.benefits.length > 0 && (
          <ul className="mb-8 space-y-3">
            {content.benefits.map((benefit, index) => (
              <li key={index} className="flex items-start">
                <Check className="mr-3 mt-1 h-5 w-5 flex-shrink-0 text-green-600" />
                <span className="text-gray-700">{benefit}</span>
              </li>
            ))}
          </ul>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="sr-only">
              Email address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email address"
              required
              disabled={isLoading}
              className="block w-full rounded-lg border border-gray-300 px-4 py-4 text-lg shadow-sm transition-colors focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 p-4">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="flex w-full items-center justify-center rounded-lg bg-indigo-600 px-6 py-4 text-lg font-semibold text-white shadow-lg transition-all hover:bg-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Processing...
              </>
            ) : (
              content.buttonText || 'Get Instant Access'
            )}
          </button>
        </form>

        {/* Privacy note */}
        <p className="mt-6 text-center text-sm text-gray-600">
          We respect your privacy. Unsubscribe at any time.
        </p>
      </div>
    </div>
  )
}
