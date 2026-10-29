import {
  regionsFor,
  type KeyedCompany,
  type VideoSize,
} from "@/lib/video/video-models"
import type { AssetAspectRatio } from "@/lib/video/asset-factories"

/**
 * How Wan and Seedance are asked for a shot and asked about it
 * (`workspace/docs/wan-and-seedance.md`). Only the requests and the reading
 * of the answers live here; the background worker in
 * `asset-factories/generations.ts` does the rest, the same as for Google.
 *
 * Both companies start a job, hand back an id, and are asked about it on
 * later passes until a link to the finished file comes back. The link lasts
 * 24 hours, and the file is copied into the app's own storage at once.
 */

/** The model ids each company is sent. Volcengine's carry a "doubao-" prefix. */
export const WAN_FRAME_MODEL = "wan2.7-i2v-2026-04-25"
export const WAN_REFERENCE_MODEL = "wan2.7-r2v"
const SEEDANCE_MODEL = "seedance-1-5-pro-251215"

export function seedanceModelId(region: string) {
  return region === "volcengine" ? `doubao-${SEEDANCE_MODEL}` : SEEDANCE_MODEL
}

/** The address of a company's site, or the first one for a site not on the list. */
export function companyHost(company: KeyedCompany, region: string) {
  const regions = regionsFor(company)
  return (regions.find((item) => item.id === region) ?? regions[0]).host
}

/** A picture sent inside the request, as a data address. */
export type SentPicture = { mimeType: string; data: string }

function dataAddress(picture: SentPicture) {
  return `data:${picture.mimeType.toLowerCase()};base64,${picture.data}`
}

export type KeyedShotRequest = {
  prompt: string
  firstFrame: SentPicture
  /** The picture the shot lands on. */
  endFrame: SentPicture | null
  /** The actor's person board and backdrop. Wan only, and only without an end picture or voice. */
  references: SentPicture[]
  /** A public address of the voiceover the person says. Wan only. */
  voiceUrl: string | null
  size: VideoSize
  seconds: number
  aspectRatio: AssetAspectRatio
  sound: boolean
}

export type CompanyRequest = {
  url: string
  headers: Record<string, string>
  body: Record<string, unknown>
  /** The model id the company was sent, which the meter row names. */
  model: string
}

/**
 * Wan 2.7's request. With actor pictures it is the reference model, which
 * takes the first frame beside them. With an end picture or a voice it is
 * the frame model, which takes neither actor pictures nor a shape: the shot
 * keeps the first frame's shape, and the first frame already shows the actor.
 */
export function wanStartRequest(apiKey: string, region: string, shot: KeyedShotRequest): CompanyRequest {
  const useReferences = shot.references.length > 0 && !shot.endFrame && !shot.voiceUrl
  const media = [
    { type: "first_frame", url: dataAddress(shot.firstFrame) },
    ...(useReferences
      ? shot.references.map((picture) => ({ type: "reference_image", url: dataAddress(picture) }))
      : []),
    ...(!useReferences && shot.endFrame
      ? [{ type: "last_frame", url: dataAddress(shot.endFrame) }]
      : []),
    ...(!useReferences && shot.voiceUrl ? [{ type: "driving_audio", url: shot.voiceUrl }] : []),
  ]
  const model = useReferences ? WAN_REFERENCE_MODEL : WAN_FRAME_MODEL
  return {
    url: `https://${companyHost("wan", region)}/api/v1/services/aigc/video-generation/video-synthesis`,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      // Wan makes videos only in the background, and refuses without this.
      "X-DashScope-Async": "enable",
    },
    body: {
      model,
      input: { prompt: shot.prompt, media },
      parameters: {
        resolution: shot.size.toUpperCase(),
        duration: shot.seconds,
        ...(useReferences ? { ratio: shot.aspectRatio } : {}),
        watermark: false,
      },
    },
    model,
  }
}

/**
 * Seedance 1.5 Pro's request: the words, the first frame and the end
 * picture. Seedance refuses actor pictures beside a first frame, so none go.
 */
