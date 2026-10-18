import { describe, expect, it } from "vitest"

import {
  createDefaultShellConfig,
  shellConfigSaveRefusal,
  shellConfigSaveRefusalSentence,
} from "@/lib/custom-shell"

describe("shellConfigSaveRefusal", () => {
  const config = { ...createDefaultShellConfig(), workspaceName: "Acme" }

  it("has nothing to say about a config the server will take", () => {
    expect(shellConfigSaveRefusal(config)).toBeNull()
  })

  it("asks for a workspace name, because the server rejects an empty one", () => {
    expect(shellConfigSaveRefusal({ ...config, workspaceName: "   " })).toBe(
      "add a workspace name"
    )
  })

  it("names the colour and the tab that holds it", () => {
    expect(
      shellConfigSaveRefusal({
        ...config,
        publicTheme: { ...config.publicTheme, brandColor: "#12" },
      })
    ).toBe("fix the brand colour on Public → Styling")
  })

  it("asks for the workspace name first, since the save stops there", () => {
    expect(
      shellConfigSaveRefusal({
        ...config,
        workspaceName: "",
        publicTheme: { ...config.publicTheme, brandColor: "#12" },
      })
    ).toBe("add a workspace name")
  })

  it("turns a refusal into a sentence for a button that did nothing", () => {
    expect(shellConfigSaveRefusalSentence("add a workspace name")).toBe(
      "Add a workspace name first."
    )
  })
})
