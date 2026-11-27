import { describe, expect, it } from "vitest"

import {
  keyedPieceCents,
  seedanceTokens,
  seedanceTokenCents,
  wanSecondsCents,
} from "@/lib/video/video-models"
import {
  checkRequest,
  companyMessage,
  errorCode,
  isCompanyResultUrl,
  jobName,
  readCheck,
  readKeyTest,
  seedanceStartRequest,
  startedJobId,
  wanStartRequest,
  type KeyedShotRequest,
} from "@/server/video/video-companies"

const picture = (data: string) => ({ mimeType: "image/JPEG", data })

function shot(change: Partial<KeyedShotRequest> = {}): KeyedShotRequest {
  return {
    prompt: "She waves",
    firstFrame: picture("first"),
    endFrame: null,
    references: [],
    voiceUrl: null,
    size: "720p",
    seconds: 8,
    aspectRatio: "9:16",
    sound: true,
    ...change,
  }
}

describe("Wan requests", () => {
  it("asks the reference model, with the first frame and the actor's pictures", () => {
    const request = wanStartRequest("test-wan-key", "intl", shot({ references: [picture("board")] }))
    expect(request.url).toBe(
      "https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis"
    )
    expect(request.headers).toMatchObject({
      Authorization: "Bearer test-wan-key",
      "X-DashScope-Async": "enable",
    })
    expect(request.body).toEqual({
      model: "wan2.7-r2v",
      input: {
        prompt: "She waves",
        media: [
          { type: "first_frame", url: "data:image/jpeg;base64,first" },
          { type: "reference_image", url: "data:image/jpeg;base64,board" },
        ],
      },
      parameters: { resolution: "720P", duration: 8, ratio: "9:16", watermark: false },
    })
  })

  it("drops the actor's pictures for an end picture, and sends no shape", () => {
    const request = wanStartRequest(
      "test-wan-key",
      "china",
      shot({ references: [picture("board")], endFrame: picture("end"), size: "1080p" })
    )
    expect(request.url).toContain("https://dashscope.aliyuncs.com/")
    expect(request.body).toEqual({
      model: "wan2.7-i2v-2026-04-25",
      input: {
        prompt: "She waves",
        media: [
          { type: "first_frame", url: "data:image/jpeg;base64,first" },
          { type: "last_frame", url: "data:image/jpeg;base64,end" },
        ],
      },
      parameters: { resolution: "1080P", duration: 8, watermark: false },
    })
  })

  it("sends a voiceover by its address for the person to say", () => {
    const request = wanStartRequest(
      "test-wan-key",
      "intl",
      shot({ voiceUrl: "https://media.test/voice.mp3" })
    )
    expect((request.body.input as { media: unknown[] }).media).toEqual([
      { type: "first_frame", url: "data:image/jpeg;base64,first" },
      { type: "driving_audio", url: "https://media.test/voice.mp3" },
    ])
  })

  it("reads the job id, and asks about it on the site it was started on", () => {
    expect(startedJobId("wan", { output: { task_id: "t-1", task_status: "PENDING" } })).toBe("t-1")
    expect(startedJobId("wan", { output: {} })).toBeNull()
    expect(checkRequest("wan", "test-wan-key", jobName("china", "t-1")).url).toBe(
      "https://dashscope.aliyuncs.com/api/v1/tasks/t-1"
    )
  })

  it("reads a finished, running and failed job", () => {
    expect(readCheck("wan", { output: { task_status: "RUNNING" } })).toEqual({ state: "running" })
    expect(
      readCheck("wan", {
        output: { task_status: "SUCCEEDED", video_url: "https://x.oss-ap-southeast-1.aliyuncs.com/a.mp4" },
        usage: { output_video_duration: 5, duration: 5 },
      })
    ).toEqual({
      state: "done",
      videoUrl: "https://x.oss-ap-southeast-1.aliyuncs.com/a.mp4",
      seconds: 5,
      tokens: null,
    })
    expect(
      readCheck("wan", { output: { task_status: "FAILED", code: "DataInspectionFailed" } })
    ).toEqual({ state: "failed", code: "DataInspectionFailed" })
    expect(readCheck("wan", { output: { task_status: "UNKNOWN" } })).toEqual({
      state: "failed",
      code: "UNKNOWN",
    })
  })
})

