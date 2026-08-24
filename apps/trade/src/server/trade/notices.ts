import { randomUUID } from "node:crypto"

import { eq } from "drizzle-orm"

import { db, type CustomShellDb } from "@/server/db"
import { publishNotificationCreated } from "@/server/notifications/events"
import {
  customShellAnnouncements,
  customShellNotifications,
  customShellUsers,
  customShellWorkspaces,
} from "@/server/schema"
import { tradeNoticeLinks } from "@/server/trade/schema"

/** Write one app notice to the wallet owner's current workspace and inbox. */
export async function writeTradeNotice({
  userId,
  title,
  body,
  level,
  href,
  createdAt = new Date(),
  database = db,
}: {
  userId: string
  title: string
  body: string
  level: "info" | "warning" | "critical"
  /**
   * The page this notice came off, so clicking it in the bell goes there.
   *
   * A path inside this app or nothing. Nothing is the honest answer for a
   * notice with no page behind it, and it leaves the notice exactly as every
   * trade notice used to be: words, and no click.
   */
  href?: string | null
  createdAt?: Date
  database?: CustomShellDb
}): Promise<void> {
  const [user] = await database
    .select({ currentWorkspaceId: customShellUsers.currentWorkspaceId })
    .from(customShellUsers)
    .where(eq(customShellUsers.id, userId))
    .limit(1)
  const [ownedWorkspace] = user?.currentWorkspaceId
    ? []
    : await database
        .select({ id: customShellWorkspaces.id })
        .from(customShellWorkspaces)
        .where(eq(customShellWorkspaces.userId, userId))
        .limit(1)
  const workspaceId = user?.currentWorkspaceId ?? ownedWorkspace?.id
  if (!workspaceId) throw new Error("TRADE_NOTICE_WORKSPACE")

  const announcementId = randomUUID()
  await database.insert(customShellAnnouncements).values({
    id: announcementId,
    workspaceId,
    title,
    body,
    level,
    audience: "app",
    showBanner: false,
    notify: true,
    startsAt: createdAt,
    endsAt: createdAt,
    createdAt,
    updatedAt: createdAt,
  })
  await database.insert(customShellNotifications).values({
    id: randomUUID(),
    recipientUserId: userId,
    type: "announcement",
    announcementId,
    createdAt,
  })
  // Written after the notice itself and only when there is a page to point at.
  // A notice that arrives without its address is still a true notice; one that
  // never arrives because its address would not save is a lost notice.
  if (href) {
    await database.insert(tradeNoticeLinks).values({ announcementId, href })
  }
  await publishNotificationCreated(userId, database)
}
