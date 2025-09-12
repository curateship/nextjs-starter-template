import { getFontByValue, getGoogleFontUrl, getFontFamily, defaultFont } from "@/lib/utils/font-config"
import { useLayoutEffect } from "react"

interface FontProviderProps {
  fontFamily?: string
  fontWeights?: string[]
  secondaryFontFamily?: string
  secondaryFontWeights?: string[]
}

export function FontProvider({ 
  fontFamily = 'playfair-display', 
  fontWeights,
  secondaryFontFamily = defaultFont.value,
  secondaryFontWeights 
}: FontProviderProps) {
  const primary = getFontByValue(fontFamily) ?? defaultFont
  const secondary = getFontByValue(secondaryFontFamily) ?? primary

  const primaryFontUrl = getGoogleFontUrl(primary.value, fontWeights)
  const primaryFontFamilyValue = getFontFamily(primary.value)
  
  const secondaryFontUrl = getGoogleFontUrl(secondary.value, secondaryFontWeights)
  const secondaryFontFamilyValue = getFontFamily(secondary.value)

  // Set CSS variables for fonts without injecting inline style blocks
  useLayoutEffect(() => {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    root.style.setProperty('--font-primary', primaryFontFamilyValue)
    root.style.setProperty('--font-secondary', secondaryFontFamilyValue)
    // Ensure Tailwind's font-sans utility uses the dynamic secondary font
    root.style.setProperty('--font-sans', secondaryFontFamilyValue)
  }, [primaryFontFamilyValue, secondaryFontFamilyValue])

  return (
    <>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link 
        href={primaryFontUrl}
        rel="stylesheet"
        crossOrigin="anonymous"
      />
      {secondaryFontUrl && secondaryFontUrl !== primaryFontUrl && (
        <link 
          href={secondaryFontUrl}
          rel="stylesheet"
          crossOrigin="anonymous"
        />
      )}
    </>
  )
}