describe("Seedance requests", () => {
  it("sends the words, the first frame and the end picture, and never actor pictures", () => {
    const request = seedanceStartRequest(
      "ark-1",
      "byteplus",
      shot({ references: [picture("board")], endFrame: picture("end"), sound: false })
    )
    expect(request.url).toBe(
      "https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks"
    )
    expect(request.body).toEqual({
      model: "seedance-1-5-pro-251215",
      content: [
        { type: "text", text: "She waves" },
        { type: "image_url", image_url: { url: "data:image/jpeg;base64,first" }, role: "first_frame" },
        { type: "image_url", image_url: { url: "data:image/jpeg;base64,end" }, role: "last_frame" },
      ],
      resolution: "720p",
      ratio: "9:16",
      duration: 8,
      generate_audio: false,
      watermark: false,
      execution_expires_after: 3600,
    })
  })

  it("names the model with Volcengine's prefix on the China site", () => {
    const request = seedanceStartRequest("ark-1", "volcengine", shot())
    expect(request.url).toContain("https://ark.cn-beijing.volces.com/")
    expect(request.body.model).toBe("doubao-seedance-1-5-pro-251215")
  })

  it("reads the job id and the tokens it billed", () => {
    expect(startedJobId("seedance", { id: "cgt-1" })).toBe("cgt-1")
    expect(readCheck("seedance", { status: "queued" })).toEqual({ state: "running" })
    expect(
      readCheck("seedance", {
        status: "succeeded",
        content: { video_url: "https://ark-content.tos-ap-southeast-1.volces.com/a.mp4" },
        usage: { completion_tokens: 108900 },
      })
    ).toEqual({
      state: "done",
      videoUrl: "https://ark-content.tos-ap-southeast-1.volces.com/a.mp4",
      seconds: null,
      tokens: 108900,
    })
    expect(readCheck("seedance", { status: "failed", error: { code: "OutputVideoSensitiveContentDetected" } })).toEqual({
      state: "failed",
      code: "OutputVideoSensitiveContentDetected",
    })
  })
})

describe("what a refusal says", () => {
  it("says what to do, never the company's own wording", () => {
    expect(companyMessage("wan", 401, "InvalidApiKey")).toMatch(/refused the key in Settings → AI video/)
    expect(companyMessage("seedance", 404, "ModelNotOpen")).toMatch(/not switched on/)
    expect(companyMessage("wan", 400, "Arrearage")).toMatch(/out of credit/)
    expect(companyMessage("seedance", 200, "OutputVideoSensitiveContentDetected")).toMatch(
      /against its rules/
    )
    expect(companyMessage("wan", 200, "UNKNOWN")).toMatch(/no longer has this job/)
    expect(companyMessage("wan", 500, "Something odd")).toBe(
      "Wan could not make the video. Press Try again."
    )
  })

  it("reads each company's error code", () => {
    expect(errorCode("wan", '{"code":"InvalidApiKey","message":"Invalid API-key provided."}')).toBe(
      "InvalidApiKey"
    )
    expect(errorCode("seedance", '{"error":{"code":"AuthenticationError"}}')).toBe(
      "AuthenticationError"
    )
    expect(errorCode("wan", "not json")).toBe("")
  })

  it("fetches finished files only from the companies' own storage over https", () => {
    expect(isCompanyResultUrl("wan", "https://dashscope-result-sh.oss-accelerate.aliyuncs.com/a.mp4")).toBe(true)
    expect(isCompanyResultUrl("wan", "http://dashscope-result-sh.oss-accelerate.aliyuncs.com/a.mp4")).toBe(false)
    expect(isCompanyResultUrl("wan", "https://aliyuncs.com.evil.test/a.mp4")).toBe(false)
    expect(isCompanyResultUrl("seedance", "https://x.tos-ap-southeast-1.volces.com/a.mp4")).toBe(true)
    expect(isCompanyResultUrl("seedance", "https://x.aliyuncs.com/a.mp4")).toBe(false)
  })

  it("treats a refused key test as a bad key, and Wan's no-such-job as a good one", () => {
    expect(readKeyTest("wan", 200)).toEqual({ ok: true })
    expect(readKeyTest("wan", 404)).toEqual({ ok: true })
    expect(readKeyTest("seedance", 404).ok).toBe(false)
    expect(readKeyTest("seedance", 401)).toMatchObject({ ok: false })
  })
})

describe("prices", () => {
  it("prices Wan by the second at its size", () => {
    expect(wanSecondsCents("720p", 8)).toBe(80)
    expect(wanSecondsCents("1080p", 8)).toBe(120)
  })

  it("prices Seedance by its tokens, half as much without sound", () => {
    // 1280 × 720 × 24 frames × 10 seconds ÷ 1024 = 216,000 tokens.
    expect(seedanceTokens("720p", 10)).toBe(216000)
    // 216,000 × $2.40 a million = $0.5184.
    expect(seedanceTokenCents(216000, true)).toBe(52)
    expect(seedanceTokenCents(216000, false)).toBe(26)
    expect(keyedPieceCents("seedance", "720p", 10, true)).toBe(52)
  })
})
