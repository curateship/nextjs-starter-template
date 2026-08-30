// @vitest-environment jsdom

import { act, useState } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { GridSettingsWindow } from "@/components/trade/grid-settings-window"
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
    levels: [
      { status: "waiting", heldSz: 0, buyPx: 90 },
      { status: "waiting", heldSz: 0, buyPx: 95 },
    ],
    potPct: 10,
    leverage: 1,
    maxLeverage: 50,
    follow: true,
    followDown: false,
    shifts: 0,
    downShifts: 0,
    carriedLevels: [],
    bottomPx: 90,
    topPx: 100,
    takeProfitPx: null,
    takeProfitPct: null,
    stopLoss: {
      underPct: 2,
      base: { underPct: 1, reclaimDays: 2 },
    },
  },
} as unknown as SmartGrid

let host: HTMLDivElement
let root: Root

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
})

function control(id: string): HTMLButtonElement | HTMLInputElement {
  const found = document.getElementById(id)
  if (!(
    found instanceof HTMLButtonElement || found instanceof HTMLInputElement
  )) {
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
          <GridSettingsWindow
            grid={grid}
            wallet="Test wallet"
            mark={100}
            busy={busy}
            onSave={async () => true}
            onReshape={async () => true}
            onSetEnd={async () => true}
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
      "grid-edit-leverage",
      "grid-end-on",
      "grid-follow-on",
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

    const save = [
      ...document.querySelectorAll<HTMLButtonElement>("button"),
    ].find((button) => button.textContent?.includes("Save changes"))
    const cancel = [
      ...document.querySelectorAll<HTMLButtonElement>("button"),
    ].find((button) => button.textContent?.trim() === "Cancel")
    expect(save?.disabled).toBe(true)
    expect(save?.querySelector(".animate-spin")).not.toBeNull()
    if (kind === "ladder") expect(cancel?.disabled).toBe(true)
    else expect(cancel).toBeUndefined()

    await draw(kind, false)
    for (const id of controlIds) expect(control(id).disabled).toBe(false)
    expect((control(changedId) as HTMLInputElement).value).toBe(changedValue)
  })
})

it("does not let a running grid remove its stop loss", async () => {
  await draw("grid", false)

  expect(document.getElementById("grid-stop-on")).toBeNull()
  expect(document.body.textContent).toContain("Stop loss")
  expect(control("grid-stop-pct").disabled).toBe(false)
})

it("offers to repair a running Short whose largest rung is at the bottom", async () => {
  const prices = [0.73364, 0.75134, 0.76945, 0.78801, 0.80701]
  const wrongShort = {
    ...grid,
    plan: {
      ...grid.plan,
      direction: "short" as const,
      bottomPx: prices[0],
      topPx: prices[prices.length - 1],
      levels: prices.map((buyPx, index) => ({
        status: "waiting" as const,
        heldSz: 0,
        buyPx,
        budget: [300, 250, 200, 150, 100][index],
      })),
      manualSizing: true,
      // Plan order is bottom to top. This is the SPX failure: $300 at the
      // bottom and $100 at the top of a selling grid.
      manualRungPcts: [30, 25, 20, 15, 10],
    },
  } as SmartGrid
  const reshape = vi.fn(async () => true)

  await act(async () => {
    root.render(
      <TooltipProvider>
        <GridSettingsWindow
          grid={wrongShort}
          wallet="Test wallet"
          mark={0.57}
          busy={false}
          onSave={async () => true}
          onReshape={reshape}
          onSetEnd={async () => true}
          onSetFollow={async () => true}
          onClose={() => undefined}
        />
      </TooltipProvider>
    )
  })

  const rows = [
    ...document.querySelectorAll<HTMLInputElement>(
      'input[id^="grid-edit-rung-"]'
    ),
  ]
  expect(rows.map((row) => row.value)).toEqual(["30", "25", "20", "15", "10"])

  const save = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.textContent?.includes("Save changes")
  )
  await act(async () => save?.click())

  expect(reshape).toHaveBeenCalledWith(
    wrongShort,
    expect.objectContaining({
      manualSizing: true,
      manualRungPcts: [30, 25, 20, 15, 10],
    })
  )
})

it("opens grid settings beside the cog with the Grid order UI", async () => {
  const cog = document.createElement("button")
  cog.getBoundingClientRect = () =>
    ({
      x: 700,
      y: 400,
      left: 700,
      top: 400,
      right: 716,
      bottom: 416,
      width: 16,
      height: 16,
      toJSON: () => ({}),
    }) as DOMRect

  await act(async () => {
    root.render(
      <TooltipProvider>
        <GridSettingsWindow
          grid={grid}
          anchor={cog}
          mark={100}
          busy={false}
          wallet="HL1"
          onSave={async () => true}
          onReshape={async () => true}
          onSetEnd={async () => true}
          onSetFollow={async () => true}
          onClose={() => undefined}
        />
      </TooltipProvider>
    )
  })

  const settings = document.querySelector<HTMLElement>(
    '[role="dialog"][aria-label="Settings for the BTC grid"]'
  )
  expect(settings?.style.left).toBe("388px")
  expect(settings?.style.top).toBe("128px")
  expect(
    settings?.querySelector("[data-slot=collapsible]")?.textContent
  ).toContain("Slices")
  expect(settings?.textContent).not.toContain("working between")
})

