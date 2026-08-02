import { describe, expect, it } from "vitest"

import {
  AI_MODEL_OPTIONS,
  AI_MODEL_PRICES,
  AI_PROVIDERS,
  aiCostCents,
  DEFAULT_AI_MODEL,
} from "@/lib/ai-models"

describe("aiCostCents", () => {
  it("prices a known model by the list", () => {
    // Claude Opus 5: $5 in + $25 out per million. A million of each is $30.
    expect(aiCostCents("claude-opus-5", 1_000_000, 1_000_000)).toBe(3000)
    // 200k in + 10k out = $1.00 + $0.25 = 125 cents.
    expect(aiCostCents("claude-opus-5", 200_000, 10_000)).toBe(125)
  })

  it("rounds to the nearest whole cent", () => {
    // Haiku: 1,000 input tokens = $0.001 — rounds down to 0 cents.
    expect(aiCostCents("claude-haiku-4-5", 1_000, 0)).toBe(0)
    // 10,000 input tokens = $0.01 — exactly 1 cent.
    expect(aiCostCents("claude-haiku-4-5", 10_000, 0)).toBe(1)
    // 14,999 input = $0.014999 — rounds to 1 cent, not truncated to 0.
    expect(aiCostCents("claude-haiku-4-5", 14_999, 0)).toBe(1)
  })

  it("costs zero for a model not on the price list, instead of throwing", () => {
    expect(aiCostCents("some-future-model", 500_000, 500_000)).toBe(0)
  })

  it("costs zero for zero tokens", () => {
    expect(aiCostCents("claude-opus-5", 0, 0)).toBe(0)
  })

  it("has a price for every model offered in the dropdowns", () => {
    // A model an admin can pick must never be a silent zero-cost hole in the
    // meter. (The reverse is fine: prices may outlive delisted models.)
    for (const provider of AI_PROVIDERS) {
      for (const option of AI_MODEL_OPTIONS[provider]) {
        expect(AI_MODEL_PRICES[option.id], option.id).toBeDefined()
      }
      expect(AI_MODEL_PRICES[DEFAULT_AI_MODEL[provider]]).toBeDefined()
    }
  })
})
