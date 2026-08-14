import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm"

import { resolveAppName } from "@/lib/branding"
import type { BroadcastBlock } from "@/lib/broadcasts/blocks"
import { db, type CustomShellDb } from "@/server/db"
import { storagePathForUrl } from "@/server/media/library"
import { customShellMedia, customShellWorkspaces } from "@/server/schema"
import { readShellGlobals } from "@/server/shell-settings"

/** The name an email shows when its logo is absent or images are switched off. */
export async function emailBrandName(
  workspaceId: string,
  database: CustomShellDb = db
) {
  const [[workspace], globals] = await Promise.all([
    database
      .select({ name: customShellWorkspaces.name })
      .from(customShellWorkspaces)
      .where(eq(customShellWorkspaces.id, workspaceId))
      .limit(1),
    readShellGlobals(database),
  ])

  return resolveAppName(workspace?.name || globals.appName)
}

/**
 * Makes every header picture in this send permanent.
 *
 * The URL alone is not trusted: it must point back into this app's bucket and
 * belong to the workspace doing the sending. Stamping happens before delivery,
 * because a provider may accept a message and the process may die before its
 * reply can be recorded.
 */
export async function protectSentEmailLogos(
  workspaceId: string,
  blocks: BroadcastBlock[],
  database: CustomShellDb = db,
  protectedAt = new Date()
) {
  const storagePaths = Array.from(
    new Set(
      blocks
        .filter((block) => block.kind === "header")
        .map((block) => storagePathForUrl(block.content.logoUrl))
        .filter((path): path is string => Boolean(path))
    )
  )
  if (!storagePaths.length) return 0

  const protectedRows = await database
    .update(customShellMedia)
    .set({ emailProtectedAt: protectedAt })
    .where(
      and(
        eq(customShellMedia.workspaceId, workspaceId),
        inArray(customShellMedia.storagePath, storagePaths),
        // Preserve the time the first inbox copy made the file permanent.
        isNull(customShellMedia.emailProtectedAt)
      )
    )
    .returning({ id: customShellMedia.id })

  const alreadyProtected = await database
    .select({ storagePath: customShellMedia.storagePath })
    .from(customShellMedia)
    .where(
      and(
        eq(customShellMedia.workspaceId, workspaceId),
        inArray(customShellMedia.storagePath, storagePaths),
        isNotNull(customShellMedia.emailProtectedAt)
      )
    )
  if (alreadyProtected.length !== storagePaths.length) {
    throw new Error("EMAIL_LOGO_MISSING")
  }

  return protectedRows.length
}
