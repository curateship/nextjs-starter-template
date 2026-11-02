import { and, eq, gte, inArray, lt, ne } from "drizzle-orm"

import {
  EDITOR_WINDOW_GONE_AFTER_MS,
  type EditorWindowCheckIn,
  type EditorWindowMode,
} from "@/lib/video/editor-windows"
import { now } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { getOwnedVideo } from "@/server/video/project-videos"
import { videoEditorWindows, videoProjectVideos } from "@/server/video/schema"

/**
 * The open editor windows of one video. Each window writes its own row every
 * 15 seconds and reads back the others, so a window opened second learns about
 * the first on its very first check-in. A window has one row in its project,
 * which moves to whichever video it has open.
 *
 * Only the video's owner can write or read these rows. The window's id is
 * made up by the browser, so it is only ever used together with a video the
 * caller owns.
 */

export async function checkInEditorWindow(
  userId: string,
  videoId: string,
  windowId: string,
  mode: EditorWindowMode,
  database: CustomShellDb = db
): Promise<EditorWindowCheckIn> {
  const { projectId } = await getOwnedVideo(userId, videoId, database)
  const at = now()
  const goneBefore = new Date(at.getTime() - EDITOR_WINDOW_GONE_AFTER_MS)

  await database
    .insert(videoEditorWindows)
    .values({ projectId, videoId, windowId, mode, openedAt: at, seenAt: at })
    .onConflictDoUpdate({
      target: [videoEditorWindows.projectId, videoEditorWindows.windowId],
      set: { videoId, mode, seenAt: at },
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
        eq(videoEditorWindows.videoId, videoId),
        ne(videoEditorWindows.windowId, windowId),
        eq(videoEditorWindows.mode, "edit"),
        gte(videoEditorWindows.seenAt, goneBefore)
      )
    )
    .orderBy(videoEditorWindows.openedAt)

  return { others_editing: others.map((row) => row.openedAt.toISOString()) }
}

/**
 * A window closing takes its row with it. Asking about a video that is gone
 * or belongs to somebody else deletes nothing and says nothing, because this
 * runs as the page unloads and nobody is left to read an error.
 */
export async function leaveEditorWindow(
  userId: string,
  videoId: string,
  windowId: string,
  database: CustomShellDb = db
) {
  await database
    .delete(videoEditorWindows)
    .where(
      and(
        eq(videoEditorWindows.videoId, videoId),
        eq(videoEditorWindows.windowId, windowId),
        inArray(
          videoEditorWindows.videoId,
          database
            .select({ id: videoProjectVideos.id })
            .from(videoProjectVideos)
            .where(
              and(
                eq(videoProjectVideos.id, videoId),
                eq(videoProjectVideos.userId, userId)
              )
            )
        )
      )
    )
}
