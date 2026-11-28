import { z } from "zod"

import { arrivalShape } from "@/server/archive/arrivals"
import { arrive as archiveArrive, hello as archiveHello, helloShape as archiveHelloShape, projects as archiveProjects, sendStatus as archiveSendStatus } from "@/server/archive/connect"
import { answerVideo } from "@/server/archive/video-link"
import { isPromoCaller } from "@/server/video/promo-link"
import { applyPromoEvent, readFilePart, sendForToken as videoSendForToken, streamPart } from "@/server/video/promo-sends"
import {
  arrive as videoArrive,
  draftShape,
  hello as videoHello,
  helloShape as videoHelloShape,
  projects as videoProjects,
  sendStatus as videoSendStatus,
} from "@/server/video/viral-link/arrivals"
import { answerViral as videoAnswerViral } from "@/server/video/viral-link/link"
import { viralHello, viralHelloShape, viralProjects } from "@/server/viral-link/connect"
import { answerViral as promoAnswerViral } from "@/server/viral-link/link"
import { acceptPost, postShape } from "@/server/viral-link/posts"
import { acceptRead, readShape, readStatus } from "@/server/viral-link/reads"
import { promoCallerOwnerId } from "@/server/viral/promo-link"
import { applyPromoPosted, promoPostedShape } from "@/server/viral/promo-posts"
import { applyPromoReadAnswer, promoReadAnswerShape } from "@/server/viral/promo-reads"
import { readCallBody, videoCallerOwnerId } from "@/server/viral/video-link"
import { applyVideoEvent, sendForToken as viralSendForToken, streamSendFile } from "@/server/viral/video-sends"

/**
 * What each part of Content answers when another part calls it
 * (`workspace/docs/content-app.md`, "The links between Video, Promo and
 * Viral"). Video, Promo and Viral each answered these at web addresses under
 * `/api/connect/`, checked with a key. In Content they are no longer web
 * addresses: `links.ts` hands a call straight to the function here, with the
 * key Content made for it, so every check each side made still runs.
 *
 * The bodies are the three apps' own route handlers, unchanged. They are
 * grouped by the part that answers, because two parts answered the same path:
 * Video and Promo both answered Viral's `/api/connect/viral/hello`, and Video
 * and Viral both answered Promo's `/api/connect/promo/events`.
 */

export type LinkSide = "promo" | "video" | "viral"

type Handler = (request: Request, params: Record<string, string>) => Promise<Response>
type Route = { method: "GET" | "POST"; path: string; handle: Handler }

const NEVER_CACHE = { "cache-control": "no-store" }

const refuse = (status: number, error: string) => Response.json({ error }, { status, headers: NEVER_CACHE })

/** Video's answers to Promo: what happened to a send, the file it carries, and a video Promo asks for. */
const promoEventShape = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("arrived"),
    sendId: z.string().min(1).max(64),
    itemId: z.string().min(1).max(64),
    itemUrl: z.string().url().max(600),
  }),
  z.object({ type: z.literal("failed"), sendId: z.string().min(1).max(64), error: z.string().max(500).default("") }),
  z.object({
    type: z.literal("posted"),
    videoExportId: z.string().min(1).max(64),
    network: z.string().min(1).max(20),
    postUrl: z.string().max(600).default(""),
  }),
])

/** Viral's answers to Video: what happened to a Send to Video. */
const videoEventShape = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("arrived"),
    sendId: z.string().min(1).max(64),
    videoId: z.string().min(1).max(64),
    editUrl: z.string().url().max(600),
  }),
  z.object({ type: z.literal("failed"), sendId: z.string().min(1).max(64), error: z.string().max(500).default("") }),
])

const VIDEO: Route[] = [
  // From Promo.
  {
    method: "POST",
    path: "/api/connect/promo/events",
    handle: async (request) => {
      if (!(await isPromoCaller(request))) return refuse(401, "Video does not know this key.")
      if (Number(request.headers.get("content-length") ?? 0) > 20_000) return refuse(413, "This message is too large.")
      const parsed = promoEventShape.safeParse(await request.json().catch(() => null))
      if (!parsed.success) return refuse(400, "This message is not in a shape Video knows.")
      return Response.json(await applyPromoEvent(parsed.data), { headers: NEVER_CACHE })
    },
  },
  {
    method: "GET",
    path: "/api/connect/promo/file/:token",
    handle: async (request, params) => {
      const send = await videoSendForToken(params.token)
      const part = readFilePart(new URL(request.url).searchParams.get("part"))
      if (!send || !part) return refuse(404, "No such file.")
      try {
        return await streamPart(send, part)
      } catch (error) {
        console.error("A file for Promo could not be read", send.id, error)
        return refuse(502, "The file could not be read. Try again.")
      }
    },
  },
  // From Viral.
  { method: "POST", path: "/api/connect/viral/hello", handle: (request) => videoAnswerViral(request, videoHelloShape, (link, data) => videoHello(link, data)) },
  { method: "GET", path: "/api/connect/viral/projects", handle: (request) => videoAnswerViral(request, null, (link) => videoProjects(link)) },
  { method: "POST", path: "/api/connect/viral/drafts", handle: (request) => videoAnswerViral(request, draftShape, (link, data) => videoArrive(link, data)) },
  {
    method: "GET",
    path: "/api/connect/viral/sends/:sendId",
    handle: (request, params) => videoAnswerViral(request, null, (link) => videoSendStatus(link, params.sendId.slice(0, 64))),
  },
]

