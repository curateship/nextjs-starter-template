"use client"

import { ThemeProvider, useTheme } from "next-themes"
import { type ReactNode } from "react"

interface SiteThemeProviderProps {
  children: ReactNode
  site?: {
    settings?: {
      default_theme?: 'system' | 'light' | 'dark'
    }
  }
  isPreview?: boolean
  enableThemeToggle?: boolean
}

export function SiteThemeProvider({ children, site, isPreview = false, enableThemeToggle = true }: SiteThemeProviderProps) {
  const defaultTheme = site?.settings?.default_theme || 'system'
  
  // If theme toggle is disabled, just render children without theme provider
  if (!enableThemeToggle) {
    return <>{children}</>
  }
  
  // For preview mode, just render with static theme class
  if (isPreview) {
    return (
      <div className={defaultTheme === 'dark' ? 'dark' : ''} suppressHydrationWarning>
        {children}
      </div>
    )
  }

  // For live sites, use next-themes with site-specific storage
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme={defaultTheme}
      enableSystem
      disableTransitionOnChange
      storageKey="site-theme"
      suppressHydrationWarning
    >
      {children}
    </ThemeProvider>
  )
}

// Custom hook for site themes
export function useSiteTheme() {
  return useTheme()
}