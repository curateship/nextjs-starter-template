import { describe, expect, it } from "vitest"

import {
  assetName,
  imageProvider,
  normalizeAssetTags,
  openAiImageSize,
  providerMessage,
} from "./asset-factories"

describe("asset factories", () => {
  it("normalizes and de-duplicates tags", () => {
    expect(normalizeAssetTags(" Host, product, HOST, , Launch ")).toEqual([
      "host",
      "product",
      "launch",
    ])
  })

  it("keeps the provider's useful message without an unbounded response", () => {
    expect(
      providerMessage(JSON.stringify({ error: { message: "Quota exhausted" } }))
    ).toBe("Quota exhausted")
    expect(providerMessage("  temporarily   unavailable ")).toBe(
      "temporarily unavailable"
    )
  })

  it("requires a readable name", () => {
    expect(() => assetName("   ", "Actor")).toThrow("Actor name is required")
    expect(assetName("  Main   host  ", "Actor")).toBe("Main host")
  })

  it("routes actor image models to the right provider", () => {
    expect(imageProvider("gemini-2.5-flash-image")).toBe("gemini")
    expect(imageProvider("gpt-image-2")).toBe("openai")
  })

  it("uses supported portrait and landscape OpenAI sizes", () => {
    expect(openAiImageSize("9:16")).toBe("1024x1536")
    expect(openAiImageSize("16:9")).toBe("1536x1024")
  })
})