const PROMO: Route[] = [
  // From Video.
  { method: "POST", path: "/api/connect/video/hello", handle: (request) => answerVideo(request, archiveHelloShape, (link, data) => archiveHello(link, data)) },
  { method: "POST", path: "/api/connect/video/items", handle: (request) => answerVideo(request, arrivalShape, (link, data) => archiveArrive(link, data)) },
  { method: "GET", path: "/api/connect/video/projects", handle: (request) => answerVideo(request, null, (link) => archiveProjects(link)) },
  {
    method: "GET",
    path: "/api/connect/video/sends/:sendId",
    handle: (request, params) => answerVideo(request, null, (link) => archiveSendStatus(link, params.sendId.slice(0, 64))),
  },
  // From Viral.
  { method: "POST", path: "/api/connect/viral/hello", handle: (request) => promoAnswerViral(request, viralHelloShape, (link, data) => viralHello(link, data)) },
  { method: "GET", path: "/api/connect/viral/projects", handle: (request) => promoAnswerViral(request, null, (link) => viralProjects(link)) },
  { method: "POST", path: "/api/connect/viral/reads", handle: (request) => promoAnswerViral(request, readShape, (link, data) => acceptRead(link, data)) },
  {
    method: "GET",
    path: "/api/connect/viral/reads/:readId",
    handle: (request, params) => promoAnswerViral(request, null, (link) => readStatus(link, params.readId.slice(0, 64))),
  },
  { method: "POST", path: "/api/connect/viral/posts", handle: (request) => promoAnswerViral(request, postShape, (link, data) => acceptPost(link, data)) },
]

const VIRAL: Route[] = [
  // From Video.
  {
    method: "POST",
    path: "/api/connect/video/events",
    handle: async (request) => {
      const ownerId = await videoCallerOwnerId(request)
      if (!ownerId) return refuse(401, "Viral does not know this key.")
      const read = await readCallBody(request, 20_000)
      if (read.tooLarge) return refuse(413, "This message is too large.")
      const parsed = videoEventShape.safeParse(read.body)
      if (!parsed.success) return refuse(400, "This message is not in a shape Viral knows.")
      return Response.json(await applyVideoEvent(ownerId, parsed.data), { headers: NEVER_CACHE })
    },
  },
  {
    method: "GET",
    path: "/api/connect/video/file/:token",
    handle: async (request, params) => {
      const ownerId = await videoCallerOwnerId(request)
      if (!ownerId) return refuse(401, "Viral does not know this key.")
      const send = await viralSendForToken(ownerId, params.token)
      if (!send) return refuse(404, "No such file.")
      try {
        return await streamSendFile(send)
      } catch (error) {
        console.error("A file for Video could not be read", send.id, error)
        return refuse(502, "The file could not be read. Try again.")
      }
    },
  },
  // From Promo.
  {
    method: "POST",
    path: "/api/connect/promo/reads",
    handle: async (request) => {
      const ownerId = await promoCallerOwnerId(request)
      if (!ownerId) return refuse(401, "Viral does not know this key.")
      const read = await readCallBody(request, 2_000_000)
      if (read.tooLarge) return refuse(413, "This message is too large.")
      const parsed = promoReadAnswerShape.safeParse(read.body)
      if (!parsed.success) return refuse(400, "This message is not in a shape Viral knows.")
      return Response.json(await applyPromoReadAnswer(ownerId, parsed.data), { headers: NEVER_CACHE })
    },
  },
  {
    method: "POST",
    path: "/api/connect/promo/events",
    handle: async (request) => {
      const ownerId = await promoCallerOwnerId(request)
      if (!ownerId) return refuse(401, "Viral does not know this key.")
      const read = await readCallBody(request, 20_000)
      if (read.tooLarge) return refuse(413, "This message is too large.")
      const parsed = promoPostedShape.safeParse(read.body)
      if (!parsed.success) return refuse(400, "This message is not in a shape Viral knows.")
      return Response.json(await applyPromoPosted(ownerId, parsed.data), { headers: NEVER_CACHE })
    },
  },
]

export const LINK_ROUTES: Record<LinkSide, Route[]> = { video: VIDEO, promo: PROMO, viral: VIRAL }

/** The handler for a method and path on one part, and the path's named pieces. */
export function findLinkRoute(side: LinkSide, method: string, path: string): { handle: Handler; params: Record<string, string> } | null {
  const pieces = path.split("/")
  for (const route of LINK_ROUTES[side]) {
    if (route.method !== method.toUpperCase()) continue
    const wanted = route.path.split("/")
    if (wanted.length !== pieces.length) continue
    const params: Record<string, string> = {}
    const fits = wanted.every((piece, index) => {
      if (piece.startsWith(":")) {
        if (!pieces[index]) return false
        // A piece that is not valid percent-encoding names no route, rather than throwing.
        try {
          params[piece.slice(1)] = decodeURIComponent(pieces[index])
        } catch {
          return false
        }
        return true
      }
      return piece === pieces[index]
    })
    if (fits) return { handle: route.handle, params }
  }
  return null
}
