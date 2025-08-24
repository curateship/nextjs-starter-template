import { getFontByValue, getGoogleFontUrl, getFontFamily } from "@/lib/utils/font-config"

interface FontProviderProps {
  fontFamily?: string
  fontWeights?: string[]
  secondaryFontFamily?: string
  secondaryFontWeights?: string[]
}

export function FontProvider({ 
  fontFamily = 'playfair-display', 
  fontWeights,
  secondaryFontFamily = 'inter',
  secondaryFontWeights 
}: FontProviderProps) {
  const primaryFont = getFontByValue(fontFamily)
  const secondaryFont = getFontByValue(secondaryFontFamily)
  
  if (!primaryFont) {
    return null
  }

  const primaryFontUrl = getGoogleFontUrl(fontFamily, fontWeights)
  const primaryFontFamilyValue = getFontFamily(fontFamily)
  
  const secondaryFontUrl = secondaryFont ? getGoogleFontUrl(secondaryFontFamily, secondaryFontWeights) : null
  const secondaryFontFamilyValue = secondaryFont ? getFontFamily(secondaryFontFamily) : primaryFontFamilyValue

  // Generate inline styles for font application
  const fontStyles = `
    :root {
      --font-primary: ${primaryFontFamilyValue};
      --font-secondary: ${secondaryFontFamilyValue};
    }
    
    body {
      font-family: var(--font-secondary) !important;
    }
    
    /* Apply PRIMARY font to headings */
    h1, h2, h3, h4, h5, h6 {
      font-family: var(--font-primary) !important;
      font-weight: 600;
      letter-spacing: -0.02em;
    }
    
    /* Keep SECONDARY font for body text */
    p, span, div, li, td, th, label, input, textarea, select {
      font-family: var(--font-secondary) !important;
    }
    
    /* Special classes for overrides */
    .font-primary {
      font-family: var(--font-primary) !important;
    }
    
    .font-secondary {
      font-family: var(--font-secondary) !important;
    }
    
    /* Button text should use secondary font */
    button, .btn, [role="button"] {
      font-family: var(--font-secondary) !important;
    }
    
    /* Navigation items use secondary font */
    nav, .nav-link {
      font-family: var(--font-secondary) !important;
    }
  `

  return (
    <>
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
      <style dangerouslySetInnerHTML={{ __html: fontStyles }} />
    </>
  )
}