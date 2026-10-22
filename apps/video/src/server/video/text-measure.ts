import { createRequire } from "node:module"

import type { TextFont } from "@/lib/video/text-fonts"
import { requireTextFontFiles } from "@/server/video/text-font-files"

// The rasterizer is a native add-on: no bundler can inline its binary, so it is
// loaded when it is needed rather than imported. A server running this must
// have it installed, the same as ffmpeg. The video and carousel exports both
// draw their words with it.
const requireNative = createRequire(import.meta.url)

export function loadResvg() {
  return requireNative("@resvg/resvg-js") as typeof import("@resvg/resvg-js")
}

export function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

const advances = new Map<string, number>()

/**
 * How far `text` reaches along its line in this face, in pixels: the browser's
 * own measure of a run, which an export needs to break lines where the browser
 * breaks them, to centre a line and to put a box under exactly its words.
 * resvg measures what it would draw, so a bar after the words marks where they
 * end, spaces included. The carousel export and the video export both use it.
 */
export function measureAdvance(
  text: string,
  font: TextFont,
  fontSize: number,
  letterSpacing: number
) {
  if (!text) return 0
  const key = `${font.id}|${fontSize}|${letterSpacing}|${text}`
  const known = advances.get(key)
  if (known !== undefined) return known
  const reach = (words: string) => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="20000" height="${fontSize * 3}"><text x="0" y="${fontSize * 2}" font-family="${font.svgFamily}" font-size="${fontSize}" font-weight="${font.weight}" letter-spacing="${letterSpacing}" xml:space="preserve">${escapeXml(words)}|</text></svg>`
    const { Resvg } = loadResvg()
    const bounds = new Resvg(svg, {
      font: { fontFiles: requireTextFontFiles(), loadSystemFonts: false },
    }).getBBox()
    return bounds ? bounds.x + bounds.width : 0
  }
  const advance = reach(text) - reach("")
  // Lines repeat across slides and exports; a long run of new words does not
  // keep every one.
  if (advances.size > 5_000) advances.clear()
  advances.set(key, advance)
  return advance
}
