// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { CopyDialog } from "@/components/social/copy-dialog"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { ViewerRelation } from "@/lib/trade/copy/copy-rules"

const api = vi.hoisted(() => ({
  acceptCopyTerms: vi.fn(),
  startCopying: vi.fn(),
  updateCopying: vi.fn(),
  sendCopyFeeApproval: vi.fn(),
}))
const toasts = vi.hoisted(() => ({
  showErrorToast: vi.fn(),
  dismissErrorToast: vi.fn(),
}))

vi.mock("@/lib/api/trade/copy-trading", () => ({
  ...api,
  getCopyErrorMessage: (error: unknown) => String(error),
}))
vi.mock("@/lib/toast/error-toast", () => toasts)
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }))

const PRACTICE = {
  id: "practice",
  label: "Practice",
  kind: "paper" as const,
  protocol: "hyperliquid" as const,
  refusal: null,
  needsFeeApproval: false,
  address: null,
}

function relation(over: Partial<ViewerRelation> = {}): ViewerRelation {
  return {
    signedIn: true,
    following: false,
    copy: null,
    consented: false,
    notCopyable: null,
    traderWallets: [
      { id: "sam-wallet", venue: "Hyperliquid 0x12…678", protocol: "hyperliquid" },
    ],
    myWallets: [PRACTICE],
    feeRate: 0.001,
    builderAddress: "0x9999999999999999999999999999999999999999",
    ...over,
  }
}

let host: HTMLDivElement
let root: Root
const onSaved = vi.fn()
const onClose = vi.fn()

beforeEach(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  // The Switch measures itself, which jsdom cannot do.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
  for (const fn of [...Object.values(api), ...Object.values(toasts)]) {
    fn.mockReset()
  }
  api.acceptCopyTerms.mockResolvedValue({ saved: true })
  api.startCopying.mockResolvedValue({ saved: true })
  onSaved.mockReset()
  onSaved.mockResolvedValue(undefined)
  onClose.mockReset()
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})

async function open(value: ViewerRelation) {
  await act(async () => {
    root.render(
      <TooltipProvider>
        <CopyDialog
          open
          handle="sam"
          relation={value}
          copy={null}
          onClose={onClose}
          onSaved={onSaved}
        />
      </TooltipProvider>
    )
  })
}

function button(name: string): HTMLButtonElement {
  const found = [...document.body.querySelectorAll("button")].find(
    (one) => one.textContent?.trim() === name
  )
  if (!found) throw new Error(`No button "${name}"`)
  return found
}

async function press(name: string) {
  await act(async () => {
    button(name).click()
  })
}

async function type(id: string, value: string) {
  const input = document.getElementById(id) as HTMLInputElement
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )?.set
    setter?.call(input, value)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
}

describe("the Copy window", () => {
  it("asks for the one-time note first, then starts a practice copy with the defaults", async () => {
    await open(relation())
    expect(document.body.textContent).toContain("This is not advice.")
    await press("I understand")
    expect(api.acceptCopyTerms).toHaveBeenCalledTimes(1)

    await press("Start copying")
    expect(api.startCopying).toHaveBeenCalledWith({
      handle: "sam",
      traderWalletId: "sam-wallet",
      settings: {
        walletId: "practice",
        dollarsPerTrade: 200,
        maxOpenUsd: 1_000,
        maxLeverage: 5,
        coins: null,
        priceAllowance: 0.01,
        lossLimitUsd: null,
      },
    })
    expect(onSaved).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("skips the note for a member who accepted it before", async () => {
    await open(relation({ consented: true }))
    expect(document.body.textContent).not.toContain("This is not advice.")
    expect(button("Start copying")).toBeTruthy()
  })

  it("refuses a cap smaller than one trade, marks the field and keeps what was typed", async () => {
    await open(relation({ consented: true }))
    await type("copy-max-open", "100")
    await press("Start copying")

    expect(api.startCopying).not.toHaveBeenCalled()
    expect(toasts.showErrorToast).toHaveBeenCalledWith(
      "The most in copied positions at once must be at least one trade's dollars."
    )
    const field = document.getElementById("copy-max-open") as HTMLInputElement
    expect(field.getAttribute("aria-invalid")).toBe("true")
    expect(field.value).toBe("100")
  })

  it("asks a real Hyperliquid wallet to approve Trade's fee before it copies", async () => {
    await open(
      relation({
        consented: true,
        myWallets: [
          {
            ...PRACTICE,
            id: "real",
            label: "Real",
            kind: "live",
            needsFeeApproval: true,
            address: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
          },
        ],
      })
    )
    await press("Start copying")

    expect(api.startCopying).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain("Approve Trade's fee")
    // $200 at 0.1% is 20 cents.
    expect(document.body.textContent).toContain("$0.20 on a $200.00 copy")
    expect(button("Approve and copy")).toBeTruthy()
  })
})
