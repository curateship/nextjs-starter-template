import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import type {
  ViralVideoDetail,
  ViralVideoItem,
  ViralVideoListResponse,
  ViralVideoStats,
  ViralVideoStatus,
} from "@/server/viral-videos"
import type {
  SegmentRole,
  ViralVideoAnalysis,
} from "@/server/video-analysis"

export type {
  SegmentRole,
  ViralVideoAnalysis,
  ViralVideoDetail,
  ViralVideoItem,
  ViralVideoListResponse,
  ViralVideoStats,
  ViralVideoStatus,
}

const videoIdSchema = z.object({
  videoId: z.string().min(1).max(36),
})

const createViralVideoSchema = z.object({
  url: z.string().min(1).max(2048),
})

const viralVideoSafeErrorMessages = new Set([
  "Only TikTok and Instagram URLs are supported",
  "Video not found",
  "Video is already processed",
  "Video was not created",
])

export function getViralVideoErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return "Viral video request failed."
  if (viralVideoSafeErrorMessages.has(error.message)) return error.message
  return "Viral video request failed."
}

const listViralVideosFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<ViralVideoListResponse> => {
    const { listViralVideosForCurrentUser } = await import(
      "@/server/viral-videos"
    )
    return listViralVideosForCurrentUser()
  }
)

const getViralVideoFn = createServerFn({ method: "GET" })
  .inputValidator(videoIdSchema)
  .handler(async ({ data }): Promise<ViralVideoDetail> => {
    const { getViralVideoForCurrentUser } = await import(
      "@/server/viral-videos"
    )
    return getViralVideoForCurrentUser(data.videoId)
  })

const createViralVideoFn = createServerFn({ method: "POST" })
  .inputValidator(createViralVideoSchema)
  .handler(async ({ data }): Promise<ViralVideoItem> => {
    const { createViralVideoForCurrentUser } = await import(
      "@/server/viral-videos"
    )
    return createViralVideoForCurrentUser(data)
  })

const retryViralVideoFn = createServerFn({ method: "POST" })
  .inputValidator(videoIdSchema)
  .handler(async ({ data }): Promise<ViralVideoItem> => {
    const { retryViralVideoForCurrentUser } = await import(
      "@/server/viral-videos"
    )
    return retryViralVideoForCurrentUser(data.videoId)
  })

const deleteViralVideoFn = createServerFn({ method: "POST" })
  .inputValidator(videoIdSchema)
  .handler(async ({ data }): Promise<{ videoId: string }> => {
    const { deleteViralVideoForCurrentUser } = await import(
      "@/server/viral-videos"
    )
    return deleteViralVideoForCurrentUser(data.videoId)
  })

export function listViralVideos() {
  return listViralVideosFn()
}

export function getViralVideo(videoId: string) {
  return getViralVideoFn({ data: { videoId } })
}

export function createViralVideo(url: string) {
  return createViralVideoFn({ data: { url } })
}

export function retryViralVideo(videoId: string) {
  return retryViralVideoFn({ data: { videoId } })
}

export function deleteViralVideo(videoId: string) {
  return deleteViralVideoFn({ data: { videoId } })
}

const bulkDeleteViralVideosFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({ videoIds: z.array(z.string().min(1).max(36)).min(1).max(100) })
  )
  .handler(async ({ data }): Promise<{ deletedCount: number }> => {
    const { deleteViralVideosForCurrentUser } = await import(
      "@/server/viral-videos"
    )
    return deleteViralVideosForCurrentUser(data.videoIds)
  })

export function bulkDeleteViralVideos(videoIds: string[]) {
  return bulkDeleteViralVideosFn({ data: { videoIds } })
}
