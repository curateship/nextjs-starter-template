import {
  createCsrfMiddleware,
  createMiddleware,
  createStart,
} from "@tanstack/react-start"
import { getRequest, setResponseHeader } from "@tanstack/react-start/server"

const securityHeaders = createMiddleware().server(async ({ next }) => {
  // Widget embed pages (/embed/*) exist to be framed by third-party sites; they
  // ship their own locked-down CSP, so skip the global frame-blocking headers
  const isEmbeddableWidget = new URL(getRequest().url).pathname.startsWith("/embed/")

  setResponseHeader("X-DNS-Prefetch-Control", "on")
  if (!isEmbeddableWidget) setResponseHeader("X-Frame-Options", "SAMEORIGIN")
  setResponseHeader("X-Content-Type-Options", "nosniff")
  setResponseHeader("Referrer-Policy", "origin-when-cross-origin")
  setResponseHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()"
  )

  if (process.env.NODE_ENV === "production") {
    setResponseHeader(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload"
    )
    if (!isEmbeddableWidget) setResponseHeader(
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
