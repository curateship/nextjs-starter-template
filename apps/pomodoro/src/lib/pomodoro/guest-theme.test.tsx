// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ThemeProvider } from "@/components/shell/sticky-header/light-dark-switcher"
import { useGuestsStayDark } from "@/lib/pomodoro/guest-theme"

function Probe({ signedIn }: { signedIn: boolean | undefined }) {
  useGuestsStayDark(signedIn)
  return null
}

describe("useGuestsStayDark", () => {
  let root: Root

  async function show(signedIn: boolean | undefined) {
    await act(async () => {
      root.render(
        <ThemeProvider disableTransitionOnChange={false}>
          <Probe signedIn={signedIn} />
        </ThemeProvider>
      )
    })
  }

  const isDark = () => document.documentElement.classList.contains("dark")

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
    const host = document.createElement("div")
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    vi.unstubAllGlobals()
    document.body.replaceChildren()
  })

  it("draws a guest dark on a light-mode computer", async () => {
    await show(false)
    expect(isDark()).toBe(true)
  })

  it("puts a guest back to dark after the shell's d key", async () => {
    await show(false)
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "d" }))
    })
    expect(isDark()).toBe(true)
    expect(localStorage.getItem("theme")).toBe("dark")
  })

  it("gives a member their light choice back after signing out and in", async () => {
    localStorage.setItem("theme", "light")
    await show(false)
    expect(isDark()).toBe(true)

    await show(true)
    expect(isDark()).toBe(false)
    expect(localStorage.getItem("theme")).toBe("light")
  })

  it("does not keep a guest's d-key press as a member's choice", async () => {
    await show(false)
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "d" }))
    })
    await show(true)
    expect(isDark()).toBe(true)
  })

  it("starts a member with no choice dark", async () => {
    await show(true)
    expect(isDark()).toBe(true)
  })

  it("changes nothing while it is still unknown who is signed in", async () => {
    localStorage.setItem("theme", "light")
    await show(undefined)
    expect(isDark()).toBe(false)
    expect(localStorage.getItem("theme")).toBe("light")
  })
})
