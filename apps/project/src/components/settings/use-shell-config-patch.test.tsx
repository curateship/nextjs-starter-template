// @vitest-environment jsdom

import { act } from "react"
import { createRoot } from "react-dom/client"
import { describe, expect, it, vi } from "vitest"

import { createDefaultShellConfig, type ShellConfig } from "@/lib/custom-shell"

const runtime: { config: ShellConfig; onConfigChange: (config: ShellConfig) => void } = {
  config: createDefaultShellConfig(),
  onConfigChange: vi.fn(),
}
vi.mock("@/components/shell/shell-layout", () => ({
  useShellRuntime: () => ({ ...runtime, onSaveConfig: vi.fn(async () => true) }),
}))

import { useShellConfigPatch } from "@/components/settings/use-shell-config-patch"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

/**
 * Every write builds a whole new settings record by spreading one. A handler
 * kept from an earlier render used to rebuild the settings as they were then,
 * quietly undoing anything changed since: the reason a public menu edit once
 * took the footer back with it. `patch` always spreads the newest.
 */
describe("useShellConfigPatch", () => {
  it("writes on top of the newest settings, not the ones it was drawn with", () => {
    const onConfigChange = vi.fn()
    runtime.onConfigChange = onConfigChange
    let kept: ReturnType<typeof useShellConfigPatch>["patch"] | undefined
    function Probe() {
      const { patch } = useShellConfigPatch()
      kept ??= patch
      return null
    }
    const first = { ...createDefaultShellConfig(), appName: "Before" }
    const second = { ...first, appName: "After" }
    const host = document.createElement("div")
    const root = createRoot(host)
    runtime.config = first
    act(() => root.render(<Probe />))
    runtime.config = second
    act(() => root.render(<Probe />))

    act(() => kept?.({ publicFooterCopyright: "© Us" }))
    expect(onConfigChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ appName: "After", publicFooterCopyright: "© Us" })
    )

    // Two writes in one go build on each other.
    act(() => {
      kept?.({ publicFooterCopyright: "One" })
      kept?.((current) => ({ appName: `${current.publicFooterCopyright} later` }))
    })
    expect(onConfigChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ appName: "One later", publicFooterCopyright: "One" })
    )
    act(() => root.unmount())
  })
})
