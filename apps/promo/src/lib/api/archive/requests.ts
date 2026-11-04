import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { adminGet, adminPost } from "@/server/guards"

/**
 * Ask for a video (part 42): a brief written in a Promo project becomes a
 * draft video in a Video project, with the brief as its notes and a bell in
 * Video. Admin only. Video's answer words pass through, since they say what
 * to fix ("Press Test on Video's Settings → Promo first").
 */

export function getRequestErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : ""
  return /^[A-Z][^\n]{3,300}[.!?]$/.test(message) && !/^Failed query/.test(message) ? message : "Video didn't take the request. Try again."
}

const projectsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<{ id: string; name: string }[]> => {
    const { callVideo } = await import("@/server/archive/video-link")
    const answer = (await callVideo(context.user.id, "/api/connect/promo/projects", undefined)) as { projects?: { id: string; name: string }[] }
    return (answer.projects ?? []).slice(0, 200)
  })

/** Video's projects, for the Ask for a video window. */
export function loadVideoProjects(): Promise<{ id: string; name: string }[]> {
  return projectsFn()
}

const askFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({ projectId: z.string().min(1).max(36), videoProjectId: z.string().min(1).max(36), brief: z.string().trim().min(1).max(4_000) })
  )
  .handler(async ({ context, data }): Promise<{ editUrl: string }> => {
    const { and, eq } = await import("drizzle-orm")
    const { db } = await import("@/server/db")
    const { promoProjects } = await import("@/server/social/schema")
    const [project] = await db
      .select({ name: promoProjects.name })
      .from(promoProjects)
      .where(and(eq(promoProjects.id, data.projectId), eq(promoProjects.userId, context.user.id)))
      .limit(1)
    if (!project) throw new Error("That project is not there any more.")
    const { callVideo } = await import("@/server/archive/video-link")
    const answer = (await callVideo(context.user.id, "/api/connect/promo/requests", {
      projectId: data.videoProjectId,
      brief: data.brief,
      promoProjectName: project.name,
    })) as { editUrl?: string }
    return { editUrl: typeof answer.editUrl === "string" ? answer.editUrl : "" }
  })

/** Sends the brief to Video, which makes the draft video and rings its bell. */
export function askForVideo(data: { projectId: string; videoProjectId: string; brief: string }): Promise<{ editUrl: string }> {
  return askFn({ data })
}
