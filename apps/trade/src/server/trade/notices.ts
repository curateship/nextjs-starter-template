import { createHash, randomUUID } from "node:crypto"

import { eq } from "drizzle-orm"

import { db, type CustomShellDb } from "@/server/trade/db"
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
  noticeKey,
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
  /** Stable within this recipient. Later pieces update the same inbox row. */
  noticeKey?: string
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

  const announcementId = noticeKey
    ? createHash("sha256")
        .update(JSON.stringify([userId, noticeKey]))
        .digest("hex")
        .slice(0, 36)
    : randomUUID()
  await database
    .insert(customShellAnnouncements)
    .values({
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
    .onConflictDoUpdate({
      target: customShellAnnouncements.id,
      set: { title, body, level, updatedAt: createdAt },
    })
  await database
    .insert(customShellNotifications)
    .values({
      id: announcementId,
      recipientUserId: userId,
      type: "announcement",
      announcementId,
      createdAt,
    })
    .onConflictDoNothing()
  // Written after the notice itself when it has a page or a sound. A notice
  // that arrives without this metadata is still true; one that never arrives
  // because metadata would not save is a lost notice.
  if (href || soundKind) {
    await database
      .insert(tradeNoticeLinks)
      .values({
        announcementId,
        href: href ?? null,
        soundKind: soundKind ?? null,
      })
      .onConflictDoNothing()
  }
  await publishNotificationCreated(userId, database)
}
