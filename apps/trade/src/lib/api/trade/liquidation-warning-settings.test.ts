import { beforeEach, expect, it, vi } from "vitest"
import type { LiquidationWarning } from "@/lib/trade/liquidation-warning"
import { dashboardBootstrapVersion } from "@/lib/trade/dashboard-bootstrap-cache"

const save = vi.hoisted(() => vi.fn())
vi.mock("@/server/trade/prefs", () => ({
  loadLiquidationWarning: vi.fn(),
  saveLiquidationWarning: save,
}))
vi.mock("@/server/guards", () => ({ userGet: {}, userPost: {} }))
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder = {
      middleware: () => builder,
      inputValidator: () => builder,
      handler:
        <T>(
          fn: (input: {
            data: LiquidationWarning
            context: { user: { id: string } }
          }) => T
        ) =>
        (input: { data: LiquidationWarning }) =>
          fn({ ...input, context: { user: { id: "account" } } }),
    }
    return builder
  },
}))

import { saveLiquidationWarningSettings } from "./liquidation-warning-settings"

beforeEach(() => {
  save.mockReset()
})

it("refreshes the next dashboard visit after an account warning save", async () => {
  const value = { usd: 200, pct: 5 }
  save.mockResolvedValue(value)
  const before = dashboardBootstrapVersion()
  expect(await saveLiquidationWarningSettings(value)).toEqual(value)
  expect(save).toHaveBeenCalledWith("account", value)
  expect(dashboardBootstrapVersion()).toBe(before + 1)
})

it("keeps the current dashboard answer when saving fails", async () => {
  save.mockRejectedValue(new Error("offline"))
  const before = dashboardBootstrapVersion()
  await expect(
    saveLiquidationWarningSettings({ usd: 200, pct: null })
  ).rejects.toThrow("offline")
  expect(dashboardBootstrapVersion()).toBe(before)
})
