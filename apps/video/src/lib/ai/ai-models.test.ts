import { describe, expect, it } from "vitest"

import {
  AI_MODEL_OPTIONS,
  AI_MODEL_PRICES,
  AI_PROVIDERS,
  AI_TEXT_PROVIDERS,
  AI_UNIT_PRICES,
  aiAllowanceCentsFromFeatures,
  aiCostCents,
  aiUnitCostCents,
  DEFAULT_AI_MODEL,
  isUnitPricedModel,
} from "@/lib/ai/ai-models"

describe("aiCostCents", () => {
  it("prices a known model by the list", () => {
    // Claude Opus 5: $5 in + $25 out per million. A million of each is $30.
    expect(aiCostCents("claude-opus-5", 1_000_000, 1_000_000)).toBe(3000)
    // 200k in + 10k out = $1.00 + $0.25 = 125 cents.
    expect(aiCostCents("claude-opus-5", 200_000, 10_000)).toBe(125)
    // GPT Image 2: $8 in + $30 out per million image tokens.
    expect(aiCostCents("gpt-image-2", 1_000_000, 1_000_000)).toBe(3800)
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
    // meter — priced by the token or by what it makes, but priced. (The
    // reverse is fine: prices may outlive delisted models.)
    const priced = (model: string) =>
      AI_MODEL_PRICES[model] !== undefined || AI_UNIT_PRICES[model] !== undefined
    for (const provider of AI_PROVIDERS) {
      for (const option of AI_MODEL_OPTIONS[provider]) {
        expect(priced(option.id), option.id).toBe(true)
      }
      expect(priced(DEFAULT_AI_MODEL[provider]), provider).toBe(true)
    }
  })
})

describe("work charged by what it makes rather than by the word", () => {
  it("knows which models those are", () => {
    expect(isUnitPricedModel("eleven_multilingual_v2")).toBe(true)
    expect(isUnitPricedModel("claude-opus-5")).toBe(false)
  })

  it("prices it by the unit", () => {
    // $0.15 per 1,000 characters: 10,000 characters is $1.50.
    expect(aiUnitCostCents("eleven_multilingual_v2", 10_000)).toBe(150)
    // Half that on the quicker voices.
    expect(aiUnitCostCents("eleven_flash_v2_5", 10_000)).toBe(75)
    expect(aiUnitCostCents("gemini-2.5-flash-image", 1)).toBe(4)
    expect(aiUnitCostCents("gemini-3.1-flash-image", 1)).toBe(7)
    expect(aiUnitCostCents("veo-3.1-generate-preview", 4)).toBe(160)
  })

  it("costs nothing for nothing, and never a negative", () => {
    expect(aiUnitCostCents("eleven_multilingual_v2", 0)).toBe(0)
    expect(aiUnitCostCents("eleven_multilingual_v2", -500)).toBe(0)
  })

  it("costs zero for a model not on the list, instead of throwing", () => {
    expect(aiUnitCostCents("some-future-voice", 10_000)).toBe(0)
  })

  it("has a price for every voice offered in the dropdown", () => {
    for (const option of AI_MODEL_OPTIONS.elevenlabs) {
      expect(AI_UNIT_PRICES[option.id], option.id).toBeDefined()
    }
  })
})

describe("which providers can answer in words", () => {
  it("leaves the voice one out, and is a subset of the whole list", () => {
    expect(AI_TEXT_PROVIDERS).not.toContain("elevenlabs")
    for (const provider of AI_TEXT_PROVIDERS) {
      expect(AI_PROVIDERS).toContain(provider)
    }
  })
})

describe("aiAllowanceCentsFromFeatures", () => {
  it("turns dollars a month into whole cents", () => {
    expect(aiAllowanceCentsFromFeatures({ aiDollars: 20 })).toBe(2000)
    expect(aiAllowanceCentsFromFeatures({ aiDollars: 19.5 })).toBe(1950)
  })

  it("keeps a real zero as a real ceiling of nothing", () => {
    expect(aiAllowanceCentsFromFeatures({ aiDollars: 0 })).toBe(0)
  })

  it("reads anything that is not a sound number as NO ceiling", () => {
    // Getting this backwards would lock everybody out of AI the day the key
    // is mistyped — missing must always mean unlimited, never zero.
    expect(aiAllowanceCentsFromFeatures({})).toBeNull()
    expect(aiAllowanceCentsFromFeatures({ aiDollars: "20" })).toBeNull()
    expect(aiAllowanceCentsFromFeatures({ aiDollars: -5 })).toBeNull()
    expect(aiAllowanceCentsFromFeatures({ aiDollars: null })).toBeNull()
    expect(aiAllowanceCentsFromFeatures({ aiDollars: Number.NaN })).toBeNull()
  })
})
