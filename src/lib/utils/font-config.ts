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

/**
 * Generate @font-face CSS for self-hosted font files.
 * Files live in /public/fonts/{slug}-{subset}-{weight}.woff2
 */
export function getFontFaceCSS(fontValue: string, weights?: string[]): string {
  const font = getFontByValue(fontValue)
  if (!font) return ''

  const fontWeights = weights
    ? weights.filter(w => font.weights.includes(w))
    : font.weights
  const rules: string[] = []

  for (const weight of fontWeights) {
    for (const subset of ['latin-ext', 'latin'] as const) {
      const unicodeRange = subset === 'latin'
        ? 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD'
        : 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF'

      rules.push(`@font-face {
  font-family: '${font.label}';
  font-style: normal;
  font-weight: ${weight};
  font-display: optional;
  src: url(/fonts/${fontValue}-${subset}-${weight}.woff2) format('woff2');
  unicode-range: ${unicodeRange};
}`)
    }
  }

  return rules.join('\n')
}


export function getFontFamily(fontValue: string): string {
  const font = getFontByValue(fontValue)
  if (!font) return defaultFont.fallback

  return `'${font.label}', ${font.fallback}`
}