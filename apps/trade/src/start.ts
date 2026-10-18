import {
  createCsrfMiddleware,
  createMiddleware,
  createStart,
} from "@tanstack/react-start"
import { setResponseHeader } from "@tanstack/react-start/server"

// Personal shows Trade's screens in its middle panel
// (apps/personal/workspace/docs/app-panels.md). Only Trade itself and Personal
// may put Trade in a frame; every other site is refused. On this Mac that is
// Personal's dev server.
const PERSONAL_ORIGIN =
  process.env.NODE_ENV === "production"
    ? "https://personal.barelycompany.com"
    : "http://localhost:3021"

const frameRule = createMiddleware().server(({ next }) => {
  // X-Frame-Options cannot name a second address; frame-ancestors can.
  setResponseHeader("Content-Security-Policy", `frame-ancestors 'self' ${PERSONAL_ORIGIN}`)
  return next()
})

// TanStack Start adds this check by itself only when an app has no start
// file, so it is listed here again, unchanged. Leaving it out would let other
// sites call Trade's server functions with the visitor's sign-in.
const csrfMiddleware = createCsrfMiddleware({
  filter: (context) => context.handlerType === "serverFn",
})

export const startInstance = createStart(() => ({
  requestMiddleware: [csrfMiddleware, frameRule],
}))
