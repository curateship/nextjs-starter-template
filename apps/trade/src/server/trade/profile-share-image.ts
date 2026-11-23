import { existsSync } from "node:fs"
import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"

import {
  renderProfileShareSvg,
  SHARE_IMAGE_FONT_FAMILY,
} from "@/lib/trade/public-profile/share-image"
import { appUrl } from "@/server/app-url"
import { loadPublicProfileView } from "@/server/trade/public-profiles"

/**
 * Serves a public profile's share picture as a PNG.
 *
 * The rasterizer is a native addon no bundler can inline, so it is required
 * at run time. The font sits in `public/fonts`, under the app folder in
 * development and beside the server bundle in `.output` once built; the
 * server image has no system fonts, so without it every word would vanish.
 */
const FONT_FILE = "Inter-SemiBold.ttf"
const requireNative = createRequire(import.meta.url)

let fontPath: string | null | undefined

function findFont(): string | null {
  const candidates = [
    path.resolve(process.cwd(), "public", "fonts", FONT_FILE),
    path.resolve(process.cwd(), ".output", "public", "fonts", FONT_FILE),
    fileURLToPath(new URL(`../public/fonts/${FONT_FILE}`, import.meta.url)),
    fileURLToPath(new URL(`../../public/fonts/${FONT_FILE}`, import.meta.url)),
  ]
  return candidates.find((candidate) => existsSync(candidate)) ?? null
}

function renderPng(svg: string): Buffer {
  const { Resvg } = requireNative(
    "@resvg/resvg-js"
  ) as typeof import("@resvg/resvg-js")
  if (fontPath === undefined) fontPath = findFont()
  if (!fontPath)
    throw new Error("The share picture font is missing on the server")
  const drawn = new Resvg(svg, {
    font: {
      fontFiles: [fontPath],
      loadSystemFonts: false,
      defaultFontFamily: SHARE_IMAGE_FONT_FAMILY,
    },
  })
  return Buffer.from(drawn.render().asPng())
}

const NOT_FOUND = () =>
  new Response("Not found", {
    status: 404,
    headers: { "Cache-Control": "public, max-age=60" },
  })

/**
 * Drawn pictures, keyed by the page answer they were drawn from. The page is
 * itself kept for a minute (`loadPublicProfileView`), so a link shared on X
 * that a crowd opens draws its picture once a minute, not once per visitor.
 */
const drawn = new Map<string, { readAt: number; png: Buffer }>()
const MAX_DRAWN = 200

export async function profileShareImageResponse(
  handle: string
): Promise<Response> {
  const view = await loadPublicProfileView(handle)
  if (!view) return NOT_FOUND()
  let png =
    drawn.get(view.handle)?.readAt === view.readAt
      ? drawn.get(view.handle)?.png
      : undefined
  if (!png) {
    png = renderPng(renderProfileShareSvg(view, new URL(appUrl()).host))
    if (drawn.size >= MAX_DRAWN) drawn.clear()
    drawn.set(view.handle, { readAt: view.readAt, png })
  }
  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      // Ten minutes: the figures move, and X keeps its own copy anyway.
      "Cache-Control": "public, max-age=600",
      "X-Content-Type-Options": "nosniff",
    },
  })
}
