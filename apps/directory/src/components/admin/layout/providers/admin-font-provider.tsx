'use client'

import { getFontByValue, getFontFamily, getFontFaceCSS, defaultFont } from "@/lib/utils/font-config"
import { useLayoutEffect, useMemo } from "react"

interface AdminFontProviderProps {
  fontFamily: string
  secondaryFontFamily: string
}

export function AdminFontProvider({
  fontFamily,
  secondaryFontFamily,
}: AdminFontProviderProps) {
  const primary = getFontByValue(fontFamily) ?? defaultFont
  const secondary = getFontByValue(secondaryFontFamily) ?? primary

  const primaryFontFamilyValue = getFontFamily(primary.value)
  const secondaryFontFamilyValue = getFontFamily(secondary.value)

  // Generate @font-face CSS for self-hosted fonts
  const fontCSS = useMemo(() => {
    const parts = [getFontFaceCSS(primary.value)]
    if (secondary.value !== primary.value) {
      parts.push(getFontFaceCSS(secondary.value))
    }
    return parts.filter(Boolean).join('\n')
  }, [primary.value, secondary.value])

  // Set ADMIN-SCOPED CSS variables to avoid interfering with frontend fonts
  useLayoutEffect(() => {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    root.style.setProperty('--admin-font-primary', primaryFontFamilyValue)
    root.style.setProperty('--admin-font-secondary', secondaryFontFamilyValue)
    root.style.setProperty('--admin-font-sans', secondaryFontFamilyValue)
  }, [primaryFontFamilyValue, secondaryFontFamilyValue])

  return fontCSS ? <style dangerouslySetInnerHTML={{ __html: fontCSS }} /> : null
}
