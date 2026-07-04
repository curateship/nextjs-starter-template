import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  API_USAGE_WARNING_RATIO,
  apiUsagePeriodStart,
  apiUsageStatus,
  creditsForApiUsageFeature,
  estimateApiUsageCostUsd,
  wouldCrossUsageThreshold,
} from "./api-usage-policy"

describe("api usage policy", () => {
  it("uses UTC month starts for usage periods", () => {
    assert.equal(
      apiUsagePeriodStart(new Date("2026-07-31T23:59:59.000Z")).toISOString(),
      "2026-07-01T00:00:00.000Z"
    )
  })

  it("assigns fixed action credit weights", () => {
    assert.equal(creditsForApiUsageFeature("text_generation"), 1)
    assert.equal(creditsForApiUsageFeature("caption_generation"), 2)
    assert.equal(creditsForApiUsageFeature("voiceover"), 5)
    assert.equal(creditsForApiUsageFeature("image_generation"), 10)
    assert.equal(creditsForApiUsageFeature("ai_video_generation"), 50)
  })

  it("reports normal, warning, and blocked usage states", () => {
    assert.equal(apiUsageStatus(79, 100), "normal")
    assert.equal(apiUsageStatus(80, 100), "warning")
    assert.equal(apiUsageStatus(100, 100), "blocked")
  })

  it("detects first threshold crossings only", () => {
    assert.equal(API_USAGE_WARNING_RATIO, 0.8)
    assert.equal(wouldCrossUsageThreshold(79, 80, 100, "warning"), true)
    assert.equal(wouldCrossUsageThreshold(80, 81, 100, "warning"), false)
    assert.equal(wouldCrossUsageThreshold(99, 100, 100, "blocked"), true)
    assert.equal(wouldCrossUsageThreshold(100, 101, 100, "blocked"), false)
  })

  it("estimates USD costs from credits and rounds to cents", () => {
    assert.equal(estimateApiUsageCostUsd(1234, 0.01), 12.34)
    assert.equal(estimateApiUsageCostUsd(3, 0.333), 1)
    assert.equal(estimateApiUsageCostUsd(50, 0), 0)
    assert.equal(estimateApiUsageCostUsd(50, 0.01, "blocked"), 0)
  })
})
