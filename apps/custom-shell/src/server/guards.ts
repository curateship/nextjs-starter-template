import { createMiddleware } from "@tanstack/react-start"

import { ensureBackgroundTicker } from "@/server/ticker"
import { maybeCleanUpOldData } from "@/server/cleanup"
import { requireAppOrigin } from "@/server/auth/origin"
import { requireAdmin, requireUser } from "@/server/auth/security"

/**
 * The door checks, done once instead of at the top of every handler.
 *
 * Attach one to a server function and it runs before the handler, hands the
 * handler the signed-in account on `context.user`, and throws before any work
 * happens if the caller has no business being there:
 *
 *     const listFn = createServerFn({ method: "GET" })
 *       .middleware([adminGet])
 *       .handler(async ({ context }) => listThings(context.user.id))
 *
 * Four of them, because there are two questions and two kinds of request:
 *
 * - **admin / user** — must this be an admin, or is any signed-in member fine?
 * - **Get / Post** — anything that *changes* something also checks the request
 *   came from this app's own pages, which is what stops another site from
 *   making your browser do it. Reads do not need that and never had it.
 *
 * There is deliberately no unguarded variant. A handler that genuinely must
 * run without one of these — the maintenance notice, which has to render for
 * signed-out people; "stop viewing as", which has to work while the caller
 * looks like somebody else — writes its own check inline and says why in a
 * comment. Credential changes are stricter still and use `requireOwnAccount`
 * or `requireSessionOwner` directly, so an admin viewing the app as a member
 * cannot touch that member's sign-in.
 *
 * `src/server/guards.test.ts` calls every admin server function as an ordinary
 * member and insists it is refused, so a guard cannot go missing unnoticed.
 *
 * All four also start the background ticker, which drives automation runs and
 * newsletter sending in development. This app has no boot hook to hang
 * a background loop on, so the first request of the process starts it and every
 * call after that returns on a flag — see `ensureBackgroundTicker`. A deployed
 * app ticks in its own worker container instead, and the call here does
 * nothing.
 */

/**
 * Reads that only an admin may make.
 *
 * This is also where the app-wide tidy-up rides in. There is no scheduler here,
 * so the sweep needs a real request to run on, and an admin opening any admin
 * screen is the natural one: it happens on every kind of sign-in, it is already
 * a privileged path, and `maybeCleanUpOldData` sweeps at most once a day per
 * process, so the other requests pay nothing.
 */
export const adminGet = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    ensureBackgroundTicker()
    const user = await requireAdmin()
    await maybeCleanUpOldData()
    return next({ context: { user } })
  }
)

/** Changes that only an admin may make. */
export const adminPost = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    ensureBackgroundTicker()
    requireAppOrigin()
    return next({ context: { user: await requireAdmin() } })
  }
)

/** Reads any signed-in member may make. */
export const userGet = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    ensureBackgroundTicker()
    return next({ context: { user: await requireUser() } })
  }
)

/** Changes any signed-in member may make. */
export const userPost = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    ensureBackgroundTicker()
    requireAppOrigin()
    return next({ context: { user: await requireUser() } })
  }
)
