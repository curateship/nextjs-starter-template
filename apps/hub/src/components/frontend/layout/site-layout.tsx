"use client"

import { NavBlock } from "@/components/frontend/pages/navigation/PageNavigationBlock"
import { FooterBlock } from "@/components/frontend/pages/footer/PageFooterBlock"
import { SiteThemeProvider } from "./site-theme-provider"
import { type ReactNode } from "react"
import type { PublicSiteClientProps } from "@/lib/utils/public-site-client"

interface SiteLayoutProps {
  children: ReactNode
  site?: PublicSiteClientProps
  navigation?: Record<string, any>
  footer?: {
    logo?: string
    logoUrl?: string
    copyright?: string
    links?: Array<{ text: string; url: string }>
    socialLinks?: Array<{ platform: string; url: string }>
    style?: { backgroundColor: string; textColor: string }
  }
  isPreview?: boolean
  hideChrome?: boolean
  navigationBackgroundColor?: string
}

export function SiteLayout({ children, site, navigation, footer, isPreview = false, hideChrome = false, navigationBackgroundColor }: SiteLayoutProps) {
  const activeNavStyle = navigation?.navigationStyle || 'default'
  const resolvedNavStyle = navigation?.styleConfig?.[activeNavStyle]
  const enableThemeToggle = resolvedNavStyle?.showDarkModeToggle !== false

  return (
    <SiteThemeProvider site={site} isPreview={isPreview} enableThemeToggle={enableThemeToggle}>
      {/* Navigation - only render if navigation data exists */}
      {!hideChrome && navigation && (
        <NavBlock
          {...navigation}
          site={site}
          isPreview={isPreview}
          backgroundColor={navigationBackgroundColor}
        />
      )}

      {/* Main content */}
      <main className={navigation && !isPreview && !hideChrome ? "pt-16 lg:pt-18 [--site-page-start-offset:4rem] [--site-page-start-offset-half:2rem] lg:[--site-page-start-offset:4.5rem] lg:[--site-page-start-offset-half:2.25rem]" : ""}>
        {children}
      </main>

      {/* Footer - only render if footer data exists */}
      {!hideChrome && footer && <FooterBlock {...footer} site={site} />}
    </SiteThemeProvider>
  )
}
