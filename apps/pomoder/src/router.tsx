import { createRouter } from "@tanstack/react-router"
import { createIsomorphicFn } from "@tanstack/react-start"
import * as Sentry from "@sentry/tanstackstart-react"

import { routeTree } from "./routeTree.gen"

if (typeof window !== "undefined" && import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    sendDefaultPii: false,
    tracesSampleRate: 0.1,
  })
}

const configureContentSecurityPolicy = createIsomorphicFn()
  .server(async () => {
    const { setResponseHeader } = await import("@tanstack/react-start/server")
    const nonce = crypto.randomUUID().replaceAll("-", "")
    setResponseHeader(
      "Content-Security-Policy",
      [
        "default-src 'self'",
        `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
        import.meta.env.DEV
          ? "style-src 'self' 'unsafe-inline'"
          : `style-src 'self' 'nonce-${nonce}'`,
        "style-src-attr 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "media-src 'self' blob:",
        "font-src 'self'",
        "connect-src 'self'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "object-src 'none'",
      ].join("; ")
    )
    return nonce
  })
  .client(
    () =>
      document.querySelector<HTMLMetaElement>('meta[property="csp-nonce"]')
        ?.content
  )

export async function getRouter() {
  const nonce = await configureContentSecurityPolicy()
  return createRouter({
    routeTree,
    scrollRestoration: true,
    ssr: { nonce },
    defaultErrorComponent: ({ error }) => {
      Sentry.captureException(error)
      return (
        <main className="fatal-error">
          <p>Pomoder hit an unexpected error.</p>
          <a href="/">Return to your timer</a>
        </main>
      )
    },
  })
}

declare module "@tanstack/react-router" {
  interface Register {
    router: Awaited<ReturnType<typeof getRouter>>
  }
}
