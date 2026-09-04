// @vitest-environment jsdom

import * as React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import {
  DEFAULT_CHART_OPTIONS,
  type ChartOptions,
} from "@/lib/trade/chart-options"

const api = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn(async () => ({ saved: true as const })),
}))

vi.mock("@/lib/api/trade/chart-options", () => ({
  getChartOptionsErrorMessage: vi.fn(),
  loadRememberedChartOptions: api.load,
  saveRememberedChartOptions: api.save,
}))
vi.mock("@/lib/toast/error-toast", () => ({ showErrorToast: vi.fn() }))

import {
  useChartOptions,
  type ChartOptionsControl,
} from "@/components/trade/use-chart-options"

let latest: ChartOptionsControl | null = null
let host: HTMLDivElement
let root: Root

function Harness({ initial }: { initial: ChartOptions }) {
  const control = useChartOptions(initial)
  React.useEffect(() => {
    latest = control
  })
  return <div data-buffer={control.options.lineAlertBuffer ?? "none"} />
}

beforeEach(() => {
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  host = document.createElement("div")
  root = createRoot(host)
  latest = null
  api.load.mockReset()
  api.save.mockClear()
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
})

it("replaces a cached opening buffer with the account's current preference", async () => {
  api.load.mockResolvedValue({
    options: { ...DEFAULT_CHART_OPTIONS, lineAlertBuffer: 2.5 },
  })

  await act(async () => root.render(<Harness initial={DEFAULT_CHART_OPTIONS} />))

  expect(host.firstElementChild?.getAttribute("data-buffer")).toBe("2.5")
})

it("keeps a buffer changed while the account preference read is in flight", async () => {
  let answer: (value: { options: ChartOptions }) => void = () => undefined
  api.load.mockImplementation(
    () => new Promise((resolve) => (answer = resolve))
  )

  await act(async () => root.render(<Harness initial={DEFAULT_CHART_OPTIONS} />))
  act(() => latest!.setLineAlertBuffer(3.5))
  await act(async () =>
    answer({
      options: { ...DEFAULT_CHART_OPTIONS, lineAlertBuffer: 2.5 },
    })
  )

  expect(host.firstElementChild?.getAttribute("data-buffer")).toBe("3.5")
})
