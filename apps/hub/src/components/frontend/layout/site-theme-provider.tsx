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

  // For preview mode, just render with static theme class
  if (isPreview) {
    return (
      <div className={defaultTheme === 'dark' ? 'dark' : ''} suppressHydrationWarning>
        {children}
      </div>
    )
  }

  // If theme toggle is disabled, skip ThemeProvider entirely — theme class is applied
  // server-side on <html> in layout.tsx, so no client JS needed
  if (!enableThemeToggle) {
    return <>{children}</>
  }

  // For live sites with toggle enabled, use next-themes normally
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme={defaultTheme}
      enableSystem
      disableTransitionOnChange
      storageKey="site-theme"
    >
      {children}
    </ThemeProvider>
  )
}

// Custom hook for site themes
export function useSiteTheme() {
  return useTheme()
}