export interface FontOption {
  value: string
  label: string
  category: 'sans-serif' | 'serif' | 'display' | 'monospace'
  weights: string[]
  fallback: string
  previewText?: string
}

export const availableFonts: FontOption[] = [
  // Sans-serif fonts
  {
    value: 'inter',
    label: 'Inter',
    category: 'sans-serif',
    weights: ['300', '400', '500', '600', '700', '800'],
    fallback: 'system-ui, -apple-system, sans-serif',
  },
  {
    value: 'urbanist',
    label: 'Urbanist',
    category: 'sans-serif',
    weights: ['300', '400', '500', '600', '700', '800', '900'],
    fallback: 'system-ui, -apple-system, sans-serif',
  },
  {
    value: 'poppins',
    label: 'Poppins',
    category: 'sans-serif',
    weights: ['300', '400', '500', '600', '700', '800'],
    fallback: 'system-ui, -apple-system, sans-serif',
  },
  {
    value: 'roboto',
    label: 'Roboto',
    category: 'sans-serif',
    weights: ['300', '400', '500', '700', '900'],
    fallback: 'system-ui, -apple-system, sans-serif',
  },
  {
    value: 'open-sans',
    label: 'Open Sans',
    category: 'sans-serif',
    weights: ['300', '400', '500', '600', '700', '800'],
    fallback: 'system-ui, -apple-system, sans-serif',
  },
  {
    value: 'montserrat',
    label: 'Montserrat',
    category: 'sans-serif',
    weights: ['300', '400', '500', '600', '700', '800', '900'],
    fallback: 'system-ui, -apple-system, sans-serif',
  },
  {
    value: 'lato',
    label: 'Lato',
    category: 'sans-serif',
    weights: ['300', '400', '700', '900'],
    fallback: 'system-ui, -apple-system, sans-serif',
  },
  {
    value: 'raleway',
    label: 'Raleway',
    category: 'sans-serif',
    weights: ['300', '400', '500', '600', '700', '800'],
    fallback: 'system-ui, -apple-system, sans-serif',
  },
  {
    value: 'work-sans',
    label: 'Work Sans',
    category: 'sans-serif',
    weights: ['300', '400', '500', '600', '700', '800'],
    fallback: 'system-ui, -apple-system, sans-serif',
  },
  {
    value: 'nunito',
    label: 'Nunito',
    category: 'sans-serif',
    weights: ['300', '400', '500', '600', '700', '800', '900'],
    fallback: 'system-ui, -apple-system, sans-serif',
  },

  // Serif fonts
  {
    value: 'playfair-display',
    label: 'Playfair Display',
    category: 'serif',
    weights: ['400', '500', '600', '700', '800', '900'],
    fallback: 'Georgia, serif',
  },
  {
    value: 'merriweather',
    label: 'Merriweather',
    category: 'serif',
    weights: ['300', '400', '700', '900'],
    fallback: 'Georgia, serif',
  },
  {
    value: 'lora',
    label: 'Lora',
    category: 'serif',
    weights: ['400', '500', '600', '700'],
    fallback: 'Georgia, serif',
  },
  {
    value: 'crimson-text',
    label: 'Crimson Text',
    category: 'serif',
    weights: ['400', '600', '700'],
    fallback: 'Georgia, serif',
  },

  // Display fonts
  {
    value: 'bebas-neue',
    label: 'Bebas Neue',
    category: 'display',
    weights: ['400'],
    fallback: 'Impact, sans-serif',
  },
  {
    value: 'righteous',
    label: 'Righteous',
    category: 'display',
    weights: ['400'],
    fallback: 'Impact, sans-serif',
  },
  {
    value: 'abril-fatface',
    label: 'Abril Fatface',
    category: 'display',
    weights: ['400'],
    fallback: 'Georgia, serif',
  },

  // Monospace fonts
  {
    value: 'jetbrains-mono',
    label: 'JetBrains Mono',
    category: 'monospace',
    weights: ['300', '400', '500', '600', '700', '800'],
    fallback: 'Monaco, monospace',
  },
  {
    value: 'fira-code',
    label: 'Fira Code',
    category: 'monospace',
    weights: ['300', '400', '500', '600', '700'],
    fallback: 'Monaco, monospace',
  },
  {
    value: 'source-code-pro',
    label: 'Source Code Pro',
    category: 'monospace',
    weights: ['300', '400', '500', '600', '700', '900'],
    fallback: 'Monaco, monospace',
  },
]

export const defaultFont: FontOption = availableFonts.find(f => f.value === 'urbanist')!

export function getFontByValue(value: string): FontOption | undefined {
  return availableFonts.find(f => f.value === value)
}

export function getGoogleFontUrl(fontValue: string, weights?: string[]): string {
  const font = getFontByValue(fontValue)
  if (!font) return ''

  const fontName = font.label.replace(' ', '+')
  const fontWeights = weights || font.weights
  const weightsParam = fontWeights.join(';')
  
  return `https://fonts.googleapis.com/css2?family=${fontName}:wght@${weightsParam}&display=swap`
}

export function getGoogleFontImport(fontValue: string, weights?: string[]): string {
  const font = getFontByValue(fontValue)
  if (!font) return ''

  const fontName = font.label.replace(' ', '_').toLowerCase()
  const fontWeights = weights || font.weights
  
  return `@import url('${getGoogleFontUrl(fontValue, fontWeights)}');`
}

export function getFontFamily(fontValue: string): string {
  const font = getFontByValue(fontValue)
  if (!font) return defaultFont.fallback

  return `'${font.label}', ${font.fallback}`
}