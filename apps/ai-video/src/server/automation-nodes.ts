import { and, eq, inArray } from "drizzle-orm"

import { db } from "@/server/db"
import { aiVideoCreators, aiVideoViralVideos } from "@/server/schema"
import { normalizeReelUrl } from "@/server/creator-watch"
import { ingestViralVideoForUser } from "@/server/viral-videos"
import {
  createProjectFromTemplate,
  createTemplateFromViralVideo,
} from "@/server/video-templates"
import { listRecentUploads, type ViralPlatform } from "@/server/video-download"
import type { AutomationNode } from "@/lib/automations/automation"

// Executors for automation graph nodes: thin wrappers around the existing
// session-free pipeline functions. Each returns the step's output document;
// downstream steps read their direct upstream outputs merged by key.

export type AutomationStepOutput = {
  videoUrls?: string[]
  videoIds?: string[]
  templateIds?: string[]
  projectIds?: string[]
  // Human-readable line for the runs panel.
  summary: string
}

export type AutomationTriggerPayload = {
  creatorId?: string
  videoIds?: string[]
}

export type AutomationNodeContext = {
  userId: string
  triggerPayload: AutomationTriggerPayload | null
  // Merged outputs of the node's direct upstream steps.
  inputs: AutomationStepOutput
}

// How many uploads to list when checking a profile (same as creator-watch).
const PROFILE_LIST_LIMIT = 10
// Ingest analysis is fire-and-forget in-process work; poll the row until it
// settles. Reels analyze in a couple of minutes — 10 is generous headroom.
const INGEST_POLL_MS = 5_000
const INGEST_TIMEOUT_MS = 10 * 60_000

