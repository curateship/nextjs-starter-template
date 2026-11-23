import { createMiddleware } from "@tanstack/react-start"

import { requireAppOrigin } from "@/server/auth/origin"
import { ensureBackgroundTicker } from "@/server/ticker"
import { findEditorCaller } from "@/server/video/project-guests"

/**
 * The editor's door checks for a signed-in person or a guest sent from
 * Project (`workspace/docs/project-guests.md`). They live apart from
 * project-guests.ts for the same reason the shell's guards.ts holds nothing
 * else: a server function's module is sent to the browser with its
 * middleware, and only what runs inside `.server()` is left out. Kept beside
 * the rest of project-guests.ts, they took its database and sign-in code into
 * the browser, and the editor page never started.
 */

/** Reads a signed-in person or a guest may make. */
export const editorGet = createMiddleware({ type: "function" }).server(async ({ next }) => {
  ensureBackgroundTicker()
  return next({ context: { caller: await findEditorCaller() } })
})

/** Changes a signed-in person or a guest may make. */
export const editorPost = createMiddleware({ type: "function" }).server(async ({ next }) => {
  ensureBackgroundTicker()
  requireAppOrigin()
  return next({ context: { caller: await findEditorCaller() } })
})
