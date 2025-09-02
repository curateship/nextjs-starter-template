"use client"

import { ThemeProvider, useTheme } from "next-themes"
import { type ReactNode, useEffect } from "react"

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

function ThemeWrapper({ children, defaultTheme }: { children: ReactNode; defaultTheme: string }) {
  const { setTheme } = useTheme()
  
  useEffect(() => {
    // When toggle is disabled, force the default theme and clear localStorage
    if (typeof window !== 'undefined') {
      localStorage.removeItem('site-theme')
      setTheme(defaultTheme)
    }
  }, [defaultTheme, setTheme])
  
  return <>{children}</>
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
  
  // If theme toggle is disabled, use theme provider but force default theme
  if (!enableThemeToggle) {
    return (
      <ThemeProvider
        attribute="class"
        defaultTheme={defaultTheme}
        enableSystem={defaultTheme === 'system'}
        disableTransitionOnChange
        storageKey="site-theme"
        forcedTheme={defaultTheme !== 'system' ? defaultTheme : undefined}
      >
        <ThemeWrapper defaultTheme={defaultTheme}>
          {children}
        </ThemeWrapper>
      </ThemeProvider>
    )
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