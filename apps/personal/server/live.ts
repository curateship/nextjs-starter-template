import { createReadStream } from "node:fs"
import { stat } from "node:fs/promises"
import type { IncomingMessage, ServerResponse } from "node:http"
import path from "node:path"

import { menuApi } from "./menu-file"
import { signInGate } from "./sign-in"

type Middleware = (request: IncomingMessage, response: ServerResponse, next: () => void) => unknown

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
}

type Options = {
  /** The built page, `dist/`. */
  distDir: string
  menuFile: string
  password: string
  /** Personal's own address, such as `https://personal.barelycompany.com`. */
  origin: string
  /** Who is signing in, for counting wrong passwords per visitor. */
  visitorOf: (request: IncomingMessage) => string
}

/**
 * The file a request names inside `distDir`, or null when there is none or it
 * would leave the folder.
 */
async function fileFor(distDir: string, url: string) {
  let pathname: string
  try {
    pathname = decodeURIComponent(new URL(url, "http://personal").pathname)
  } catch {
    return null
  }
  const file = path.resolve(distDir, `.${pathname}`)
  if (!file.startsWith(`${distDir}${path.sep}`)) return null
  try {
    return (await stat(file)).isFile() ? file : null
  } catch {
    return null
  }
}

function serveFile(request: IncomingMessage, response: ServerResponse, file: string, cache: string) {
  response.statusCode = 200
  response.setHeader("Content-Type", TYPES[path.extname(file)] ?? "application/octet-stream")
  response.setHeader("Cache-Control", cache)
  if (request.method === "HEAD") return response.end()
  createReadStream(file)
    .on("error", () => response.destroy())
    .pipe(response)
}

/**
 * Personal's live server: `/health`, the sign-in, `/api/menu`, then the built
 * page. Any other address is a screen inside Personal, such as
 * `/trade.barelycompany.com/admin/...`, so it gets the page and the page
 * opens that screen. The dev server does the same through Vite.
 */
export function liveServer({ distDir, menuFile, password, origin, visitorOf }: Options) {
  const dist = path.resolve(distDir)
  const index = path.join(dist, "index.html")
  const chain: Middleware[] = [
    signInGate({ password, allowedOrigins: [origin], visitorOf }),
    menuApi(menuFile, [origin]),
  ]

  return async (request: IncomingMessage, response: ServerResponse) => {
    // Personal frames other apps; nothing frames Personal.
    response.setHeader("X-Frame-Options", "DENY")
    response.setHeader("Content-Security-Policy", "frame-ancestors 'none'")
    response.setHeader("X-Content-Type-Options", "nosniff")

    const route = request.url?.split("?")[0] ?? "/"
    if (route === "/health") {
      response.setHeader("Content-Type", "text/plain; charset=utf-8")
      response.setHeader("Cache-Control", "no-store")
      return response.end("ok")
    }

    for (const step of chain) {
      let passed = false
      await step(request, response, () => {
        passed = true
      })
      if (!passed) return
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      response.statusCode = 405
      return response.end()
    }
    const file = await fileFor(dist, request.url ?? "/")
    if (file && file !== index) {
      // Built files carry a hash in their name, so a new build is a new name.
      const cache = route.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache"
      return serveFile(request, response, file, cache)
    }
    if (route.startsWith("/assets/")) {
      response.statusCode = 404
      return response.end()
    }
    return serveFile(request, response, index, "no-store")
  }
}
