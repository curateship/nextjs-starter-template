// @vitest-environment jsdom

import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  ThemeProvider,
  useTheme,
} from "@/components/shell/sticky-header/light-dark-switcher"

function CurrentTheme() {
  const { theme } = useTheme()
  return <span>{theme}</span>
}

describe("ThemeProvider public override", () => {
  beforeEach(() => {
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    localStorage.clear()
    document.documentElement.classList.remove("light", "dark")
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    document.body.replaceChildren()
  })

  it("pins the public scheme without replacing the visitor's saved choice", async () => {
    localStorage.setItem("theme", "light")
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        <ThemeProvider forcedTheme="dark" disableTransitionOnChange={false}>
          <CurrentTheme />
        </ThemeProvider>
      )
    })

    expect(host.textContent).toBe("dark")
    expect(document.documentElement.classList.contains("dark")).toBe(true)
    expect(localStorage.getItem("theme")).toBe("light")

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "d" }))
    })
    expect(localStorage.getItem("theme")).toBe("light")

    await act(async () => {
      root.render(
        <ThemeProvider disableTransitionOnChange={false}>
          <CurrentTheme />
        </ThemeProvider>
      )
    })

    expect(host.textContent).toBe("light")
    expect(document.documentElement.classList.contains("light")).toBe(true)

    await act(async () => root.unmount())
  })
})
