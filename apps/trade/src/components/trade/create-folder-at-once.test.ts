import { beforeEach, describe, expect, it, vi } from "vitest"

const api = vi.hoisted(() => ({ create: vi.fn() }))
const toast = vi.hoisted(() => vi.fn())
vi.mock("@/lib/api/trade/market-folders", () => ({
  createFolder: api.create,
  getMarketFolderErrorMessage: () => "A folder called Majors already exists.",
}))
vi.mock("@/lib/toast/error-toast", () => ({ showErrorToast: toast }))

import { createFolderAtOnce } from "@/components/trade/create-folder-at-once"
import type { MarketFolder } from "@/lib/trade/market-folders"

const stocks: MarketFolder = {
  id: "stocks",
  name: "Stocks",
  isFav: false,
  position: 3,
  hidden: false,
  marketKeys: ["hyperliquid:mainnet:BTC"],
}

beforeEach(() => vi.clearAllMocks())

/** A new folder shows at once, before the slow save answers (8 Nov 2026). */
describe("making a folder", () => {
  it("shows it last at once, then the list the server saved", async () => {
    const saved = [stocks, { ...stocks, id: "majors", name: "Majors", position: 4, marketKeys: [] }]
    api.create.mockResolvedValue(saved)
    const change = vi.fn()
    const done = createFolderAtOnce({ protocol: "hyperliquid", network: "mainnet", name: "Majors", folders: [stocks], onFoldersChange: change })
    expect(change).toHaveBeenCalledTimes(1)
    expect(change.mock.calls[0][0]).toMatchObject([stocks, { name: "Majors", position: 4, hidden: false, marketKeys: [] }])
    expect(await done).toBe(true)
    expect(change).toHaveBeenLastCalledWith(saved)
  })

  it("takes it back out and says why when the save is refused", async () => {
    api.create.mockRejectedValue(new Error("FOLDER_NAME_TAKEN"))
    const change = vi.fn()
    expect(
      await createFolderAtOnce({ protocol: "hyperliquid", network: "mainnet", name: "Majors", folders: [stocks], onFoldersChange: change })
    ).toBe(false)
    expect(change).toHaveBeenLastCalledWith([stocks])
    expect(toast).toHaveBeenCalledWith("A folder called Majors already exists.")
  })
})
