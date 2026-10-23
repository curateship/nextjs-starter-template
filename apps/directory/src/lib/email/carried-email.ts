/**
 * The email typed on the sign-in page, handed to the page it links out to.
 *
 * It travels in the router's history state, not in the address bar. A URL puts
 * the address on screen for anyone looking, keeps it in browser history, and
 * hands it to other servers in a `Referer` header; history state does none of
 * that. Convenience is not worth showing somebody's email around.
 *
 * History state can still be edited by hand from the browser console, so the
 * value is checked here before it reaches a field — the same rule the
 * `?redirect=` guard follows in `nav/redirect-path.ts`. This only asks whether the
 * text looks like an address; whether an account exists is the server's answer,
 * unchanged.
 */

declare module "@tanstack/react-router" {
  interface HistoryState {
    email?: string
  }
}

/** Something before the @, something after it, and a dot in what follows. */
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function carriedEmail(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const trimmed = value.trim()
  // The same 255 the server's own email rule allows.
  if (trimmed.length > 255) return undefined
  return LOOKS_LIKE_EMAIL.test(trimmed) ? trimmed : undefined
}
