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
  const activeNavStyle = navigation?.navigationStyle || 'default'
  const resolvedNavStyle = navigation?.styleConfig?.[activeNavStyle]
  const enableThemeToggle = resolvedNavStyle?.showDarkModeToggle !== false

  return (
    <SiteThemeProvider site={site} isPreview={isPreview} enableThemeToggle={enableThemeToggle}>
      {/* Navigation - only render if navigation data exists */}
      {navigation && (
        <div data-block-type="navigation">
          <NavBlock {...navigation} site={site} />
        </div>
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
