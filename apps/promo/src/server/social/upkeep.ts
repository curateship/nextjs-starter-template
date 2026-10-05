import { eq, lt } from "drizzle-orm"

import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { reapIdleSessions } from "@/server/browser/session"

import { testProxyConnection } from "./proxies"
import { decryptSecret } from "@/server/auth/encryption"
import { promoProxies } from "./schema"

/**
 * The quick, regular jobs. These ride the shell's one fifteen-second ticker,
 * which is right for them: each is a read and at most one outside call.
 *
 * The slow browser work is deliberately not here. It lives in its own process
 * (`worker/src/social-browser.ts`), because a search takes tens of seconds and
 * would hold up every other app job on the shared ticker.
 */

/** How long between re-tests of a proxy. */
const PROXY_SWEEP_MINUTES = 10

/**
 * Re-tests a proxy nobody has checked for ten minutes.
 *
 * One per pass, not all of them: a sweep that tested twenty proxies would take
 * four minutes of the ticker's time, and the point of being on the ticker is
 * being quick. With one account there is one proxy anyway.
 */
export async function sweepProxyHealth(
  db: CustomShellDb = defaultDb
): Promise<void> {
  const cutoff = new Date(Date.now() - PROXY_SWEEP_MINUTES * 60_000)

  const [stale] = await db
    .select()
    .from(promoProxies)
    .where(lt(promoProxies.lastTestedAt, cutoff))
    .limit(1)

  // A proxy that has never been tested is left for the Test button, because
  // the first test is the one somebody is waiting to read.
  if (!stale) return

  const result = await testProxyConnection({
    protocol: stale.protocol,
    host: stale.host,
    port: stale.port,
    username: stale.username,
    password: stale.passwordEncrypted ? decryptSecret(stale.passwordEncrypted) : "",
  })

  await db
    .update(promoProxies)
    .set({
      lastTestedAt: new Date(),
      lastTestResult: result,
      ...(result.ok && result.country && !stale.country
        ? { country: result.country.slice(0, 2).toUpperCase() }
        : {}),
    })
    .where(eq(promoProxies.id, stale.id))
}

/** Shuts down a browser nobody has used for an hour. */
export async function reapBrowsers(db: CustomShellDb = defaultDb): Promise<void> {
  const closed = await reapIdleSessions(db)
  if (closed) {
    console.log(`Shut down ${closed} idle browser(s)`)
  }
}
