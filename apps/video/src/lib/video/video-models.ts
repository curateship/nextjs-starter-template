import { formatCents } from "@/lib/video/project-spend"

/**
 * The three companies an AI shot can be made by, what each one accepts, and
 * what each one costs (`workspace/docs/wan-and-seedance.md`).
 *
 * Google's prices live in the shell's price list, because Google is a shell
 * provider. Wan's and Seedance's live here instead, so the shell is never
 * touched for them, and the meter rows for them are written by
 * `src/server/video/video-meter.ts`.
 */

export const VIDEO_COMPANIES = ["gemini", "wan", "seedance"] as const
export type VideoCompany = (typeof VIDEO_COMPANIES)[number]

/** The two companies whose keys live on Settings → AI video. */
export const KEYED_COMPANIES = ["wan", "seedance"] as const
export type KeyedCompany = (typeof KEYED_COMPANIES)[number]

export const GEMINI_VIDEO_MODEL = "gemini-omni-1.1-flash"
export const WAN_VIDEO_MODEL = "wan2.7"
export const SEEDANCE_VIDEO_MODEL = "seedance-1.5-pro"

export const COMPANY_NAMES: Record<VideoCompany, string> = {
  gemini: "Google",
  wan: "Wan",
  seedance: "Seedance",
}

/** The sizes any of the three can make. Each model offers some of them. */
export const VIDEO_SIZES = ["360p", "480p", "720p", "1080p"] as const
export type VideoSize = (typeof VIDEO_SIZES)[number]

/**
 * What one company's model accepts. `endFrame` is a last picture the shot
 * lands on, `references` the actor's pictures sent beside the first frame,
 * `voice` a voiceover the person in the shot says, and `soundSwitch` whether
 * the company's own sound can be switched off.
 */
export type VideoModel = {
  company: VideoCompany
  id: string
  label: string
  sizes: readonly VideoSize[]
  defaultSize: VideoSize
  endFrame: boolean
  references: boolean
  voice: boolean
  soundSwitch: boolean
}

export const VIDEO_MODELS: Record<VideoCompany, VideoModel> = {
  gemini: {
    company: "gemini",
    id: GEMINI_VIDEO_MODEL,
    label: "Google Omni Flash",
    sizes: ["360p", "720p", "1080p"],
    defaultSize: "720p",
    endFrame: false,
    references: true,
    voice: false,
    soundSwitch: false,
  },
  wan: {
    company: "wan",
    id: WAN_VIDEO_MODEL,
    label: "Wan 2.7",
    sizes: ["720p", "1080p"],
    defaultSize: "720p",
    endFrame: true,
    references: true,
    voice: true,
    soundSwitch: false,
  },
  seedance: {
    company: "seedance",
    id: SEEDANCE_VIDEO_MODEL,
    label: "Seedance 1.5 Pro",
    sizes: ["480p", "720p", "1080p"],
    defaultSize: "720p",
    endFrame: true,
    // Seedance takes a first frame or reference pictures, never both, so an
    // actor's shot sends the first frame alone. It already shows the actor.
    references: false,
    voice: false,
    soundSwitch: true,
  },
}

/** The company that makes a model, or null for one not on the list. */
export function companyOf(model: string): VideoCompany | null {
  if (model === WAN_VIDEO_MODEL) return "wan"
  if (model === SEEDANCE_VIDEO_MODEL) return "seedance"
  // Shots asked for before 22 Oct 2026 name a Veo model, also Google's.
  if (model === GEMINI_VIDEO_MODEL || model.startsWith("veo-")) return "gemini"
  return null
}

export function isKeyedCompany(company: VideoCompany): company is KeyedCompany {
  return company === "wan" || company === "seedance"
}

/** A size this model makes: the one asked for, or the model's own default. */
export function sizeFor(company: VideoCompany, size: string | undefined): VideoSize {
  const model = VIDEO_MODELS[company]
  return (model.sizes as readonly string[]).includes(size ?? "")
    ? (size as VideoSize)
    : model.defaultSize
}

/**
 * Wan 2.7's price per finished second, from Alibaba's price page (Singapore,
 * read 29 Oct 2026, https://www.alibabacloud.com/help/en/model-studio/model-pricing).
 * The sound Wan makes is included.
 */