export function seedanceStartRequest(
  apiKey: string,
  region: string,
  shot: KeyedShotRequest
): CompanyRequest {
  const model = seedanceModelId(region)
  return {
    url: `https://${companyHost("seedance", region)}/api/v3/contents/generations/tasks`,
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: {
      model,
      content: [
        { type: "text", text: shot.prompt },
        { type: "image_url", image_url: { url: dataAddress(shot.firstFrame) }, role: "first_frame" },
        ...(shot.endFrame
          ? [{ type: "image_url", image_url: { url: dataAddress(shot.endFrame) }, role: "last_frame" }]
          : []),
      ],
      resolution: shot.size,
      ratio: shot.aspectRatio,
      duration: shot.seconds,
      generate_audio: shot.sound,
      watermark: false,
      // Seedance drops a job not done within this many seconds, so a piece
      // the worker gave up on is not made and billed later. Its shortest.
      execution_expires_after: 3600,
    },
    model,
  }
}

export function startRequest(
  company: KeyedCompany,
  apiKey: string,
  region: string,
  shot: KeyedShotRequest
) {
  return company === "wan"
    ? wanStartRequest(apiKey, region, shot)
    : seedanceStartRequest(apiKey, region, shot)
}

/** The job id in a company's answer to the start request, or null. */
export function startedJobId(company: KeyedCompany, answer: unknown): string | null {
  const value =
    company === "wan"
      ? (answer as { output?: { task_id?: unknown } })?.output?.task_id
      : (answer as { id?: unknown })?.id
  return typeof value === "string" && value ? value : null
}

/**
 * The job id saved on the piece: the site it was started on, then the
 * company's own id, so it is asked about on the same site even if the saved
 * site changes meanwhile.
 */
export function jobName(region: string, id: string) {
  return `${region}:${id}`
}

export function readJobName(name: string) {
  const at = name.indexOf(":")
  return at < 0 ? { region: "", id: name } : { region: name.slice(0, at), id: name.slice(at + 1) }
}

export function checkRequest(company: KeyedCompany, apiKey: string, name: string) {
  const job = readJobName(name)
  const host = companyHost(company, job.region)
  const id = encodeURIComponent(job.id)
  return {
    url:
      company === "wan"
        ? `https://${host}/api/v1/tasks/${id}`
        : `https://${host}/api/v3/contents/generations/tasks/${id}`,
    headers: { Authorization: `Bearer ${apiKey}` },
  }
}

/**
 * What a check says: still going, finished with a link and what was made,
 * or failed with the company's own code. `seconds` is what Wan billed and
 * `tokens` what Seedance billed.
 */
export type CheckAnswer =
  | { state: "running" }
  | { state: "done"; videoUrl: string; seconds: number | null; tokens: number | null }
  | { state: "failed"; code: string }

export function readCheck(company: KeyedCompany, answer: unknown): CheckAnswer {
  if (company === "wan") {
    const body = answer as {
      code?: string
      output?: { task_status?: string; video_url?: string; code?: string }
      usage?: { duration?: number; output_video_duration?: number }
    }
    const status = body?.output?.task_status
    if (status === "PENDING" || status === "RUNNING") return { state: "running" }
    if (status === "SUCCEEDED" && body.output?.video_url) {
      const seconds = body.usage?.output_video_duration ?? body.usage?.duration
      return {
        state: "done",
        videoUrl: body.output.video_url,
        seconds: typeof seconds === "number" ? seconds : null,
        tokens: null,
      }
    }
    // UNKNOWN is also what Wan says about a job it no longer has.
    return { state: "failed", code: body?.output?.code ?? status ?? "UNKNOWN" }
  }
  const body = answer as {
    status?: string
    content?: { video_url?: string }
    usage?: { completion_tokens?: number }
    error?: { code?: string }
  }
  if (body?.status === "queued" || body?.status === "running") return { state: "running" }
  if (body?.status === "succeeded" && body.content?.video_url) {
    const tokens = body.usage?.completion_tokens
    return {
      state: "done",
      videoUrl: body.content.video_url,
      seconds: null,
      tokens: typeof tokens === "number" ? tokens : null,
    }
  }
  return { state: "failed", code: body?.error?.code ?? body?.status ?? "unknown" }
}

