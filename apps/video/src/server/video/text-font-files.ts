import { existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { TEXT_FONTS, type TextFontId } from "@/lib/video/text-fonts"

export const FONT_MISSING_MESSAGE =
  "The font this server renders words with is missing"

// The faces words are drawn in, as files the rasterizer can read. The browser
// loads the same families as web fonts from public/fonts, so the export wraps
// where the preview wrapped.
const ASSET_DIR = fileURLToPath(new URL("../assets", import.meta.url))

const FONT_FILES: Record<TextFontId, string> = {
  inter: "Inter-SemiBold.ttf",
  "playfair-display": "PlayfairDisplay-SemiBold.ttf",
  "space-grotesk": "SpaceGrotesk-SemiBold.ttf",
  caveat: "Caveat-SemiBold.ttf",
}

/**
 * Every face's file, for handing to the rasterizer in one go. A missing file
 * fails here, by name, rather than as silently blank words in the export.
 */
export function requireTextFontFiles() {
  return TEXT_FONTS.map((font) => {
    const file = path.join(ASSET_DIR, FONT_FILES[font.id])
    if (!existsSync(file)) {
      throw new Error(FONT_MISSING_MESSAGE)
    }
    return file
  })
}
