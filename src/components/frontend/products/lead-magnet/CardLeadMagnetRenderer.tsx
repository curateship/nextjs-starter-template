'use client'

import { Mail, Loader2 } from 'lucide-react'
import { BlockContainer } from '@/components/frontend/layout/block-container'
import type { LeadMagnetRendererProps } from '.'

const COLOR_MAP: Record<string, { border: string; bgFrom: string; bgTo: string; iconBg: string; iconText: string; button: string; buttonHover: string; ring: string }> = {
  indigo: { border: 'border-indigo-100', bgFrom: 'from-indigo-50', bgTo: 'to-purple-50', iconBg: 'bg-indigo-100', iconText: 'text-indigo-600', button: 'bg-indigo-600', buttonHover: 'hover:bg-indigo-700', ring: 'focus:ring-indigo-300' },
  blue: { border: 'border-blue-100', bgFrom: 'from-blue-50', bgTo: 'to-cyan-50', iconBg: 'bg-blue-100', iconText: 'text-blue-600', button: 'bg-blue-600', buttonHover: 'hover:bg-blue-700', ring: 'focus:ring-blue-300' },
  green: { border: 'border-green-100', bgFrom: 'from-green-50', bgTo: 'to-emerald-50', iconBg: 'bg-green-100', iconText: 'text-green-600', button: 'bg-green-600', buttonHover: 'hover:bg-green-700', ring: 'focus:ring-green-300' },
  rose: { border: 'border-rose-100', bgFrom: 'from-rose-50', bgTo: 'to-pink-50', iconBg: 'bg-rose-100', iconText: 'text-rose-600', button: 'bg-rose-600', buttonHover: 'hover:bg-rose-700', ring: 'focus:ring-rose-300' },
  amber: { border: 'border-amber-100', bgFrom: 'from-amber-50', bgTo: 'to-yellow-50', iconBg: 'bg-amber-100', iconText: 'text-amber-600', button: 'bg-amber-600', buttonHover: 'hover:bg-amber-700', ring: 'focus:ring-amber-300' },
  violet: { border: 'border-violet-100', bgFrom: 'from-violet-50', bgTo: 'to-purple-50', iconBg: 'bg-violet-100', iconText: 'text-violet-600', button: 'bg-violet-600', buttonHover: 'hover:bg-violet-700', ring: 'focus:ring-violet-300' },
  teal: { border: 'border-teal-100', bgFrom: 'from-teal-50', bgTo: 'to-cyan-50', iconBg: 'bg-teal-100', iconText: 'text-teal-600', button: 'bg-teal-600', buttonHover: 'hover:bg-teal-700', ring: 'focus:ring-teal-300' },
}

export function CardLeadMagnetRenderer({ config, content, email, setEmail, isLoading, error, handleSubmit, siteWidth, customWidth }: LeadMagnetRendererProps) {
  const accentColor = config.accentColor || 'indigo'
  const showMailIcon = config.showMailIcon ?? true
  const showPrivacyNote = config.showPrivacyNote ?? true
  const colors = COLOR_MAP[accentColor] || COLOR_MAP.indigo

  return (
    <BlockContainer siteWidth={siteWidth} customWidth={customWidth}>
      <div className="mx-auto max-w-2xl">
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
    </BlockContainer>
  )
}
