// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const api = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn(),
  move: vi.fn(),
  remove: vi.fn(),
}))
const errors = vi.hoisted(() => ({ show: vi.fn() }))

vi.mock("@/lib/api/trade/price-alerts", () => ({
  getPriceAlertErrorMessage: () => "The alert could not be saved.",
  getPriceAlertLoadErrorMessage: () => "The alerts could not be loaded.",
  loadPriceAlerts: api.load,
  movePriceAlert: api.move,
  removePriceAlert: api.remove,
  savePriceAlert: api.save,
}))
vi.mock("@/lib/toast/error-toast", () => ({ showErrorToast: errors.show }))

import { usePriceAlerts } from "@/components/trade/use-price-alerts"

const ID = "00000000-0000-4000-8000-000000000001"
const SAVED_ALERT = {
  id: ID,
  protocol: "hyperliquid" as const,
  network: "mainnet" as const,
  marketKey: "hyperliquid:mainnet:BTC",
  price: 110,
  direction: "above" as const,
  createdAt: 1,
}

function Harness({ initial = [] }: { initial?: (typeof SAVED_ALERT)[] }) {
  const alerts = usePriceAlerts({ rows: initial, error: null })
  return (
    <div>
      <button
        type="button"
        onClick={() =>
          alerts.create({
            marketKey: "hyperliquid:mainnet:BTC",
            price: 110,
            currentPrice: 100,
          })
        }
      >
        Create
      </button>
      {alerts.alerts.map((alert) => (
        <div key={alert.id}>
          <span>
            {alert.direction} {alert.price}
          </span>
          <button
            type="button"
            data-move-alert={alert.id}
            onClick={() =>
              alerts.move({ id: alert.id, price: 90, currentPrice: 100 })
            }
          >
            Move
          </button>
          <button
            type="button"
            data-remove-alert={alert.id}
            onClick={() => alerts.remove(alert.id)}
          >
            Delete
          </button>
        </div>
      ))}
    </div>
  )
}

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  vi.useFakeTimers()
  vi.clearAllMocks()
  vi.spyOn(globalThis.crypto, "randomUUID").mockReturnValue(ID)
  api.load.mockResolvedValue({ alerts: [] })
  api.move.mockImplementation(async (input) => ({
    ...SAVED_ALERT,
    price: input.price,
    direction: input.price >= input.currentPrice ? "above" : "below",
  }))
  api.remove.mockResolvedValue({ deleted: true })
  host = document.createElement("div")
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe("the shared price-alert list", () => {
  it("does not poll while the saved alert list is empty", async () => {
    await act(async () => root.render(<Harness />))

    await act(async () => vi.advanceTimersByTime(6_000))

    expect(api.load).not.toHaveBeenCalled()
  })

  it("draws a new row before its server save finishes", async () => {
    let finish: ((value: unknown) => void) | undefined
    api.save.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    await act(async () => root.render(<Harness />))

    await act(async () =>
      host.querySelector<HTMLButtonElement>("button")!.click()
    )
    expect(host.textContent).toContain("above 110")
    expect(api.save).toHaveBeenCalledWith({
      id: ID,
      marketKey: "hyperliquid:mainnet:BTC",
      price: 110,
      currentPrice: 100,
    })

    await act(async () => finish?.(SAVED_ALERT))
    expect(host.textContent).toContain("above 110")
  })

  it("takes the optimistic row back when the save is refused", async () => {
    api.save.mockRejectedValue(new Error("no"))
    await act(async () => root.render(<Harness />))

    await act(async () =>
      host.querySelector<HTMLButtonElement>("button")!.click()
    )

    expect(host.textContent).not.toContain("above 110")
    expect(errors.show).toHaveBeenCalledWith("The alert could not be saved.")
  })

  it("does not let an older refresh wipe a new saved alert", async () => {
    let finishLoad: ((value: { alerts: [] }) => void) | undefined
    let finishSave: ((value: unknown) => void) | undefined
    api.load.mockReturnValue(new Promise((resolve) => (finishLoad = resolve)))
    api.save.mockReturnValue(new Promise((resolve) => (finishSave = resolve)))
    await act(async () => root.render(<Harness />))

    await act(async () =>
      host.querySelector<HTMLButtonElement>("button")!.click()
    )
    await act(async () => vi.advanceTimersByTime(2_000))
    await act(async () => finishSave?.(SAVED_ALERT))
    await act(async () => finishLoad?.({ alerts: [] }))

    expect(host.textContent).toContain("above 110")
  })

  it("moves a saved alert immediately and keeps the server answer", async () => {
    let finish: ((value: unknown) => void) | undefined
    api.move.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    await act(async () => root.render(<Harness initial={[SAVED_ALERT]} />))

    await act(async () =>
      host.querySelector<HTMLButtonElement>("[data-move-alert]")!.click()
    )
    expect(host.textContent).toContain("below 90")
    expect(api.move).toHaveBeenCalledWith({
      id: ID,
      price: 90,
      currentPrice: 100,
    })

    await act(async () =>
      finish?.({ ...SAVED_ALERT, price: 90, direction: "below" })
    )
    expect(host.textContent).toContain("below 90")
  })

  it("puts an alert back when moving it is refused", async () => {
    api.move.mockRejectedValue(new Error("no"))
    await act(async () => root.render(<Harness initial={[SAVED_ALERT]} />))

    await act(async () =>
      host.querySelector<HTMLButtonElement>("[data-move-alert]")!.click()
    )

    expect(host.textContent).toContain("above 110")
    expect(errors.show).toHaveBeenCalledWith("The alert could not be saved.")
  })

  it("waits for a new alert to exist before saving its dragged price", async () => {
    let finishSave: ((value: unknown) => void) | undefined
    api.save.mockReturnValue(
      new Promise((resolve) => {
        finishSave = resolve
      })
    )
    await act(async () => root.render(<Harness />))

    await act(async () =>
      host.querySelector<HTMLButtonElement>("button")!.click()
    )
    await act(async () =>
      host.querySelector<HTMLButtonElement>("[data-move-alert]")!.click()
    )
    expect(host.textContent).toContain("below 90")
    expect(api.move).not.toHaveBeenCalled()

    await act(async () => finishSave?.(SAVED_ALERT))
    expect(api.move).toHaveBeenCalledWith({
      id: ID,
      price: 90,
      currentPrice: 100,
    })
    expect(host.textContent).toContain("below 90")
  })
})
