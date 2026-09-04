// @vitest-environment jsdom

import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { PublicSeoSettings } from "@/components/settings/public-metadata-settings"
import { TooltipProvider } from "@/components/ui/tooltip"
import { createDefaultShellConfig } from "@/lib/custom-shell"

describe("PublicSeoSettings", () => {
  beforeEach(() => {
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    window.localStorage.clear()
  })

  afterEach(() => {
    document.body.replaceChildren()
  })

  it("edits the home and site defaults without changing the other SEO fields", async () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)
    const config = createDefaultShellConfig()
    const onConfigChange = vi.fn()

    await act(async () => {
      root.render(
        <TooltipProvider>
          <PublicSeoSettings
            config={config}
            onConfigChange={onConfigChange}
          />
        </TooltipProvider>
      )
    })

    const title = document.querySelector<HTMLInputElement>(
      "#public-seo-home-title"
    )
    const description = document.querySelector<HTMLTextAreaElement>(
      "#public-seo-site-description"
    )
    expect(title).not.toBeNull()
    expect(description).not.toBeNull()
    expect(document.body.textContent).toContain("Default share image")

    await act(async () => {
      if (!title) return
      const setValue = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value"
      )?.set
      setValue?.call(title, "Acme home")
      title.dispatchEvent(new Event("input", { bubbles: true }))
    })

    expect(onConfigChange).toHaveBeenCalledWith({
      ...config,
      publicSeo: { ...config.publicSeo, homeTitle: "Acme home" },
    })

    await act(async () => root.unmount())
  })
})
