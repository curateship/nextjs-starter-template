import { and, eq, gte, inArray, lt, ne } from "drizzle-orm"

import {
  EDITOR_WINDOW_GONE_AFTER_MS,
  type EditorWindowCheckIn,
  type EditorWindowMode,
} from "@/lib/video/editor-windows"
import { now } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { getOwnedProject } from "@/server/video/projects"
import { videoEditorWindows, videoProjects } from "@/server/video/schema"

/**
 * The open editor windows of one project. Each window writes its own row every
 * 15 seconds and reads back the others, so a window opened second learns about
 * the first on its very first check-in.
 *
 * Only the project's owner can write or read these rows. The window's id is
 * made up by the browser, so it is only ever used together with a project the
 * caller owns.
 */

export async function checkInEditorWindow(
  userId: string,
  projectId: string,
  windowId: string,
  mode: EditorWindowMode,
  database: CustomShellDb = db
): Promise<EditorWindowCheckIn> {
  await getOwnedProject(userId, projectId, database)
  const at = now()
  const goneBefore = new Date(at.getTime() - EDITOR_WINDOW_GONE_AFTER_MS)

  await database
    .insert(videoEditorWindows)
    .values({ projectId, windowId, mode, openedAt: at, seenAt: at })
    .onConflictDoUpdate({
      target: [videoEditorWindows.projectId, videoEditorWindows.windowId],
      set: { mode, seenAt: at },
    })

  // Windows that closed without saying so, such as a laptop shut mid-edit,
  // are cleared out here rather than by a separate sweep.
  await database
    .delete(videoEditorWindows)
    .where(
      and(
        eq(videoEditorWindows.projectId, projectId),
        lt(videoEditorWindows.seenAt, goneBefore)
      )
    )

  const others = await database
    .select({ openedAt: videoEditorWindows.openedAt })
    .from(videoEditorWindows)
    .where(
      and(
        eq(videoEditorWindows.projectId, projectId),
        ne(videoEditorWindows.windowId, windowId),
        eq(videoEditorWindows.mode, "edit"),
        gte(videoEditorWindows.seenAt, goneBefore)
      )
    )
    .orderBy(videoEditorWindows.openedAt)

  return { others_editing: others.map((row) => row.openedAt.toISOString()) }
}

/**
 * A window closing takes its row with it. Asking about a project that is gone
 * or belongs to somebody else deletes nothing and says nothing, because this
 * runs as the page unloads and nobody is left to read an error.
 */
export async function leaveEditorWindow(
  userId: string,
  projectId: string,
  windowId: string,
  database: CustomShellDb = db
) {
  await database
    .delete(videoEditorWindows)
    .where(
      and(
        eq(videoEditorWindows.projectId, projectId),
        eq(videoEditorWindows.windowId, windowId),
        inArray(
          videoEditorWindows.projectId,
          database
            .select({ id: videoProjects.id })
            .from(videoProjects)
            .where(
              and(
                eq(videoProjects.id, projectId),
                eq(videoProjects.userId, userId)
              )
            )
        )
      )
    )
}
