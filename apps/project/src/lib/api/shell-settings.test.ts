import { describe, expect, it } from "vitest"

import { brandImagesForLockedSave } from "@/lib/api/shell-settings"

const logo = "https://media.example.test/owner/logo.png"
const darkSource =
  "https://media.example.test/owner/favicons/v1/dark-source.png"

describe("what the settings save stores for the brand pictures", () => {
  it("answers with five fields and nothing else", () => {
    // The saved row satisfies `BrandImages` structurally and carries every
    // other global with it. Spreading it here used to lay the saved app name
    // and tab-icon choice back over the ones being saved, so an edit made in
    // the same breath as an unchanged logo silently reverted.
    const saved = {
      ...inStep(),
      appName: "The saved name",
      faviconMode: "dark",
      publicFooterCopyright: "Saved copyright",
    }

    expect(Object.keys(brandImagesForLockedSave(logo, saved, {})).sort()).toEqual(
      ["favicon", "faviconDark", "faviconSet", "logo", "logoDark"]
    )
  })

  it("clears all five when the logo is removed", () => {
    expect(brandImagesForLockedSave("", inStep(), {})).toEqual({
      logo: "",
      logoDark: "",
      favicon: "",
      faviconDark: "",
      faviconSet: null,
    })
  })

  it("refuses a logo that moved while the save was running", () => {
    expect(() =>
      brandImagesForLockedSave(
        "https://media.example.test/owner/other.png",
        inStep(),
        {}
      )
    ).toThrow("The logo changed while these settings were saving")
  })
})

function inStep() {
  return {
    logo,
    logoDark: darkSource,
    favicon: logo,
    faviconDark: darkSource,
    faviconSet: {
      light: variant(logo, "light"),
      dark: variant(darkSource, "dark"),
    },
  }
}

function variant(source: string, mode: "light" | "dark") {
  const root = `https://media.example.test/owner/favicons/v1/${mode}`
  return {
    source,
    icon16: `${root}-16.png`,
    icon32: `${root}-32.png`,
    appleTouchIcon: `${root}-180.png`,
    icon512: `${root}-512.png`,
  }
}
