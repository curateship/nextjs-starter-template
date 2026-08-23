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

/** Write one app notice to the wallet owner's current workspace and inbox. */
export async function writeTradeNotice({
  userId,
  title,
  body,
  level,
  createdAt = new Date(),
  database = db,
}: {
  userId: string
  title: string
  body: string
  level: "info" | "warning" | "critical"
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
  await publishNotificationCreated(userId, database)
}
