import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { APP_SETTING_DEFAULTS } from "@/lib/pomodoro/app-settings"
import { lineProblem, styleLine } from "@/lib/pomodoro/simulated-voice"
import { seededRandom } from "@/lib/pomodoro/simulated-days"
import { FIXED_LINES } from "@/lib/pomodoro/simulated-lines"
import { type CustomShellDb } from "@/server/db"
import { buildBrief, writeLine, type LineContext } from "@/server/pomodoro/simulated-voice"
import { createTestDatabase } from "@/server/test-support"

/**
 * Where a made-up member's words come from: the checks, the touches, the
 * brief, and the AI with its rewrite and fixed fallback, with the provider
 * stubbed at `fetch` so no request leaves the machine.
 */

const VOICE = APP_SETTING_DEFAULTS["simulated.voice"]
const CHECKS = { neverSay: VOICE.neverSay, blockedWords: ["darn"], handles: ["sam_r"] }

const CONTEXT: LineContext = {
  kind: "greet",
  speaker: { name: "Kenji Sato", personality: "Quiet, dry humour.", timezone: "Asia/Tokyo", city: "Tokyo" },
  roomName: "Night shift, rain",
  happened: "Sam just joined the room.",
  recent: [{ name: "Mia", body: "back in five" }],
  names: { name: "Sam" },
  handles: ["sam_r"],
}

describe("the checks", () => {
  it("refuse never-say phrases, a closing exclamation mark, links, emails, strangers' handles and blocked words", () => {
    expect(lineProblem("hey sam, starting in a min", CHECKS)).toBeNull()
    expect(lineProblem("Great job everyone", CHECKS)).toBe('says "great job"')
    expect(lineProblem("starting now!", CHECKS)).toBe('says "!"')
    expect(lineProblem("see pomoder.com/rooms", CHECKS)).toBe("has a link")
    expect(lineProblem("mail me at a@b.co", CHECKS)).toBe("has an email address")
    expect(lineProblem("hey @nobody", CHECKS)).toBe("names @nobody, who is not in the room")
    expect(lineProblem("hey @sam_r", CHECKS)).toBeNull()
    expect(lineProblem("darn this chapter", CHECKS)).toBe("has a blocked word")
    expect(lineProblem("x".repeat(141), CHECKS)).toBe("longer than 140 characters")
  })

  it("let every fixed line through the default rules", () => {
    for (const lines of Object.values(FIXED_LINES))
      for (const line of lines)
        expect(lineProblem(line.replace("{name}", "Sam").replace("{them}", "Sam"), { ...CHECKS, blockedWords: [] })).toBeNull()
  })
})

describe("the touches", () => {
  it("lowercase, drop emoji, and never put a typo in a name", () => {
    expect(styleLine("Hey Sam 🔥", VOICE, ["Sam"], Math.random)).toBe("hey sam")
    const typoVoice = { ...VOICE, typo: "1in10" as const }
    for (let seed = 0; seed < 200; seed += 1) {
      const line = styleLine("samantha samantha samantha", typoVoice, ["Samantha"], seededRandom("typo", seed))
      expect(line).toBe("samantha samantha samantha")
    }
    const typos = Array.from({ length: 200 }, (_, seed) =>
      styleLine("coffee number three", typoVoice, [], seededRandom("typo", seed))
    ).filter((line) => line !== "coffee number three")
    expect(typos.length).toBeGreaterThan(5)
    expect(typos.length).toBeLessThan(45)
  })
})

describe("the brief", () => {
  it("names the speaker's local time, the card's style, the room and the failure to fix", () => {
    const now = new Date("2099-03-04T14:30:00Z")
    const { system, request } = buildBrief(CONTEXT, VOICE, now, "says \"great job\"")
    expect(system).toContain("You are Kenji Sato, in Tokyo")
    expect(system).toContain("Wednesday 23:30")
    expect(system).toContain(VOICE.brief)
    expect(system).toContain("Never end with an exclamation mark.")
    expect(system).toContain("never say you are not one")
    expect(request).toContain('Room: "Night shift, rain"')
    expect(request).toContain("Mia: back in five")
    expect(request).toContain('Your last try was refused because it says "great job"')
  })
})

let client: PGlite
let db: CustomShellDb

beforeEach(async () => {
  ;({ client, db } = await createTestDatabase())
  void db
})

afterEach(async () => {
  vi.restoreAllMocks()
  delete process.env.CUSTOM_SHELL_ANTHROPIC_API_KEY
  await client.close()
})

function answer(text: string) {
  return new Response(
    JSON.stringify({ content: [{ type: "text", text }], stop_reason: "end_turn", usage: { input_tokens: 400, output_tokens: 12 } }),
    { status: 200, headers: { "content-type": "application/json" } }
  )
}

describe("writing a line", () => {
  it("uses the AI's line when it passes, with its cost", async () => {
    process.env.CUSTOM_SHELL_ANTHROPIC_API_KEY = "test-key"
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(answer("Hey Sam. starting in a min"))
    const written = await writeLine(CONTEXT, VOICE, [])
    expect(written.line).toBe("hey sam. starting in a min")
    expect(written.attempts).toHaveLength(1)
    expect(written.attempts[0]).toMatchObject({ source: "ai", model: "claude-haiku-4-5", rejectedReason: null })
    expect(written.attempts[0].costCents).toBeCloseTo((400 * 1 + 12 * 5) / 10_000, 6)
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe("https://api.anthropic.com/v1/messages")
    expect(JSON.parse(String(init?.body))).toMatchObject({ model: "claude-haiku-4-5", max_tokens: 100 })
  })

  it("writes again when a line fails, and falls back to a fixed line when the rewrite fails too", async () => {
    process.env.CUSTOM_SHELL_ANTHROPIC_API_KEY = "test-key"
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(answer("Great job everyone, let's do this"))
      .mockResolvedValueOnce(answer("darn, welcome"))
    const written = await writeLine(CONTEXT, VOICE, ["darn"])
    expect(written.attempts.map((attempt) => [attempt.source, attempt.rejectedReason])).toEqual([
      ["ai", 'says "great job"'],
      ["ai", "has a blocked word"],
      ["fixed", null],
    ])
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body)).messages[0].content).toContain(
      'Your last try was refused because it says "great job"'
    )
    expect(written.line).toBeTruthy()
    expect(lineProblem(written.line!, { ...CHECKS, blockedWords: ["darn"] })).toBeNull()
  })

  it("uses the fixed lines with no key, and when the call fails, without throwing", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
    const plain = await writeLine(CONTEXT, VOICE, [])
    expect(fetchMock).not.toHaveBeenCalled()
    expect(plain.attempts.map((attempt) => attempt.source)).toEqual(["fixed"])
    expect(plain.line).toBeTruthy()

    process.env.CUSTOM_SHELL_ANTHROPIC_API_KEY = "test-key"
    fetchMock.mockRejectedValue(new Error("network down"))
    const failed = await writeLine(CONTEXT, VOICE, [])
    expect(failed.attempts[0].rejectedReason).toBe("call failed: network down")
    expect(failed.attempts[1].source).toBe("fixed")
    expect(failed.line).toBeTruthy()
  })

  it("treats a declined answer as a failed call", async () => {
    process.env.CUSTOM_SHELL_ANTHROPIC_API_KEY = "test-key"
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ content: [], stop_reason: "refusal", usage: { input_tokens: 10, output_tokens: 0 } }), { status: 200 })
    )
    const written = await writeLine(CONTEXT, VOICE, [])
    expect(written.attempts[0].rejectedReason).toBe("call failed: the model declined")
    expect(written.attempts[1].source).toBe("fixed")
  })
})
