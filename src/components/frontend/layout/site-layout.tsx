"use client"

import { NavBlock } from "@/components/frontend/pages/PageNavigationBlock"
import { FooterBlock } from "@/components/frontend/pages/PageFooterBlock"
import { SiteThemeProvider } from "./site-theme-provider"
import { FontProvider } from "./font-provider"
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
  navigation?: {
    logo?: string
    logoUrl?: string
    links?: Array<{ text: string; url: string }>
    buttons?: Array<{ text: string; url: string; style: 'primary' | 'outline' | 'ghost'; showOnMobile?: boolean }>
    style?: { 
      backgroundColor: string
      textColor: string
      containerWidth?: 'full' | 'custom'
      customWidth?: number
      [key: string]: any // Allow additional properties to pass through
    }
  }
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
  const enableThemeToggle = navigation?.style?.showDarkModeToggle !== false
  
  // Get font settings from site settings
  const fontFamily = site?.settings?.font_family
  const fontWeights = site?.settings?.font_weights
  const secondaryFontFamily = site?.settings?.secondary_font_family
  const secondaryFontWeights = site?.settings?.secondary_font_weights
  
  return (
    <SiteThemeProvider site={site} isPreview={isPreview} enableThemeToggle={enableThemeToggle}>
      <FontProvider 
        fontFamily={fontFamily}
        fontWeights={fontWeights}
        secondaryFontFamily={secondaryFontFamily}
        secondaryFontWeights={secondaryFontWeights}
      />
      {/* Navigation - only render if navigation data exists */}
      {navigation && (
        <NavBlock {...navigation} site={site} />
      )}
      
      {/* Main content */}
      <div className={navigation ? "pt-16" : ""}>
        {children}
      </div>
      
      {/* Footer - only render if footer data exists */}
      {footer && <FooterBlock {...footer} site={site} />}
    </SiteThemeProvider>
  )
}