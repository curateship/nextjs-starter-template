/**
 * Values put into the code at build time rather than read at run time.
 *
 * `__DEV_APP_PORT__` is this app's dev port from the monorepo's
 * `local-apps.json`. `vite.config.ts` and `vitest.config.ts` both substitute
 * it, both from the same place — see `app-port.ts` for why the port may only
 * ever be assigned there.
 *
 * Typed as possibly missing on purpose: a build that does not substitute it
 * should leave the code taking its "no local addresses" path rather than
 * crashing on a name that is not there.
 */
declare global {
  const __DEV_APP_PORT__: number | undefined
}

export {}
