#!/usr/bin/env node
/**
 * Download Google Fonts woff2 files for self-hosting.
 * Only downloads latin and latin-ext subsets.
 * Run once: node scripts/download-fonts.mjs
 */
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FONTS_DIR = join(__dirname, '..', 'public', 'fonts')
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const FONTS = [
  { slug: 'inter', name: 'Inter', weights: '300;400;500;600;700;800' },
  { slug: 'urbanist', name: 'Urbanist', weights: '300;400;500;600;700;800;900' },
  { slug: 'poppins', name: 'Poppins', weights: '300;400;500;600;700;800' },
  { slug: 'roboto', name: 'Roboto', weights: '300;400;500;700;900' },
  { slug: 'open-sans', name: 'Open+Sans', weights: '300;400;500;600;700;800' },
  { slug: 'montserrat', name: 'Montserrat', weights: '300;400;500;600;700;800;900' },
  { slug: 'lato', name: 'Lato', weights: '300;400;700;900' },
  { slug: 'raleway', name: 'Raleway', weights: '300;400;500;600;700;800' },
  { slug: 'work-sans', name: 'Work+Sans', weights: '300;400;500;600;700;800' },
  { slug: 'nunito', name: 'Nunito', weights: '300;400;500;600;700;800;900' },
  { slug: 'playfair-display', name: 'Playfair+Display', weights: '400;500;600;700;800;900' },
  { slug: 'merriweather', name: 'Merriweather', weights: '300;400;700;900' },
  { slug: 'lora', name: 'Lora', weights: '400;500;600;700' },
  { slug: 'crimson-text', name: 'Crimson+Text', weights: '400;600;700' },
  { slug: 'bebas-neue', name: 'Bebas+Neue', weights: '400' },
  { slug: 'righteous', name: 'Righteous', weights: '400' },
  { slug: 'abril-fatface', name: 'Abril+Fatface', weights: '400' },
  { slug: 'jetbrains-mono', name: 'JetBrains+Mono', weights: '300;400;500;600;700;800' },
  { slug: 'fira-code', name: 'Fira+Code', weights: '300;400;500;600;700' },
  { slug: 'source-code-pro', name: 'Source+Code+Pro', weights: '300;400;500;600;700;900' },
]

mkdirSync(FONTS_DIR, { recursive: true })

let totalFiles = 0

for (const font of FONTS) {
  const url = `https://fonts.googleapis.com/css2?family=${font.name}:wght@${font.weights}&display=optional`
  console.log(`\nFetching CSS for ${font.slug}...`)

  const cssRes = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!cssRes.ok) {
    console.error(`  Failed to fetch CSS: ${cssRes.status}`)
    continue
  }

  const fullCSS = await cssRes.text()

  // Parse CSS into blocks, only keep latin and latin-ext
  const blocks = fullCSS.split(/\/\*\s*/)
  for (const block of blocks) {
    const subsetMatch = block.match(/^([\w-]+)\s*\*\//)
    if (!subsetMatch) continue
    const subset = subsetMatch[1]
    if (subset !== 'latin' && subset !== 'latin-ext') continue

    // Extract woff2 URL
    const urlMatch = block.match(/url\((https:\/\/fonts\.gstatic\.com[^)]+\.woff2)\)/)
    if (!urlMatch) continue
    const woff2Url = urlMatch[1]

    // Extract weight
    const weightMatch = block.match(/font-weight:\s*(\d+)/)
    const weight = weightMatch ? weightMatch[1] : '400'

    const filename = `${font.slug}-${subset}-${weight}.woff2`
    const filepath = join(FONTS_DIR, filename)

    if (existsSync(filepath)) {
      console.log(`  Exists: ${filename}`)
    } else {
      const fontRes = await fetch(woff2Url)
      const buffer = Buffer.from(await fontRes.arrayBuffer())
      writeFileSync(filepath, buffer)
      console.log(`  Downloaded: ${filename} (${(buffer.length / 1024).toFixed(1)} KB)`)
    }
    totalFiles++
  }
}

console.log(`\nDone! ${totalFiles} font files in public/fonts/`)