/** The error code in a refused request's answer, or "" when there is none. */
export function errorCode(company: KeyedCompany, text: string) {
  try {
    const parsed = JSON.parse(text) as { code?: unknown; error?: { code?: unknown } }
    const code = company === "wan" ? parsed.code : parsed.error?.code
    return typeof code === "string" ? code : ""
  } catch {
    return ""
  }
}

const COMPANY_TITLE: Record<KeyedCompany, string> = { wan: "Wan", seedance: "Seedance" }

/**
 * A plain sentence for a refused request or a failed job. The company's own
 * wording never reaches the screen; its code is matched to what to do next.
 */
export function companyMessage(company: KeyedCompany, status: number, code: string) {
  const name = COMPANY_TITLE[company]
  if (status === 401 || /InvalidApiKey|Authentication|Unauthorized/i.test(code)) {
    return `${name} refused the key in Settings → AI video. Check the key, and that its region is the site it was made on.`
  }
  if (/Unpurchased|ModelNotOpen|AccessDenied/i.test(code)) {
    return `${name}'s model is not switched on for this account. Switch it on at the company's site, then press Try again.`
  }
  if (/Arrearage|Balance|Quota|Overdue/i.test(code)) {
    return `The ${name} account is out of credit. Top it up, then press Try again.`
  }
  if (/Sensitive|Inspection|Risk|Policy|Moderation|DataInspection/i.test(code)) {
    return `${name} refused the picture or the words as against its rules. Change the direction or the frame, then make it again.`
  }
  if (/InvalidParameter|BadRequest|InvalidArgument/i.test(code)) {
    return `${name} refused the request as it was put together. Try a different length or size.`
  }
  if (code === "UNKNOWN" || /expired/i.test(code)) {
    return `${name} no longer has this job. Press Try again to make it again.`
  }
  return `${name} could not make the video. Press Try again.`
}

/**
 * The finished file is fetched only from the companies' own storage, over
 * https, so a forged answer cannot point the server anywhere else.
 */
const RESULT_HOST_ENDINGS: Record<KeyedCompany, string[]> = {
  wan: [".aliyuncs.com"],
  seedance: [".volces.com", ".bytepluses.com", ".byteplus.com"],
}

export function isCompanyResultUrl(company: KeyedCompany, value: string) {
  try {
    const url = new URL(value)
    return (
      url.protocol === "https:" &&
      RESULT_HOST_ENDINGS[company].some((ending) => url.hostname.endsWith(ending))
    )
  } catch {
    return false
  }
}

/**
 * A request that proves a key without making anything or costing money.
 * Wan is asked about a job that does not exist, and Seedance for its list of
 * jobs. A refused key answers 401 on both.
 */
export function keyTestRequest(company: KeyedCompany, apiKey: string, region: string) {
  const host = companyHost(company, region)
  return {
    url:
      company === "wan"
        ? `https://${host}/api/v1/tasks/00000000-0000-4000-8000-000000000000`
        : `https://${host}/api/v3/contents/generations/tasks?page_size=1`,
    headers: { Authorization: `Bearer ${apiKey}` },
  }
}

export type KeyTestResult = { ok: true } | { ok: false; message: string }

export function readKeyTest(company: KeyedCompany, status: number): KeyTestResult {
  const name = COMPANY_TITLE[company]
  if (status >= 200 && status < 300) return { ok: true }
  // Wan may answer "no such job" rather than an empty job. Either way it read
  // the key first, so the key is good.
  if (company === "wan" && status === 404) return { ok: true }
  if (status === 401 || status === 403) {
    return {
      ok: false,
      message: `${name} refused this key. If it is right, it may belong to the other region.`,
    }
  }
  return { ok: false, message: `${name} did not answer properly (status ${status}). Try again in a moment.` }
}

export async function testCompanyKey(
  company: KeyedCompany,
  apiKey: string,
  region: string
): Promise<KeyTestResult> {
  const request = keyTestRequest(company, apiKey, region)
  try {
    const response = await fetch(request.url, {
      headers: request.headers,
      signal: AbortSignal.timeout(20_000),
    })
    return readKeyTest(company, response.status)
  } catch {
    return { ok: false, message: `${COMPANY_TITLE[company]} could not be reached. Try again in a moment.` }
  }
}
