import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/api/trade/smart-orders", () => ({
  loadSmartDcaParams: vi.fn(),
  loadSmartGridParams: vi.fn(),
}))

import { loadSmartGridParams } from "@/lib/api/trade/smart-orders"
import { defaultGridParams, type GridParams } from "@/lib/trade/grid"

import {
  freshGridPrefs,
  knownGridPrefs,
  rememberGridPrefs,
  seedSmartPrefs,
} from "./smart-prefs-cache"

const priceAnchored: GridParams = { ...defaultGridParams(), anchor: "price" }
const clickAnchored: GridParams = { ...defaultGridParams(), anchor: "click" }

describe("the smart-order settings kept in the browser", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("remembers what a read answers", async () => {
    vi.mocked(loadSmartGridParams).mockResolvedValue({
      params: priceAnchored,
    })
    const answer = await freshGridPrefs()
    expect(answer?.anchor).toBe("price")
    expect(knownGridPrefs()?.anchor).toBe("price")
  })

  it("takes the page loader's seed only where nothing newer is known", () => {
    // The loader keeps its answer for up to a minute, so a revisit can hand
    // over settings older than a placement made in between. Filling an empty
    // slot is what the seed is for; replacing a newer copy is not.
    rememberGridPrefs(clickAnchored)
    seedSmartPrefs(null, priceAnchored)
    expect(knownGridPrefs()?.anchor).toBe("click")
  })

  it("never lets a read from before a placement overwrite the placement", async () => {
    // The read leaves first, while the server still says "price"...
    let finishRead: (value: { params: GridParams | null }) => void = () =>
      undefined
    vi.mocked(loadSmartGridParams).mockReturnValue(
      new Promise((resolve) => {
        finishRead = resolve
      })
    )
    const read = freshGridPrefs()

    // ...then a grid is placed with "click", which the server saves.
    rememberGridPrefs(clickAnchored)

    // The old answer lands late. It is from before the placement, so the
    // placement wins — this is the window flipping itself back to "Around
    // today's price" a moment after placing, which must never happen.
    finishRead({ params: priceAnchored })
    const answer = await read
    expect(answer?.anchor).toBe("click")
    expect(knownGridPrefs()?.anchor).toBe("click")
  })
})