const WAN_DOLLARS_PER_SECOND: Partial<Record<VideoSize, number>> = {
  "720p": 0.1,
  "1080p": 0.15,
}

/**
 * Seedance 1.5 Pro is billed by tokens of video: width × height × 24 frames
 * × seconds ÷ 1024. BytePlus charges $2.40 a million tokens with sound and
 * $1.20 without (https://docs.byteplus.com/en/docs/ModelArk/1544106, read
 * 29 Oct 2026). The picture sizes are a 16:9 frame; 9:16 is the same turned.
 */
const SEEDANCE_PIXELS: Partial<Record<VideoSize, number>> = {
  "480p": 864 * 480,
  "720p": 1280 * 720,
  "1080p": 1920 * 1080,
}
const SEEDANCE_FPS = 24
export const SEEDANCE_DOLLARS_PER_MILLION = { sound: 2.4, silent: 1.2 }

export function seedanceTokens(size: VideoSize, seconds: number) {
  const pixels = SEEDANCE_PIXELS[size] ?? SEEDANCE_PIXELS["720p"]!
  return Math.round((pixels * SEEDANCE_FPS * seconds) / 1024)
}

/** What Seedance charges for this many tokens, in whole cents. */
export function seedanceTokenCents(tokens: number, sound: boolean) {
  const rate = sound
    ? SEEDANCE_DOLLARS_PER_MILLION.sound
    : SEEDANCE_DOLLARS_PER_MILLION.silent
  return Math.round(((tokens * rate) / 1_000_000) * 100)
}

/** What Wan charges for this many seconds at this size, in whole cents. */
export function wanSecondsCents(size: VideoSize, seconds: number) {
  const rate = WAN_DOLLARS_PER_SECOND[size] ?? WAN_DOLLARS_PER_SECOND["720p"]!
  return Math.round(seconds * rate * 100)
}

/**
 * What one piece on Wan or Seedance is expected to cost, in cents. Google's
 * pieces are priced by `pieceCostCents` in asset-factories.ts.
 */
export function keyedPieceCents(
  company: KeyedCompany,
  size: VideoSize,
  seconds: number,
  sound: boolean
) {
  return company === "wan"
    ? wanSecondsCents(size, seconds)
    : seedanceTokenCents(seedanceTokens(size, seconds), sound)
}

/** "$0.10 a second" for the price lines, worked out on a 10 second clip. */
export function keyedSecondPrice(company: KeyedCompany, size: VideoSize, sound: boolean) {
  const tenSeconds = keyedPieceCents(company, size, 10, sound)
  return `${formatCents(tenSeconds / 10)} a second`
}

/**
 * The addresses each company answers on. A key works only at the address of
 * the site it came from, so the region is saved beside it. Read from
 * Alibaba's base URL page and BytePlus's base URL page on 29 Oct 2026.
 */
export const WAN_REGIONS = [
  { id: "intl", label: "International (Singapore)", host: "dashscope-intl.aliyuncs.com" },
  { id: "china", label: "China (Beijing)", host: "dashscope.aliyuncs.com" },
] as const
export const SEEDANCE_REGIONS = [
  { id: "byteplus", label: "BytePlus (international)", host: "ark.ap-southeast.bytepluses.com" },
  { id: "volcengine", label: "Volcengine (China)", host: "ark.cn-beijing.volces.com" },
] as const

export type WanRegion = (typeof WAN_REGIONS)[number]["id"]
export type SeedanceRegion = (typeof SEEDANCE_REGIONS)[number]["id"]
export const DEFAULT_WAN_REGION: WanRegion = "intl"
export const DEFAULT_SEEDANCE_REGION: SeedanceRegion = "byteplus"

export function regionsFor(company: KeyedCompany) {
  return company === "wan" ? WAN_REGIONS : SEEDANCE_REGIONS
}

/** Where to get a key, said under each key box. */
export const KEY_HELP: Record<KeyedCompany, string> = {
  wan: "Wan is Alibaba's video model. Get a key from Alibaba Cloud Model Studio, under API keys. A key works only in the region it was made in.",
  seedance:
    "Seedance is ByteDance's video model. Get a key from BytePlus ModelArk, under API keys, and switch on Seedance 1.5 Pro there. A Volcengine key is for the China site.",
}
