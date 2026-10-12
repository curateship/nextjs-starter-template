import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  SCRIPT_CHECK_NO_TEXT_MESSAGE,
  SCRIPT_CHECK_PROMPT_CHARACTERS,
  type ScriptCheck,
} from "@/lib/video/script-check"

const metered = vi.hoisted(
  () => [] as { feature: string; metadata: Record<string, unknown> }[]
)
const asked = vi.hoisted(() => ({ prompt: "", answer: null as unknown }))
const saved = vi.hoisted(() => ({ bannedWords: [] as string[] }))

vi.mock("@/server/video/settings", () => ({
  getScriptBannedWords: async () => saved.bannedWords,
}))

// A fake writer: it records the question and answers with whatever the test
// set, checked against the schema the way a real writer's answer is.
vi.mock("@/server/video/writer", () => ({
  askWriter: async ({
    feature,
    metadata,
    prompt,
    schema,
    label,
  }: {
    feature: string
    metadata: Record<string, unknown>
    prompt: string
    schema: { safeParse: (value: unknown) => { success: boolean; data?: unknown } }
    label: string
  }) => {
    metered.push({ feature, metadata })
    asked.prompt = prompt
    const parsed = schema.safeParse(asked.answer)
    if (!parsed.success) {
      throw new Error(`${label} came back in an unexpected shape`)
    }
    return parsed.data
  },
}))

import { checkScript, scriptCheckPrompt } from "@/server/video/script-check"

const PASSED = { passed: true, words: [] as string[] }

function allPassed(): ScriptCheck {
  return {
    hook: PASSED,
    opener: PASSED,
    keepWatching: PASSED,
    bannedWords: PASSED,
    figures: PASSED,
  }
}

const SCRIPT =
  "In this video I will delve into 3 crucial tips. Here is the first one, and it is simple."

beforeEach(() => {
  metered.length = 0
  asked.prompt = ""
  asked.answer = allPassed()
  saved.bannedWords = ["delve", "crucial", "game-changer", "unlock"]
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("checking a script", () => {
  it("asks once, on its own meter, with every rule in the question", async () => {
    await checkScript({ userId: "user-1", script: SCRIPT, speed: 1 })

    expect(metered).toEqual([
      { feature: "script_check", metadata: { characters: SCRIPT.length } },
    ])
    for (const rule of [
      "hook",
      "opener",
      "keepWatching",
      "bannedWords",
      "figures",
    ]) {
      expect(asked.prompt).toContain(`"${rule}"`)
    }
    expect(asked.prompt).toContain("delve, crucial, game-changer, unlock")
    expect(asked.prompt).toContain('are "In this video I will delve into 3 crucial tips" (10 words)')
    expect(asked.prompt).toContain("[0:00 to 0:07] In this video")
  })

  it("hands back the failing words that are really in the script", async () => {
    asked.answer = {
      ...allPassed(),
      opener: { passed: false, words: ["In this video"] },
      // "unlock" is not in the script, so it cannot be shown as found there.
      bannedWords: { passed: false, words: ["delve", "crucial,", "unlock", "delve"] },
      figures: { passed: false, words: [" 3 ", "“3.”"] },
      // Only the stretches that were sent can be named.
      keepWatching: { passed: false, words: ["[0:00 to 0:07]", "1:00 to 1:30"] },
    }

    const result = await checkScript({ userId: "user-1", script: SCRIPT, speed: 1 })

    expect(result).toEqual({
      hook: PASSED,
      opener: { passed: false, words: ["In this video"] },
      keepWatching: { passed: false, words: ["0:00 to 0:07"] },
      bannedWords: { passed: false, words: ["delve", "crucial"] },
      figures: { passed: false, words: ["3"] },
    })
  })

  it("shows no words beside a rule that passed", async () => {
    asked.answer = { ...allPassed(), hook: { passed: true, words: ["In this"] } }
    const result = await checkScript({ userId: "user-1", script: SCRIPT, speed: 1 })
    expect(result.hook).toEqual(PASSED)
  })

  it("refuses an answer that leaves a rule out", async () => {
    const { figures: _left, ...rest } = allPassed()
    asked.answer = rest
    await expect(
      checkScript({ userId: "user-1", script: SCRIPT, speed: 1 })
    ).rejects.toThrow("Script check came back in an unexpected shape")
  })

  it("asks nothing, and charges nothing, for an empty script", async () => {
    await expect(
      checkScript({ userId: "user-1", script: "  \n ", speed: 1 })
    ).rejects.toThrow(SCRIPT_CHECK_NO_TEXT_MESSAGE)
    expect(metered).toEqual([])
  })
})

describe("the banned words saved on Settings", () => {
  it("are the ones the checker is asked about", async () => {
    saved.bannedWords = ["dive in", "honestly"]
    await checkScript({ userId: "user-1", script: SCRIPT, speed: 1 })
    expect(asked.prompt).toContain("capitals): dive in, honestly.")
    expect(asked.prompt).not.toContain("delve, crucial")
  })

  it("ban nothing when the list is empty, whatever the checker says", async () => {
    saved.bannedWords = []
    asked.answer = {
      ...allPassed(),
      bannedWords: { passed: false, words: ["delve"] },
    }
    const result = await checkScript({ userId: "user-1", script: SCRIPT, speed: 1 })
    expect(asked.prompt).toContain("No words are banned, so this rule always passes.")
    expect(result.bannedWords).toEqual(PASSED)
  })
})

describe("the price shown before the press", () => {
  it("is worked out from a question the length of the real one", () => {
    const starters = ["delve", "crucial", "game-changer", "unlock"]
    for (const script of [SCRIPT, SCRIPT.repeat(55).slice(0, 5_000)]) {
      const instructions =
        scriptCheckPrompt(script, 1, starters).length - script.length
      expect(Math.abs(instructions - SCRIPT_CHECK_PROMPT_CHARACTERS)).toBeLessThan(300)
    }
  })
})
