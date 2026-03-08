'use client'

import { useState, useMemo } from 'react'
import { Check } from 'lucide-react'
import { BlockContainer } from '@/components/frontend/layout/block-container'
import { LEAD_MAGNET_RENDERERS } from '.'

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
  siteWidth?: 'full' | 'custom'
  customWidth?: number
}

export default function ProductLeadMagnetBlock({
  content,
  product,
  siteWidth,
  customWidth,
}: ProductLeadMagnetBlockProps) {
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)
  const [error, setError] = useState('')

  const styleConfig = useMemo(() => {
    const style = content.leadMagnetStyle || 'default'
    return content.styleConfig?.[style] || {}
  }, [content.leadMagnetStyle, content.styleConfig])

  const activeStyle = content.leadMagnetStyle || 'default'

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
      <BlockContainer siteWidth={siteWidth} customWidth={customWidth} animated={false}>
        <div className="mx-auto max-w-2xl">
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
      </BlockContainer>
    )
  }

  const StyleRenderer = LEAD_MAGNET_RENDERERS[activeStyle] || LEAD_MAGNET_RENDERERS.default

  return (
    <StyleRenderer
      config={styleConfig}
      content={content}
      email={email}
      setEmail={setEmail}
      isLoading={isLoading}
      error={error}
      handleSubmit={handleSubmit}
      siteWidth={siteWidth}
      customWidth={customWidth}
    />
  )
}
