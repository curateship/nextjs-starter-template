'use client'

import { getFontByValue, getFontFamily, defaultFont } from "@/lib/utils/font-config"
import { useLayoutEffect } from "react"

interface AdminFontProviderProps {
  fontFamily?: string
  fontWeights?: string[]
  secondaryFontFamily?: string
  secondaryFontWeights?: string[]
}

export function AdminFontProvider({
  fontFamily = 'urbanist',
  fontWeights,
  secondaryFontFamily = defaultFont.value,
  secondaryFontWeights
}: AdminFontProviderProps) {
  const primary = getFontByValue(fontFamily) ?? defaultFont
  const secondary = getFontByValue(secondaryFontFamily) ?? primary

  // Build a single combined Google Fonts URL to reduce requests
  const encodeName = (name: string) => name.replace(/\s+/g, '+')
  const primaryWeightsParam = (fontWeights || primary.weights).join(';')
  const primaryFamilyParam = `family=${encodeName(primary.label)}:wght@${primaryWeightsParam}`
  const includeSecondary = secondary.value !== primary.value
  const secondaryWeightsParam = (secondaryFontWeights || secondary.weights).join(';')
  const secondaryFamilyParam = includeSecondary
    ? `&family=${encodeName(secondary.label)}:wght@${secondaryWeightsParam}`
    : ''
  const combinedUrl = `https://fonts.googleapis.com/css2?${primaryFamilyParam}${secondaryFamilyParam}&display=swap`

  const primaryFontFamilyValue = getFontFamily(primary.value)
  const secondaryFontFamilyValue = getFontFamily(secondary.value)

  // Set ADMIN-SCOPED CSS variables to avoid interfering with frontend fonts
  useLayoutEffect(() => {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    // Use admin-prefixed variables that won't conflict with frontend
    root.style.setProperty('--admin-font-primary', primaryFontFamilyValue)
    root.style.setProperty('--admin-font-secondary', secondaryFontFamilyValue)
    root.style.setProperty('--admin-font-sans', secondaryFontFamilyValue)
  }, [primaryFontFamilyValue, secondaryFontFamilyValue])

  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      {/* Non-blocking font stylesheet loading */}
      <link rel="preload" as="style" href={combinedUrl} />
      <link
        rel="stylesheet"
        href={combinedUrl}
        media="print"
        onLoad={(e) => { (e.currentTarget as HTMLLinkElement).media = 'all' }}
      />
      <noscript>
        <link rel="stylesheet" href={combinedUrl} />
      </noscript>
    </>
  )
}
