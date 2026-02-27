'use client'

import { useState, useMemo } from 'react'
import { Mail, Check, Loader2 } from 'lucide-react'

const COLOR_MAP: Record<string, { border: string; bgFrom: string; bgTo: string; iconBg: string; iconText: string; button: string; buttonHover: string; ring: string }> = {
  indigo: { border: 'border-indigo-100', bgFrom: 'from-indigo-50', bgTo: 'to-purple-50', iconBg: 'bg-indigo-100', iconText: 'text-indigo-600', button: 'bg-indigo-600', buttonHover: 'hover:bg-indigo-700', ring: 'focus:ring-indigo-300' },
  blue: { border: 'border-blue-100', bgFrom: 'from-blue-50', bgTo: 'to-cyan-50', iconBg: 'bg-blue-100', iconText: 'text-blue-600', button: 'bg-blue-600', buttonHover: 'hover:bg-blue-700', ring: 'focus:ring-blue-300' },
  green: { border: 'border-green-100', bgFrom: 'from-green-50', bgTo: 'to-emerald-50', iconBg: 'bg-green-100', iconText: 'text-green-600', button: 'bg-green-600', buttonHover: 'hover:bg-green-700', ring: 'focus:ring-green-300' },
  rose: { border: 'border-rose-100', bgFrom: 'from-rose-50', bgTo: 'to-pink-50', iconBg: 'bg-rose-100', iconText: 'text-rose-600', button: 'bg-rose-600', buttonHover: 'hover:bg-rose-700', ring: 'focus:ring-rose-300' },
  amber: { border: 'border-amber-100', bgFrom: 'from-amber-50', bgTo: 'to-yellow-50', iconBg: 'bg-amber-100', iconText: 'text-amber-600', button: 'bg-amber-600', buttonHover: 'hover:bg-amber-700', ring: 'focus:ring-amber-300' },
  violet: { border: 'border-violet-100', bgFrom: 'from-violet-50', bgTo: 'to-purple-50', iconBg: 'bg-violet-100', iconText: 'text-violet-600', button: 'bg-violet-600', buttonHover: 'hover:bg-violet-700', ring: 'focus:ring-violet-300' },
  teal: { border: 'border-teal-100', bgFrom: 'from-teal-50', bgTo: 'to-cyan-50', iconBg: 'bg-teal-100', iconText: 'text-teal-600', button: 'bg-teal-600', buttonHover: 'hover:bg-teal-700', ring: 'focus:ring-teal-300' },
}

interface LeadMagnetBlockContent {
  heading?: string
  subheading?: string
  buttonText?: string
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
  thankYouMessage?: {
    heading?: string
    message?: string
  }
  leadMagnetStyle?: string
  styleConfig?: Record<string, Record<string, any>>
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

  const styleConfig = useMemo(() => {
    const style = content.leadMagnetStyle || 'default'
    return content.styleConfig?.[style] || {}
  }, [content.leadMagnetStyle, content.styleConfig])

  const accentColor = styleConfig.accentColor || 'indigo'
  const showMailIcon = styleConfig.showMailIcon ?? true
  const showPrivacyNote = styleConfig.showPrivacyNote ?? true
  const colors = COLOR_MAP[accentColor] || COLOR_MAP.indigo

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)

    try {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(email)) {
        setError('Please enter a valid email address')
        setIsLoading(false)
        return
      }

      const response = await fetch('/api/products/lead-magnet/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

      setIsSuccess(true)
      setIsLoading(false)
    } catch (err: any) {
      setError(err.message || 'Something went wrong. Please try again.')
      setIsLoading(false)
    }
  }

  if (isSuccess) {
    return (
      <div className="mx-auto my-16 max-w-2xl">
        <div className="rounded-xl border-2 border-green-200 bg-gradient-to-br from-green-50 to-emerald-50 p-12 text-center shadow-lg">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <Check className="h-8 w-8 text-green-600" />
          </div>
          <h3 className="mb-3 text-2xl font-bold text-gray-900">
            {content.thankYouMessage?.heading || 'Check Your Email!'}
          </h3>
          <p className="text-lg text-gray-700">
            {content.thankYouMessage?.message || "We've sent your content to your email address."}
          </p>
          <p className="mt-6 text-sm text-gray-600">
            Sent to: <strong>{email}</strong>
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto my-16 max-w-2xl">
      <div className={`rounded-xl border-2 ${colors.border} bg-gradient-to-br ${colors.bgFrom} ${colors.bgTo} p-8 shadow-xl md:p-12`}>
        {showMailIcon && (
          <div className={`mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full ${colors.iconBg}`}>
            <Mail className={`h-8 w-8 ${colors.iconText}`} />
          </div>
        )}

        <h2 className="mb-3 text-center text-3xl font-bold text-gray-900">
          {content.heading || 'Get Your Free Download'}
        </h2>

        {content.subheading && (
          <p className="mb-6 text-center text-lg text-gray-700">
            {content.subheading}
          </p>
        )}

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
            className={`flex w-full items-center justify-center rounded-lg ${colors.button} px-6 py-4 text-lg font-semibold text-white shadow-lg transition-all ${colors.buttonHover} focus:outline-none focus:ring-4 ${colors.ring} disabled:cursor-not-allowed disabled:opacity-50`}
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

        {showPrivacyNote && (
          <p className="mt-6 text-center text-sm text-gray-600">
            We respect your privacy. Unsubscribe at any time.
          </p>
        )}
      </div>
    </div>
  )
}
