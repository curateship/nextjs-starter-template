// @vitest-environment jsdom

import { act, useState } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { GridSettingsWindow } from "@/components/trade/grid-settings-window"
import { SmartLadderSettingsWindow } from "@/components/trade/smart-ladder-settings-window"
import { TooltipProvider } from "@/components/ui/tooltip"
import { baseStopDetection } from "@/lib/trade/dca"
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
    anchorPx: 100,
    anchor: "click",
    rungEntry: "market",
    startedAt: 1,
    baseDetection: baseStopDetection(),
    sizeDecimals: 3,
    priceTick: null,
    maxLeverage: 50,
    leverage: 1,
    maxPositionPct: 20,
    sizeMultiplier: 2,
    maxOrderVolPct: 0,
    rungs: [
      {
        px: 95,
        sz: 1,
        budget: 95,
        status: "filled",
        orderId: null,
        sellOrderId: null,
        dead: false,
        touched: false,
      },
      {
        px: 87.4,
        sz: 2,
        budget: 174.8,
        status: "waiting",
        orderId: null,
        sellOrderId: null,
        dead: false,
        touched: false,
      },
    ],
    exitRungs: [],
    exitLadderVersion: 2,
    takeProfit: { mode: "average", pct: 2 },
    stopLoss: {
      mode: "percent",
      pct: 5,
      base: { underPct: 1, reclaimDays: 2 },
    },
    aimedTpPx: null,
    aimedSlPx: null,
    twoGreen: false,
    greenInterval: null,
    green: null,
    steppedDown: 0,
    awaitingSteppedRung: false,
    awaitingRungAfterWipe: false,
    baseWatch: null,
    reclaim: null,
    cascade: null,
    cascadeSeenAt: null,
    entryLimit: null,
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
          <SmartLadderSettingsWindow
            ladder={ladder}
            wallet="Test wallet"
            equity={1_000}
            market={null}
            interval="1m"
            position={null}
            busy={busy}
            onSaveExits={async () => true}
            onReshape={async () => true}
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

it("keeps money and level edits locked while one grid entry is open", async () => {
  const held = {
    ...grid,
    plan: {
      ...grid.plan,
      levels: [
        grid.plan.levels[0],
        { ...grid.plan.levels[1], status: "holding", heldSz: 1 },
      ],
    },
  } as SmartGrid

  await act(async () => {
    root.render(
      <TooltipProvider>
        <GridSettingsWindow
          grid={held}
          wallet="Test wallet"
          mark={100}
          busy={false}
          onSave={async () => true}
          onReshape={async () => true}
          onSetEnd={async () => true}
          onSetFollow={async () => true}
          onClose={() => undefined}
        />
      </TooltipProvider>
    )
  })

  expect(control("grid-edit-levels").disabled).toBe(true)
  expect(control("grid-edit-pot").disabled).toBe(true)
  expect(control("grid-edit-leverage").disabled).toBe(true)
})

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
] as const)("the %s settings window", (kind, controlIds) => {
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
    expect(cancel).toBeUndefined()

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

it("does not save running-grid rung shares unless they add up to 100%", async () => {
  const reshape = vi.fn(async () => true)
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
          onSetEnd={async () => true}
          onSetFollow={async () => true}
          onClose={() => undefined}
        />
      </TooltipProvider>
    )
  })

  await act(async () => control("grid-edit-rungs").click())
  const firstRung = document.querySelector<HTMLInputElement>(
    'input[id^="grid-edit-rung-"]'
  )
  if (!firstRung) throw new Error("The Rungs card did not show its inputs")
  await type(firstRung.id, "40")

  const save = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.textContent?.includes("Save changes")
  )
  await act(async () => save?.click())

  expect(document.body.textContent).toContain("have to add up to 100%")
  expect(reshape).not.toHaveBeenCalled()
})