function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`
}

async function getOwnedCreator(userId: string, creatorId: string) {
  const [creator] = await db
    .select()
    .from(aiVideoCreators)
    .where(
      and(eq(aiVideoCreators.id, creatorId), eq(aiVideoCreators.userId, userId))
    )
    .limit(1)
  if (!creator) {
    throw new Error("Creator not found")
  }
  return creator
}

async function executeFindNewVideos(
  context: AutomationNodeContext,
  node: Extract<AutomationNode, { kind: "findNewVideos" }>
): Promise<AutomationStepOutput> {
  const creator = await getOwnedCreator(context.userId, node.creatorId)
  const { uploads } = await listRecentUploads(
    creator.platform as ViralPlatform,
    creator.username,
    PROFILE_LIST_LIMIT
  )

  const rows = await db
    .select({ sourceUrl: aiVideoViralVideos.sourceUrl })
    .from(aiVideoViralVideos)
    .where(eq(aiVideoViralVideos.userId, context.userId))
  const existing = new Set(rows.map((row) => normalizeReelUrl(row.sourceUrl)))

  const videoUrls = uploads
    .filter((upload) => !existing.has(normalizeReelUrl(upload.sourceUrl)))
    .slice(0, node.maxVideos)
    .map((upload) => upload.sourceUrl)

  return {
    videoUrls,
    summary: videoUrls.length
      ? `Found ${plural(videoUrls.length, "new video")} from @${creator.username}.`
      : `No new videos from @${creator.username}.`,
  }
}

// Poll the given viral-video rows until every one leaves the processing
// states. Returns ready ids and per-video errors.
async function waitForViralVideos(
  userId: string,
  videoIds: string[]
): Promise<{ readyIds: string[]; failures: string[] }> {
  if (videoIds.length === 0) return { readyIds: [], failures: [] }
  const deadline = Date.now() + INGEST_TIMEOUT_MS

  for (;;) {
    const rows = await db
      .select({
        id: aiVideoViralVideos.id,
        status: aiVideoViralVideos.status,
        error: aiVideoViralVideos.error,
      })
      .from(aiVideoViralVideos)
      .where(
        and(
          eq(aiVideoViralVideos.userId, userId),
          inArray(aiVideoViralVideos.id, videoIds)
        )
      )

    const pending = rows.filter(
      (row) => row.status === "downloading" || row.status === "analyzing"
    )
    if (pending.length === 0) {
      return {
        readyIds: rows
          .filter((row) => row.status === "ready")
          .map((row) => row.id),
        failures: rows
          .filter((row) => row.status === "error")
          .map((row) => row.error || "Video processing failed"),
      }
    }
    if (Date.now() >= deadline) {
      return {
        readyIds: rows
          .filter((row) => row.status === "ready")
          .map((row) => row.id),
        failures: pending.map(() => "Timed out waiting for video analysis"),
      }
    }
    await new Promise((resolve) => setTimeout(resolve, INGEST_POLL_MS))
  }
}

async function executeIngestVideos(
  context: AutomationNodeContext,
  node: Extract<AutomationNode, { kind: "ingestVideos" }>
): Promise<AutomationStepOutput> {
  const urls = (context.inputs.videoUrls ?? []).slice(0, node.maxVideos)
  if (urls.length === 0) {
    return { videoIds: [], summary: "No incoming videos to download." }
  }

  const startedIds: string[] = []
  const startFailures: string[] = []
  for (const url of urls) {
    try {
      const item = await ingestViralVideoForUser(context.userId, url)
      startedIds.push(item.id)
    } catch (error) {
      startFailures.push(
        error instanceof Error ? error.message : "Download failed"
      )
    }
  }

  const { readyIds, failures } = await waitForViralVideos(
    context.userId,
    startedIds
  )
  const allFailures = [...startFailures, ...failures]
  if (readyIds.length === 0 && allFailures.length > 0) {
    throw new Error(`All ${urls.length} downloads failed: ${allFailures[0]}`)
  }

  return {
    videoIds: readyIds,
    summary: allFailures.length
      ? `Analyzed ${plural(readyIds.length, "video")}; ${allFailures.length} failed (${allFailures[0]}).`
      : `Downloaded and analyzed ${plural(readyIds.length, "video")}.`,
  }
}

async function executeCreateTemplate(
  context: AutomationNodeContext,
  node: Extract<AutomationNode, { kind: "createTemplate" }>
): Promise<AutomationStepOutput> {
  const videoIds = context.inputs.videoIds ?? []
  if (videoIds.length === 0) {
    return { templateIds: [], summary: "No incoming videos to template." }
  }

  // Creator-posted runs hand over videos the watcher just started ingesting;
  // wait for their analysis the same way the ingest node does.
  const { readyIds, failures } = await waitForViralVideos(
    context.userId,
    videoIds
  )
  if (readyIds.length === 0) {
    throw new Error(
      failures[0] ?? "No incoming video finished analysis in time"
    )
  }

  const videos = await db
    .select({
      id: aiVideoViralVideos.id,
      title: aiVideoViralVideos.title,
    })
    .from(aiVideoViralVideos)
    .where(
      and(
        eq(aiVideoViralVideos.userId, context.userId),
        inArray(aiVideoViralVideos.id, readyIds)
      )
    )

  const templateIds: string[] = []
  const errors: string[] = []
  for (const video of videos) {
    const name = node.namePrefix || video.title || "Automation template"
    try {
      const template = await createTemplateFromViralVideo(
        context.userId,
        video.id,
        name
      )
      templateIds.push(template.id)
    } catch (error) {
      errors.push(
        error instanceof Error ? error.message : "Template creation failed"
      )
    }
  }
  if (templateIds.length === 0 && errors.length > 0) {
    throw new Error(errors[0])
  }

  return {
    templateIds,
    summary: errors.length
      ? `Created ${plural(templateIds.length, "template")}; ${errors.length} failed (${errors[0]}).`
      : `Created ${plural(templateIds.length, "template")}.`,
  }
}

async function executeCreateProject(
  context: AutomationNodeContext,
  node: Extract<AutomationNode, { kind: "createProject" }>
): Promise<AutomationStepOutput> {
  const templateIds = context.inputs.templateIds ?? []
  if (templateIds.length === 0) {
    return { projectIds: [], summary: "No incoming templates." }
  }

  const projectIds: string[] = []
  const errors: string[] = []
  for (const [index, templateId] of templateIds.entries()) {
    const name = node.namePrefix
      ? templateIds.length === 1
        ? node.namePrefix
        : `${node.namePrefix} ${index + 1}`
      : `Automation project ${new Date().toLocaleDateString("en-US")}`
    try {
      const { projectId } = await createProjectFromTemplate(
        context.userId,
        templateId,
        name
      )
      projectIds.push(projectId)
    } catch (error) {
      errors.push(
        error instanceof Error ? error.message : "Project creation failed"
      )
    }
  }
  if (projectIds.length === 0 && errors.length > 0) {
    throw new Error(errors[0])
  }

  return {
    projectIds,
    summary: errors.length
      ? `Created ${plural(projectIds.length, "project")}; ${errors.length} failed (${errors[0]}).`
      : `Created ${plural(projectIds.length, "project")}.`,
  }
}

export async function executeAutomationNode(
  context: AutomationNodeContext,
  node: AutomationNode
): Promise<AutomationStepOutput> {
  switch (node.kind) {
    case "manualTrigger":
      return { summary: "Started manually." }
    case "scheduleTrigger":
      return { summary: "Started by schedule." }
    case "creatorPostedTrigger": {
      const videoIds = context.triggerPayload?.videoIds ?? []
      return {
        videoIds,
        summary: videoIds.length
          ? `${plural(videoIds.length, "new video")} from a watched creator.`
          : "No new videos in this run.",
      }
    }
    case "findNewVideos":
      return executeFindNewVideos(context, node)
    case "ingestVideos":
      return executeIngestVideos(context, node)
    case "createTemplate":
      return executeCreateTemplate(context, node)
    case "createProject":
      return executeCreateProject(context, node)
  }
}
