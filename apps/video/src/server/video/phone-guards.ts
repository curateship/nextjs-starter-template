import { createMiddleware } from "@tanstack/react-start"

import { requireAppOrigin } from "@/server/auth/origin"
import { ensureBackgroundTicker } from "@/server/ticker"
import { findPhoneSession, readPhoneCookie } from "@/server/video/phone-uploads"

/**
 * The door checks for a phone sending files to a project
 * (workspace/docs/phone-uploads.md). Kept apart from phone-uploads.ts for the
 * reason editor-guards.ts gives: a server function's middleware travels to the
 * browser, and only what runs inside `.server()` stays behind.
 */

/** What a phone whose two hours are over, or that never opened a link, is told. */
export const PHONE_ENDED = "PHONE_ENDED"

/** Opening a link: from this site's own page, and nothing else asked. */
export const phoneOpen = createMiddleware({ type: "function" }).server(async ({ next }) => {
  ensureBackgroundTicker()
  requireAppOrigin()
  return next()
})

/** Reading whether this phone may send files. */
export const phoneGet = createMiddleware({ type: "function" }).server(async ({ next }) => {
  ensureBackgroundTicker()
  return next({ context: { phone: await findPhoneSession(readPhoneCookie()) } })
})

/** Sending a file: a live phone sign-in, from this site's own page. */
export const phonePost = createMiddleware({ type: "function" }).server(async ({ next }) => {
  ensureBackgroundTicker()
  requireAppOrigin()
  const phone = await findPhoneSession(readPhoneCookie())
  if (!phone) throw new Error(PHONE_ENDED)
  return next({ context: { phone } })
})
