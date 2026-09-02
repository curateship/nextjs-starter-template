import { describe, expect, it } from "vitest"

import {
  createDefaultPublicTheme,
  isPublicBrandColor,
  normalizePublicBrandTheme,
  normalizePublicTheme,
  publicThemeForAppWideSave,
  publicThemeStyle,
} from "@/lib/public-theme"

describe("public theme", () => {
  it("adds no document style for an untouched app", () => {
    expect(publicThemeStyle(createDefaultPublicTheme())).toBeUndefined()
  })

  it("normalizes font and corner values", () => {
    expect(
      normalizePublicTheme({
        brandColor: { light: "#3366aa", dark: "#112233" },
        font: "remote-font",
        radius: 99,
      })
    ).toEqual({
      brandColor: "",
      font: "system",
      radius: 24,
    })
  })

  it("normalizes a six-digit brand colour", () => {
    expect(isPublicBrandColor("#3B82F6")).toBe(true)
    expect(isPublicBrandColor("")).toBe(true)
    expect(isPublicBrandColor("#abc")).toBe(false)
    expect(
      normalizePublicTheme({
        brandColor: " #3B82F6 ",
        font: "system",
        radius: 10,
      }).brandColor
    ).toBe("#3b82f6")
    expect(
      normalizePublicTheme({
        brandColor: "#abc",
        font: "system",
        radius: 10,
      }).brandColor
    ).toBe("")
  })

  it("carries an old CMS accent only when no newer brand value exists", () => {
    expect(normalizePublicBrandTheme(undefined, " #123ABC ")).toEqual({
      brandColor: "#123abc",
    })
    expect(
      normalizePublicBrandTheme({ brandColor: "#654321" }, "#123abc")
    ).toEqual({ brandColor: "#654321" })
    expect(normalizePublicBrandTheme({ brandColor: "" }, "#123abc")).toEqual({
      brandColor: "",
    })
  })

  it("keeps site colours out of a multi-site app's global settings", () => {
    const next = { brandColor: "#3b82f6", font: "serif", radius: 4 }
    const current = { brandColor: "#dc2626", font: "system", radius: 10 }

    expect(publicThemeForAppWideSave(next, current, true)).toEqual({
      brandColor: "#dc2626",
      font: "serif",
      radius: 4,
    })
    expect(publicThemeForAppWideSave(next, current, false)).toEqual(next)
  })

  it("writes the chosen font and all derived corner values", () => {
    const style = publicThemeStyle({
      ...createDefaultPublicTheme(),
      brandColor: "#f8fafc",
      font: "inter",
      radius: 0,
    }) as Record<string, string>

    expect(style).toMatchObject({
      "--shell-primary": "#f8fafc",
      "--shell-primary-foreground": "#18181b",
      "--shell-ring": "#f8fafc",
      "--radius": "0rem",
      "--radius-sm": "calc(var(--radius) * 0.6)",
      "--radius-xl": "calc(var(--radius) * 1.4)",
      "--radius-4xl": "calc(var(--radius) * 2.6)",
      "--app-font-sans": '"Inter", ui-sans-serif, system-ui, sans-serif',
      fontFamily: "var(--app-font-sans)",
    })
    expect(style).not.toHaveProperty("--primary")
  })
})
