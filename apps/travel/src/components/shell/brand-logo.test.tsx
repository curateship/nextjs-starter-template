// @vitest-environment jsdom

import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { BrandLogo } from "@/components/shell/brand-logo"

describe("BrandLogo public header sizes", () => {
  beforeEach(() => {
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
  })

  afterEach(() => {
    document.body.replaceChildren()
  })

  it.each([
    ["small", "h-8", "max-w-40"],
    ["standard", "h-12", "max-w-56"],
    ["large", "h-16", "sm:max-w-72"],
  ] as const)("renders the %s size", async (size, height, width) => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        <BrandLogo
          src="https://media.example.test/logo.png"
          darkSrc=""
          appName="Custom Shell"
          size={size}
        />
      )
    })

    const image = host.querySelector("img")
    expect(image?.className).toContain(height)
    expect(image?.className).toContain(width)

    await act(async () => root.unmount())
  })
})
