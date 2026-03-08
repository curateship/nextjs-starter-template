'use client'

import { Loader2 } from 'lucide-react'
import { BorderBeam } from '@/components/ui/border-beam'
import { BlockContainer } from '@/components/frontend/layout/block-container'
import type { LeadMagnetRendererProps } from '.'

export function DefaultLeadMagnetRenderer({ config, content, email, setEmail, isLoading, error, handleSubmit, siteWidth, customWidth }: LeadMagnetRendererProps) {
  const showcaseImage = config.showcaseImage || ''
  const showBorderBeam = config.showBorderBeam ?? true
  const beamColorFrom = config.beamColorFrom || '#ffaa40'
  const beamColorTo = config.beamColorTo || '#9c40ff'
  const showPrivacyNote = config.showPrivacyNote ?? true

  return (
    <BlockContainer siteWidth={siteWidth} customWidth={customWidth} animated={false}>
        <div className="grid gap-10 md:gap-14 lg:grid-cols-2 lg:items-center">
          <div className="flex max-w-md flex-col items-start justify-center justify-self-center gap-8 text-center lg:justify-self-start lg:self-start lg:text-left">
            <div className="flex flex-col items-start gap-6">
              <div className="flex flex-col gap-4">
                <h1 className="text-4xl font-bold lg:text-5xl">
                  {content.heading || 'Get Your Free Download'}
                </h1>
                {content.subheading && (
                  <p className="text-muted-foreground lg:text-xl">
                    {content.subheading}
                  </p>
                )}
              </div>
              <form onSubmit={handleSubmit} className="w-full space-y-3">
                <label htmlFor="download-email" className="sr-only">
                  Email address
                </label>
                <input
                  id="download-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email address"
                  required
                  disabled={isLoading}
                  className="block w-full rounded-lg border border-border bg-background px-4 py-3 text-base shadow-sm transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50"
                />
                {error && (
                  <div className="rounded-lg bg-red-50 p-3">
                    <p className="text-sm text-red-800">{error}</p>
                  </div>
                )}
                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex w-full items-center justify-center rounded-lg bg-primary px-6 py-3 text-base font-semibold text-primary-foreground shadow-lg transition-all hover:bg-primary/90 focus:outline-none focus:ring-4 focus:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-50"
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
            </div>
            {showPrivacyNote && (
              <p className="w-full text-sm text-muted-foreground">
                We respect your privacy. Unsubscribe at any time.
              </p>
            )}
          </div>
          {showcaseImage && (
            <div className="relative overflow-hidden rounded-lg border border-border p-1">
              <img
                src={showcaseImage}
                alt="Showcase"
                className="max-h-[500px] w-auto rounded-lg object-contain"
              />
              {showBorderBeam && (
                <>
                  <BorderBeam duration={8} size={400} colorFrom={beamColorFrom} colorTo={beamColorTo} />
                  <BorderBeam duration={8} delay={3} size={400} colorFrom={beamColorFrom} colorTo={beamColorTo} />
                </>
              )}
            </div>
          )}
        </div>
    </BlockContainer>
  )
}
