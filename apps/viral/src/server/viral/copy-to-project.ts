import { and, eq } from "drizzle-orm"

import { viralSays } from "@/lib/viral/viral"
import { now } from "@/server/auth/security"
import { db } from "@/server/db"
import { parseVideoLink } from "@/server/viral/download"
import { requireOwnedViralProject } from "@/server/viral/projects"
import { saveVideo } from "@/server/viral/saved-videos"
import { viralProjectLinks, viralProjectResults } from "@/server/viral/schema"

/**
 * Copy to another project for one video on the right panel (task part 16,
 * Tyler: "Copy, both keep it"). The video joins the other project the way a
 * pasted link does: through `viral_project_links` and the person's one saved
 * row, so both projects show the same downloaded file. A video nobody saved
 * yet is saved with Download alone (no AI), so the copy has a file to play.
 * A project that already shows the video changes nothing.
 */

export type VideoCopyResult = { state: "copied" | "already"; projectName: string }

export async function copyVideoToProject(ownerId: string, input: { url: string; targetProjectId: string }): Promise<VideoCopyResult> {
  const target = await requireOwnedViralProject(ownerId, input.targetProjectId)
  if (target.isSample) throw viralSays("A sample project's videos are made up, so nothing can be copied into it.")
  if (target.archivedAt) throw viralSays(`"${target.name}" is archived. Bring it back first, then copy into it.`)

  let link: ReturnType<typeof parseVideoLink>
  try {
    link = parseVideoLink(input.url)
  } catch {
    throw viralSays("That video's link can't be read, so it can't be copied.")
  }
  if (link.platformVideoId.startsWith("sample-")) {
    throw viralSays("This is a made-up sample video, so there is nothing real to copy.")
  }

  const [found] = await db
    .select({ id: viralProjectResults.id })
    .from(viralProjectResults)
    .where(
      and(
        eq(viralProjectResults.projectId, target.id),
        eq(viralProjectResults.platform, link.platform),
        eq(viralProjectResults.platformVideoId, link.platformVideoId)
      )
    )
    .limit(1)
  if (found) return { state: "already", projectName: target.name }

  const saved = await saveVideo(ownerId, input.url, target.id, false)
  const added = await db
    .insert(viralProjectLinks)
    .values({ projectId: target.id, savedVideoId: saved.id, createdAt: now() })
    .onConflictDoNothing()
    .returning({ projectId: viralProjectLinks.projectId })
  return { state: added.length ? "copied" : "already", projectName: target.name }
}
