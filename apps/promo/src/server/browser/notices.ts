import { PROXY_NOTICE_PREFIX } from "@/lib/browser/wording"
import type { ProxyTestResult } from "@/lib/social/options"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { publishNotificationCreated } from "@/server/notifications/events"
import { customShellNotifications } from "@/server/schema"

/**
 * The bell notices the browser side writes. One kind so far: a proxy that has
 * just stopped working.
 *
 * A notice is the shell's own `app_activity` row and nothing else. Its id is
 * the proxy's id, which does two jobs. The bell's link back to the proxy is
 * read straight off the id (see `src/lib/browser/notices.ts`), so no table of
 * links is needed. And a proxy can only ever have one notice: when it dies
 * again after recovering, the same notice is brought back to the top as
 * unread instead of a second one being added.
 */

export async function writeProxyDeadNotice(
  userId: string,
  proxy: { id: string; label: string; host: string },
  result: ProxyTestResult,
  db: CustomShellDb = defaultDb
): Promise<void> {
  const name = proxy.label || proxy.host
  const message = `${PROXY_NOTICE_PREFIX}${name} stopped working`
  const reason = (result.error || "It did not answer the test").replace(/\.?$/, ".")
  const detail = `${reason} Profiles using it cannot open a browser until it passes a test again.`
  const createdAt = new Date()

  await db
    .insert(customShellNotifications)
    .values({
      id: proxy.id,
      recipientUserId: userId,
      type: "app_activity",
      message,
      detail,
      createdAt,
    })
    .onConflictDoUpdate({
      target: customShellNotifications.id,
      set: { message, detail, createdAt, readAt: null, seenAt: null },
    })
  await publishNotificationCreated(userId, db)
}
