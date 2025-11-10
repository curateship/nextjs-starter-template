'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'

export function FontLoader() {
  const pathname = usePathname()

  useEffect(() => {
    // Skip font loading for admin and user-pages
    if (pathname?.startsWith('/admin') || pathname?.startsWith('/user-pages')) return

    async function loadFonts() {
      try {
        // Get site fonts from window if available (set by middleware or SSR)
        const fontPrimary = document.documentElement.style.getPropertyValue('--font-primary')
        const fontSecondary = document.documentElement.style.getPropertyValue('--font-secondary')

        // If fonts already set (by SSR), just load the Google Fonts
        if (fontPrimary && fontSecondary) {
          // Extract font names from CSS variable values
          const extractFontName = (cssVar: string) => cssVar.split(',')[0].replace(/['"]/g, '').trim()
          const primaryName = extractFontName(fontPrimary)
          const secondaryName = extractFontName(fontSecondary)

          // Build Google Fonts URL (use default weights)
          const encodeName = (name: string) => name.replace(/\s+/g, '+')
          const googleFontsUrl = primaryName !== secondaryName
            ? `https://fonts.googleapis.com/css2?family=${encodeName(primaryName)}:wght@400;500;600;700;800;900&family=${encodeName(secondaryName)}:wght@300;400;500;600;700;800&display=swap`
            : `https://fonts.googleapis.com/css2?family=${encodeName(primaryName)}:wght@400;500;600;700;800;900&display=swap`

          // Load font if not already loaded
          if (!document.querySelector(`link[href*="${encodeName(primaryName)}"]`)) {
            const link = document.createElement('link')
            link.rel = 'stylesheet'
            link.href = googleFontsUrl
            document.head.appendChild(link)
          }
        }
      } catch (error) {
        // Silently fail
      }
    }

    loadFonts()
  }, [pathname])

  return null
}
