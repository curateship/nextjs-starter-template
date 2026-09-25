// @vitest-environment jsdom

import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/api/trade/aster-margin-mode", () => ({
  getAsterMarginModeLoadErrorMessage: vi.fn(() => "Could not load"),
  getAsterMarginModeSaveErrorMessage: vi.fn(() => "Could not save"),
  loadAsterMarginModes: vi.fn(),
  saveAsterMarginMode: vi.fn(),
}))
vi.mock("@/lib/toast/error-toast", () => ({
  showErrorToast: vi.fn(),
}))
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }))
vi.mock("@/components/ui/select", () => ({
  Select: ({
    value,
    disabled,
    onValueChange,
    children,
  }: {
    value: string
    disabled?: boolean
    onValueChange: (value: string) => void
    children: ReactNode
  }) => (
    <select
      aria-label="Aster margin mode"
      value={value}
      disabled={disabled}
      onChange={(event) => onValueChange(event.target.value)}
    >
      {children}
    </select>
  ),
  SelectTrigger: ({ children }: { children: ReactNode }) => children,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: ReactNode }) => children,
  SelectItem: ({ value, children }: { value: string; children: ReactNode }) => (
    <option value={value}>{children}</option>
  ),
}))

import { AsterMarginSettings } from "@/components/workers/aster-margin-settings"
import { TooltipProvider } from "@/components/ui/tooltip"
import {
  loadAsterMarginModes,
  saveAsterMarginMode,
} from "@/lib/api/trade/aster-margin-mode"
import { showErrorToast } from "@/lib/toast/error-toast"

let host: HTMLDivElement
let root: Root

function choose(select: HTMLSelectElement, value: string) {
  const setValue = Object.getOwnPropertyDescriptor(
    HTMLSelectElement.prototype,
    "value"
  )?.set
  setValue?.call(select, value)
  select.dispatchEvent(new Event("change", { bubbles: true }))
}

beforeEach(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.clearAllMocks()
})

describe("Aster margin settings", () => {
  it("draws the remembered mode while Aster is checked", async () => {
    vi.mocked(loadAsterMarginModes).mockReturnValue(new Promise(() => {}))

    await act(async () =>
      root.render(
        <TooltipProvider>
          <AsterMarginSettings
            initialWallets={[
              { walletId: "wallet-1", label: "Aster live", mode: "cross" },
            ]}
          />
        </TooltipProvider>
      )
    )

    expect(host.textContent).not.toContain("Loading Aster margin")
    expect(host.querySelector<HTMLSelectElement>("select")?.value).toBe("cross")
  })

  it("shows the exchange mode and saves a new choice", async () => {
    vi.mocked(loadAsterMarginModes).mockResolvedValue([
      { walletId: "wallet-1", label: "Aster live", mode: "cross" },
    ])
    vi.mocked(saveAsterMarginMode).mockResolvedValue({
      walletId: "wallet-1",
      label: "Aster live",
      mode: "isolated",
    })

    await act(async () =>
      root.render(
        <TooltipProvider>
          <AsterMarginSettings />
        </TooltipProvider>
      )
    )

    const select = host.querySelector<HTMLSelectElement>("select")!
    expect(select.value).toBe("cross")
    expect(host.textContent).toContain("Isolated uses USDT only")
    expect(host.textContent).toContain("USDC")

    await act(async () => choose(select, "isolated"))

    expect(saveAsterMarginMode).toHaveBeenCalledWith("wallet-1", "isolated")
    expect(select.value).toBe("isolated")
  })

  it("restores the previous choice when Aster refuses the change", async () => {
    vi.mocked(loadAsterMarginModes).mockResolvedValue([
      { walletId: "wallet-1", label: "Aster live", mode: "isolated" },
    ])
    vi.mocked(saveAsterMarginMode).mockRejectedValue(
      new Error("LIVE_MARGIN_MODE")
    )

    await act(async () =>
      root.render(
        <TooltipProvider>
          <AsterMarginSettings />
        </TooltipProvider>
      )
    )
    const select = host.querySelector<HTMLSelectElement>("select")!
    await act(async () => choose(select, "cross"))

    expect(select.value).toBe("isolated")
    expect(showErrorToast).toHaveBeenCalledWith("Could not save")
  })

  it("offers to try the load again after a failure", async () => {
    vi.mocked(loadAsterMarginModes)
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce([])

    await act(async () =>
      root.render(
        <TooltipProvider>
          <AsterMarginSettings />
        </TooltipProvider>
      )
    )
    expect(host.textContent).toContain(
      "Aster's margin setting could not be loaded."
    )

    await act(async () => {
      host.querySelector<HTMLButtonElement>("button")!.click()
    })

    expect(loadAsterMarginModes).toHaveBeenCalledTimes(2)
    expect(host.textContent).toContain(
      "Connect and switch on an Aster mainnet wallet to choose its margin mode."
    )
  })
})