it("keeps four-decimal fixed exits when the ladder window opens twice", async () => {
  const fixed = {
    ...ladder,
    plan: {
      ...ladder.plan,
      takeProfit: { mode: "fixed" as const, pct: 2 },
      stopLoss: { mode: "fixed" as const, pct: 5, base: null },
    },
  } as SmartLadder
  const position = {
    entryPx: 100,
    tpPx: 102.34567,
    slPx: 94.32109,
  } as Parameters<typeof SmartLadderExitsDialog>[0]["position"]

  const render = async (open: boolean) => {
    await act(async () => {
      root.render(
        <TooltipProvider>
          <SmartLadderExitsDialog
            ladder={open ? fixed : null}
            position={position}
            busy={false}
            onSave={async () => true}
            onClose={() => undefined}
          />
        </TooltipProvider>
      )
    })
  }

  await render(true)
  expect((control("ladder-tp-pct") as HTMLInputElement).value).toBe("2.3457")
  expect((control("ladder-sl-pct") as HTMLInputElement).value).toBe("5.6789")
  await render(false)
  await render(true)
  expect((control("ladder-tp-pct") as HTMLInputElement).value).toBe("2.3457")
  expect((control("ladder-sl-pct") as HTMLInputElement).value).toBe("5.6789")
})

it("edits borrowing and End Grid from the grid gear window", async () => {
  const reshape = vi.fn(async () => true)
  const setEnd = vi.fn(async () => true)

  await act(async () => {
    root.render(
      <TooltipProvider>
        <GridSettingsWindow
          grid={grid}
          wallet="Test wallet"
          mark={100}
          busy={false}
          onSave={async () => true}
          onReshape={reshape}
          onSetEnd={setEnd}
          onSetFollow={async () => true}
          onClose={() => undefined}
        />
      </TooltipProvider>
    )
  })

  expect((control("grid-edit-leverage") as HTMLInputElement).value).toBe("1")
  expect(document.getElementById("grid-end-pct")).toBeNull()
  await type("grid-edit-leverage", "3")
  await act(async () => control("grid-end-on").click())
  await type("grid-end-pct", "7")

  const save = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.textContent?.includes("Save changes")
  )
  await act(async () => save?.click())

  expect(reshape).toHaveBeenCalledWith(
    grid,
    expect.objectContaining({ leverage: 3 })
  )
  expect(setEnd).toHaveBeenCalledWith(grid, 7)
})

it("adds a stop when an older running grid did not have one", async () => {
  const oldGrid = {
    ...grid,
    plan: { ...grid.plan, stopLoss: null },
  } as SmartGrid
  const saveStop = vi.fn(async () => true)

  await act(async () => {
    root.render(
      <TooltipProvider>
        <GridSettingsWindow
          grid={oldGrid}
          wallet="Test wallet"
          mark={100}
          busy={false}
          onSave={saveStop}
          onReshape={async () => true}
          onSetEnd={async () => true}
          onSetFollow={async () => true}
          onClose={() => undefined}
        />
      </TooltipProvider>
    )
  })
  const save = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.textContent?.includes("Save changes")
  )
  await act(async () => save?.click())

  expect(saveStop).toHaveBeenCalledWith(
    oldGrid,
    expect.objectContaining({ underPct: expect.any(Number) })
  )
})

it("does not reset a fixed stop when only following changes", async () => {
  const fixed = {
    ...grid,
    plan: {
      ...grid.plan,
      followDown: true,
      downShifts: 2,
      stopLoss: {
        mode: "fixed" as const,
        underPct: 2,
        px: 88,
        base: { underPct: 1, reclaimDays: 2 },
      },
    },
  } as SmartGrid
  const saveStop = vi.fn(async () => true)
  const saveFollowing = vi.fn(async () => true)

  await act(async () => {
    root.render(
      <TooltipProvider>
        <GridSettingsWindow
          grid={fixed}
          wallet="Test wallet"
          mark={100}
          busy={false}
          onSave={saveStop}
          onReshape={async () => true}
          onSetEnd={async () => true}
          onSetFollow={saveFollowing}
          onClose={() => undefined}
        />
      </TooltipProvider>
    )
  })
  await act(async () => control("grid-follow-on").click())
  const save = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.textContent?.includes("Save changes")
  )
  await act(async () => save?.click())

  expect(saveFollowing).toHaveBeenCalledWith(fixed, {
    up: false,
    down: true,
  })
  expect(saveStop).not.toHaveBeenCalled()
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
