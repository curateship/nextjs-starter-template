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
import type { TradeSoundKind } from "@/lib/trade/trade-sounds"

/** Write one app notice to the wallet owner's current workspace and inbox. */
export async function writeTradeNotice({
  userId,
  title,
  body,
  level,
  href,
  soundKind,
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
  /** The sound an open trading screen may play, or none for a quiet notice. */
  soundKind?: TradeSoundKind | null
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
  // Written after the notice itself when it has a page or a sound. A notice
  // that arrives without this metadata is still true; one that never arrives
  // because metadata would not save is a lost notice.
  if (href || soundKind) {
    await database.insert(tradeNoticeLinks).values({
      announcementId,
      href: href ?? null,
      soundKind: soundKind ?? null,
    })
  }
  await publishNotificationCreated(userId, database)
}
