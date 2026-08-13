import {
  createCsrfMiddleware,
  createMiddleware,
  createStart,
} from "@tanstack/react-start"
import { getRequest, setResponseHeader } from "@tanstack/react-start/server"

const securityHeaders = createMiddleware().server(async ({ next }) => {
  const pathname = new URL(getRequest().url).pathname
  const isListingBadge = /^\/embed\/listing\/[^/]+\/?$/.test(pathname)

  setResponseHeader("X-DNS-Prefetch-Control", "on")
  if (!isListingBadge) setResponseHeader("X-Frame-Options", "SAMEORIGIN")
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