it("still lets an older partial-split grid move its stop", async () => {
  const older = {
    ...grid,
    plan: {
      ...grid.plan,
      direction: "long" as const,
      manualSizing: true,
      manualRungPcts: [30, 15],
      levels: [
        { status: "waiting" as const, heldSz: 0, buyPx: 90, budget: 300 },
        { status: "holding" as const, heldSz: 1, buyPx: 95, budget: 150 },
      ],
    },
  } as SmartGrid
  const saveStop = vi.fn(async () => true)
  const reshape = vi.fn(async () => true)
  await act(async () => {
    root.render(
      <TooltipProvider>
        <GridSettingsWindow
          grid={older}
          wallet="Test wallet"
          mark={100}
          busy={false}
          onSave={saveStop}
          onReshape={reshape}
          onSetEnd={async () => true}
          onSetFollow={async () => true}
          onClose={() => undefined}
        />
      </TooltipProvider>
    )
  })

  await type("grid-stop-pct", "3")
  const save = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.textContent?.includes("Save changes")
  )
  await act(async () => save?.click())

  expect(saveStop).toHaveBeenCalledOnce()
  expect(reshape).not.toHaveBeenCalled()
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

it("opens an untouched ladder beside its cog and saves every placement setting", async () => {
  const untouched = {
    ...ladder,
    plan: {
      ...ladder.plan,
      rungs: ladder.plan.rungs.map((rung) => ({
        ...rung,
        status: "waiting" as const,
      })),
    },
  } as SmartLadder
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
  const reshape = vi.fn(async () => true)

  await act(async () => {
    root.render(
      <TooltipProvider>
        <SmartLadderSettingsWindow
          ladder={untouched}
          anchor={cog}
          wallet="Test wallet"
          equity={1_000}
          market={null}
          interval="15m"
          position={null}
          busy={false}
          onSaveExits={async () => true}
          onReshape={reshape}
          onClose={() => undefined}
        />
      </TooltipProvider>
    )
  })

  const settings = document.querySelector<HTMLElement>(
    '[role="dialog"][aria-label="Settings for the BTC DCA ladder"]'
  )
  expect(settings?.style.left).toBe("388px")
  expect(settings?.style.top).toBe("128px")
  for (const id of [
    "ladder-rung-1",
    "ladder-pot",
    "ladder-ramp",
    "ladder-leverage",
    "ladder-tp-mode",
    "ladder-tp-pct",
    "ladder-sl-pct",
  ]) {
    expect(document.getElementById(id)).not.toBeNull()
  }
  const showAdvanced = [
    ...document.querySelectorAll<HTMLButtonElement>("button"),
  ].find((button) => button.ariaLabel === "Show Advanced settings")
  await act(async () => showAdvanced?.click())
  for (const id of ["ladder-anchor", "ladder-vol-guard", "ladder-two-green"]) {
    expect(document.getElementById(id)).not.toBeNull()
  }

  await type("ladder-rung-1", "6")
  await type("ladder-pot", "30")
  await type("ladder-ramp", "3")
  await type("ladder-leverage", "2")
  await type("ladder-sl-pct", "5%")
  await type("ladder-vol-guard", "1")
  await act(async () => control("ladder-two-green").click())
  const add = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.textContent?.includes("Add rung")
  )
  await act(async () => add?.click())
  const save = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.textContent?.includes("Save changes")
  )
  await act(async () => save?.click())

  expect(reshape).toHaveBeenCalledWith(
    untouched,
    expect.objectContaining({
      greenInterval: "15m",
      settings: expect.objectContaining({
        rungs: [{ deviation: 6 }, { deviation: 8 }, { deviation: 11 }],
        maxPositionPct: 30,
        sizeMultiplier: 3,
        leverage: 2,
        maxOrderVolPct: 1,
        twoGreen: true,
        stopLoss: expect.objectContaining({ pct: 5 }),
      }),
    })
  )
})

