import { and, eq } from "drizzle-orm"

import { PROJECT_NOT_FOUND_MESSAGE } from "@/lib/video/projects"
import { db, type CustomShellDb } from "@/server/db"
import { customShellMedia } from "@/server/schema"
import { videoProjects } from "@/server/video/schema"

type MediaRow = typeof customShellMedia.$inferSelect

export type ProjectLookForAi = {
  style: string | null
  picture: MediaRow | null
}

const NO_LOOK: ProjectLookForAi = { style: null, picture: null }

/**
 * A project's look as the AI tools need it: the style line, trimmed, and the
 * look picture's stored file. Only the owner's own picture is ever read. The
 * column is blanked when the picture is deleted, so a gone picture is simply
 * no picture.
 */
export async function readProjectLook(
  userId: string,
  projectId: string,
  database: CustomShellDb = db
): Promise<ProjectLookForAi> {
  const [row] = await database
    .select({ style: videoProjects.style, picture: customShellMedia })
    .from(videoProjects)
    .leftJoin(
      customShellMedia,
      and(
        eq(customShellMedia.id, videoProjects.styleMediaId),
        eq(customShellMedia.userId, userId),
        eq(customShellMedia.fileType, "image")
      )
    )
    .where(
      and(eq(videoProjects.id, projectId), eq(videoProjects.userId, userId))
    )
    .limit(1)
  if (!row) throw new Error(PROJECT_NOT_FOUND_MESSAGE)
  return { style: row.style?.trim() || null, picture: row.picture }
}

/** The look of the project picked on a dashboard, or none when none was. */
export function chosenProjectLook(
  userId: string,
  projectId: string | null | undefined
) {
  return projectId ? readProjectLook(userId, projectId) : Promise.resolve(NO_LOOK)
}

/** Only the style line, for an AI shot, which is sent no look picture. */
export async function readProjectStyle(
  userId: string,
  projectId: string,
  database: CustomShellDb = db
) {
  return (await readProjectLook(userId, projectId, database)).style
}
