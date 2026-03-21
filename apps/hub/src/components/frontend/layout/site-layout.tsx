"use client"

import { NavBlock } from "@/components/frontend/pages/navigation/PageNavigationBlock"
import { FooterBlock } from "@/components/frontend/pages/footer/PageFooterBlock"
import { SiteThemeProvider } from "./site-theme-provider"
import { type ReactNode } from "react"

interface SiteLayoutProps {
  children: ReactNode
  site?: {
    id: string
    subdomain: string
    name?: string
    settings?: {
      favicon?: string
      default_theme?: 'system' | 'light' | 'dark'
      [key: string]: any
    }
  }
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
}

export function SiteLayout({ children, site, navigation, footer, isPreview = false }: SiteLayoutProps) {
  // Check if dark mode toggle is enabled in navigation settings
  // Resolve from styleConfig (new) or style (legacy)
  const resolvedNavStyle = (() => {
    const activeStyle = navigation?.navigationStyle || 'default'
    if (navigation?.styleConfig?.[activeStyle]) return navigation.styleConfig[activeStyle]
    return navigation?.style
  })()
  const enableThemeToggle = resolvedNavStyle?.showDarkModeToggle !== false

  return (
    <SiteThemeProvider site={site} isPreview={isPreview} enableThemeToggle={enableThemeToggle}>
      {/* Navigation - only render if navigation data exists */}
      {navigation && (
        <NavBlock {...navigation} site={site} />
      )}

      {/* Main content */}
      <main className={navigation ? "pt-16" : ""}>
        {children}
      </main>

      {/* Footer - only render if footer data exists */}
      {footer && (
        <div data-block-type="footer">
          <FooterBlock {...footer} site={site} />
        </div>
      )}
    </SiteThemeProvider>
  )
}