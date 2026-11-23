import {
  createCsrfMiddleware,
  createMiddleware,
  createStart,
} from "@tanstack/react-start"
import { getRequest, setResponseHeader } from "@tanstack/react-start/server"

// Personal's dev server. On this Mac, Personal shows CMS screens in its middle
// panel (apps/personal/workspace/docs/app-panels.md), so in development CMS lets
// that one address frame it as well as itself. The live site still refuses
// every frame but its own and the listing badge's.
const PERSONAL_DEV_ORIGIN = "http://localhost:3021"

const securityHeaders = createMiddleware().server(async ({ next }) => {
  const pathname = new URL(getRequest().url).pathname
  const isListingBadge = /^\/embed\/listing\/[^/]+\/?$/.test(pathname)

  setResponseHeader("X-DNS-Prefetch-Control", "on")
  if (!isListingBadge) {
    if (process.env.NODE_ENV === "production") {
      setResponseHeader("X-Frame-Options", "SAMEORIGIN")
    } else {
      // X-Frame-Options cannot name a second address; frame-ancestors can.
      setResponseHeader(
        "Content-Security-Policy",
        `frame-ancestors 'self' ${PERSONAL_DEV_ORIGIN}`
      )
    }
  }
  setResponseHeader("X-Content-Type-Options", "nosniff")
  setResponseHeader("Referrer-Policy", "origin-when-cross-origin")
  setResponseHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(self)"
  )

  if (process.env.NODE_ENV === "production" && !isListingBadge) {
    setResponseHeader(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload"
    )
    setResponseHeader(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' https://js.stripe.com https://static.cloudflareinsights.com",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' blob: data: https:",
        "font-src 'self' data:",
        "connect-src 'self' https://api.stripe.com https://*.cloudflareinsights.com",
        "frame-src https://js.stripe.com",
        "object-src 'none'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join("; ")
    )
  }

  return next()
})

const csrfMiddleware = createCsrfMiddleware({
  filter: (context) => context.handlerType === "serverFn",
})

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware, securityHeaders],
}))
