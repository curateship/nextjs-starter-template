import { and, eq, sql } from "drizzle-orm"

import { compareSiteCheck, type Reference } from "@/lib/browser/site-check"
import type { SiteCheckResult } from "@/lib/social/options"
import { db as defaultDb, type CustomShellDb } from "@/server/db"

import { browserSiteCheck, type CommandTarget } from "./command"
import { testAndRecordProxy } from "./proxies"
import { thisComputersAddress } from "./proxy-probe"
import { promoProfiles, promoProxies } from "./schema"

/**
 * "Check what a site sees", run by the browser program against an open
 * browser.
 *
 * The proxy test proves a proxy works from the server. It says nothing about
 * whether the browser itself uses it for everything, or what else the browser
 * gives away. So the page reads the outside address, its country, the clock,
 * the languages and any video-call address, and at the same moment the proxy
 * is tested from the server, or this computer's own address is read when the
 * profile has no proxy. The two are compared line by line and the result is
 * saved on the profile with the time it was taken.
 */
export async function runSiteCheck(
  userId: string,
  profileId: string,
  target: CommandTarget,
  db: CustomShellDb = defaultDb
): Promise<SiteCheckResult> {
  const [row] = await db
    .select({ profile: promoProfiles, proxy: promoProxies })
    .from(promoProfiles)
    .leftJoin(promoProxies, eq(promoProxies.id, promoProfiles.proxyId))
    .where(and(eq(promoProfiles.id, profileId), eq(promoProfiles.userId, userId)))
    .limit(1)
  if (!row) throw new Error("That browser profile does not exist.")
  const { proxy } = row

  // Side by side, so both readings are of the same moment.
  const [seen, reference] = await Promise.all([
    browserSiteCheck(target),
    proxy ? proxyReference(proxy, db) : ownReference(),
  ])

  const checkedAt = new Date()
  const result: SiteCheckResult = {
    checkedAt: checkedAt.toISOString(),
    proxy:
      reference.kind === "proxy"
        ? {
            name: reference.name,
            address: reference.ip,
            country: reference.country,
            timezone: reference.timezone,
          }
        : null,
    lines: compareSiteCheck(
      {
        address: seen.address,
        country: seen.country,
        webrtc: seen.webrtc,
        timezone: seen.identity.timezone,
        languages: seen.identity.languages,
      },
      reference
    ),
  }

  await db
    .update(promoProfiles)
    .set({
      siteCheck: result,
      siteCheckedAt: checkedAt,
      // The check read the identity too, so the dashboard's summary is now
      // what a page read at this moment. Merged in the database rather than
      // written from what was read earlier, so a "Make a new identity" pressed
      // while the check ran is not undone.
      fingerprint: sql`coalesce(${promoProfiles.fingerprint}, '{}'::jsonb) || ${JSON.stringify({
        seen: seen.identity,
        seenAt: checkedAt.toISOString(),
      })}::jsonb`,
    })
    .where(eq(promoProfiles.id, profileId))

  return result
}

async function proxyReference(
  proxy: typeof promoProxies.$inferSelect,
  db: CustomShellDb
): Promise<Reference> {
  const tested = await testAndRecordProxy(proxy, db)
  return {
    kind: "proxy",
    name: proxy.label || proxy.host,
    ip: tested.ok ? (tested.ip ?? "") : "",
    country: tested.ok ? (tested.country ?? "") : "",
    timezone: tested.ok ? (tested.timezone ?? "") : "",
    error: tested.ok ? undefined : tested.error,
  }
}

async function ownReference(): Promise<Reference> {
  const own = await thisComputersAddress()
  return { kind: "own", ip: own?.ip ?? "", country: own?.country ?? "", timezone: own?.timezone ?? "" }
}
