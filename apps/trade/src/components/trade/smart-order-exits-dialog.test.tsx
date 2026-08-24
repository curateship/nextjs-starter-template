// @vitest-environment jsdom

import { act, useState } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { GridStopDialog } from "@/components/trade/grid-stop-dialog"
import { SmartLadderExitsDialog } from "@/components/trade/smart-ladder-exits-dialog"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { SmartGrid, SmartLadder } from "@/lib/trade/smart-plan"

const shared = {
  walletId: "wallet",
  marketKey: "hyperliquid:mainnet:BTC",
  status: "active" as const,
  flowRunId: null,
  createdAt: 1,
  updatedAt: 1,
}

const ladder = {
  ...shared,
  id: "ladder",
  kind: "dca",
  plan: {
    takeProfit: { mode: "average", pct: 2 },
    stopLoss: {
      mode: "average",
      pct: 5,
      base: { underPct: 1, reclaimDays: 2 },
    },
  },
} as unknown as SmartLadder

const grid = {
  ...shared,
  id: "grid",
  kind: "grid",
  plan: {
    levels: [{ status: "waiting", heldSz: 0, buyPx: 90 }],
    potPct: 10,
    follow: true,
    shifts: 0,
    bottomPx: 90,
    topPx: 100,
    takeProfitPx: null,
    stopLoss: {
      underPct: 2,
      base: { underPct: 1, reclaimDays: 2 },
    },
  },
} as SmartGrid

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean })
    .IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})

function control(id: string): HTMLButtonElement | HTMLInputElement {
  const found = document.getElementById(id)
  if (!(found instanceof HTMLButtonElement || found instanceof HTMLInputElement)) {
    throw new Error(`No form control with id ${id}`)
  }
  return found
}

async function draw(kind: "ladder" | "grid", busy: boolean) {
  await act(async () => {
    root.render(
      <TooltipProvider>
        {kind === "ladder" ? (
          <SmartLadderExitsDialog
            ladder={ladder}
            position={null}
            busy={busy}
            onSave={async () => true}
            onClose={() => undefined}
          />
        ) : (
          <GridStopDialog
            grid={grid}
            busy={busy}
            onSave={async () => true}
            onReshape={async () => true}
            onSetFollow={async () => true}
            onClose={() => undefined}
          />
        )}
      </TooltipProvider>
    )
  })
}

async function type(id: string, value: string) {
  const input = control(id)
  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`${id} is not an input`)
  }
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set
  await act(async () => {
    setter?.call(input, value)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
}

describe.each([
  [
    "ladder",
    [
      "ladder-tp-on",
      "ladder-tp-mode",
      "ladder-tp-pct",
      "ladder-sl-on",
      "ladder-sl-pct",
      "base-stop-on",
      "base-stop-under",
      "base-stop-reclaim",
    ],
  ],
  [
    "grid",
    [
      "grid-edit-levels",
      "grid-edit-pot",
      "grid-follow-on",
      "grid-stop-on",
      "grid-stop-pct",
      "base-stop-on",
      "base-stop-under",
      "base-stop-reclaim",
    ],
  ],
] as const)("the %s exits window", (kind, controlIds) => {
  it("locks every saved value only while the save is running", async () => {
    await draw(kind, false)
    for (const id of controlIds) expect(control(id).disabled).toBe(false)

    const changedId = kind === "ladder" ? "ladder-tp-pct" : "grid-edit-levels"
    const changedValue = kind === "ladder" ? "7" : "4"
    await type(changedId, changedValue)

    await draw(kind, true)
    for (const id of controlIds) expect(control(id).disabled).toBe(true)
    expect((control(changedId) as HTMLInputElement).value).toBe(changedValue)

    const save = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent?.includes("Save changes")
    )
    const cancel = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (button) => button.textContent?.trim() === "Cancel"
    )
    expect(save?.disabled).toBe(true)
    expect(save?.querySelector(".animate-spin")).not.toBeNull()
    expect(cancel?.disabled).toBe(true)

    await draw(kind, false)
    for (const id of controlIds) expect(control(id).disabled).toBe(false)
    expect((control(changedId) as HTMLInputElement).value).toBe(changedValue)
  })
})

it("keeps the ladder draft when a save is refused", async () => {
  let finishSave: (saved: boolean) => void = () => undefined
  const saving = new Promise<boolean>((resolve) => {
    finishSave = resolve
  })

  function RefusedSave() {
    const [busy, setBusy] = useState(false)
    return (
      <TooltipProvider>
        <SmartLadderExitsDialog
          ladder={ladder}
          position={null}
          busy={busy}
          onSave={async () => {
            setBusy(true)
            const saved = await saving
            setBusy(false)
            return saved
          }}
          onClose={() => undefined}
        />
      </TooltipProvider>
    )
  }

  await act(async () => root.render(<RefusedSave />))
  await type("ladder-tp-pct", "7")

  const save = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.textContent?.includes("Save changes")
  )
  await act(async () => save?.click())
  expect(control("ladder-tp-pct").disabled).toBe(true)

  await act(async () => {
    finishSave(false)
    await saving
  })
  expect(control("ladder-tp-pct").disabled).toBe(false)
  expect((control("ladder-tp-pct") as HTMLInputElement).value).toBe("7")
})