it("keeps an untouched ladder's candle interval when the chart interval differs", async () => {
  const untouched = {
    ...ladder,
    plan: {
      ...ladder.plan,
      twoGreen: true,
      greenInterval: "1h" as const,
      rungs: ladder.plan.rungs.map((rung) => ({
        ...rung,
        status: "waiting" as const,
      })),
    },
  } as SmartLadder
  const reshape = vi.fn(async () => true)

  await act(async () => {
    root.render(
      <TooltipProvider>
        <SmartLadderSettingsWindow
          ladder={untouched}
          wallet="Test wallet"
          equity={1_000}
          market={null}
          interval="15m"
          position={null}
          busy={false}
          onSaveExits={async () => true}
          onReshape={reshape}
          onClose={() => undefined}
        />
      </TooltipProvider>
    )
  })

  const save = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.textContent?.includes("Save changes")
  )
  await act(async () => save?.click())

  expect(reshape).toHaveBeenCalledWith(
    untouched,
    expect.objectContaining({ greenInterval: "1h" })
  )
})

it("names a bad stop loss and keeps started ladders exits-only", async () => {
  const reshape = vi.fn(async () => true)
  await act(async () => {
    root.render(
      <TooltipProvider>
        <SmartLadderSettingsWindow
          ladder={ladder}
          wallet="Test wallet"
          equity={1_000}
          market={null}
          interval="1m"
          position={null}
          busy={false}
          onSaveExits={async () => true}
          onReshape={reshape}
          onClose={() => undefined}
        />
      </TooltipProvider>
    )
  })

  expect(document.getElementById("ladder-rung-1")).toBeNull()
  expect(document.body.textContent).toContain("This ladder has started")
  await type("ladder-sl-pct", "not a stop")
  const save = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (button) => button.textContent?.includes("Save changes")
  )
  await act(async () => save?.click())

  expect(document.body.textContent).toContain(
    "Stop loss has to be a number above zero"
  )
  expect(document.body.textContent).not.toContain("Every rung step has to be")
  expect(reshape).not.toHaveBeenCalled()
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
  } as Parameters<typeof SmartLadderSettingsWindow>[0]["position"]

  const render = async (open: boolean) => {
    await act(async () => {
      root.render(
        <TooltipProvider>
          <SmartLadderSettingsWindow
            ladder={open ? fixed : null}
            wallet="Test wallet"
            equity={1_000}
            market={null}
            interval="1m"
            position={position}
            busy={false}
            onSaveExits={async () => true}
            onReshape={async () => true}
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

it("edits the mirrored exit gap without changing the other exit rules", async () => {
  const exitLadder = {
    ...ladder,
    plan: {
      ...ladder.plan,
      takeProfit: { mode: "exitLadder" as const, pct: null, exitGapPct: 7 },
    },
  } as SmartLadder
  const save = vi.fn(async () => true)

  await act(async () => {
    root.render(
      <TooltipProvider>
        <SmartLadderSettingsWindow
          ladder={exitLadder}
          wallet="Test wallet"
          equity={1_000}
          market={null}
          interval="1m"
          position={null}
          busy={false}
          onSaveExits={save}
          onReshape={async () => true}
          onClose={() => undefined}
        />
      </TooltipProvider>
    )
  })

  expect((control("ladder-exit-gap") as HTMLInputElement).value).toBe("7")
  await type("ladder-exit-gap", "12")
  const saveButton = [
    ...document.querySelectorAll<HTMLButtonElement>("button"),
  ].find((button) => button.textContent?.includes("Save changes"))
  await act(async () => saveButton?.click())

  expect(save).toHaveBeenCalledWith(
    exitLadder,
    expect.objectContaining({
      takeProfit: {
        mode: "exitLadder",
        pct: 2,
        exitGapPct: 12,
      },
    })
  )
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
        <SmartLadderSettingsWindow
          ladder={ladder}
          wallet="Test wallet"
          equity={1_000}
          market={null}
          interval="1m"
          position={null}
          busy={busy}
          onSaveExits={async () => {
            setBusy(true)
            const saved = await saving
            setBusy(false)
            return saved
          }}
          onReshape={async () => true}
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
