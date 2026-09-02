import { describe, expect, it } from "vitest"

import {
  DEFAULT_PUBLIC_MAIN_SPACING,
  DEFAULT_PUBLIC_PAGE_WIDTH,
  createDefaultPublicTheme,
  hasCustomPublicTheme,
  isPublicBrandColor,
  isPublicThemeInputValid,
  normalizePublicBrandTheme,
  normalizePublicBrandOverrides,
  normalizePublicTheme,
  publicThemeForAppWideSave,
  publicThemeStyle,
} from "@/lib/public-theme"

describe("public theme", () => {
  it("adds no document style for an untouched app", () => {
    expect(publicThemeStyle(createDefaultPublicTheme())).toBeUndefined()
    expect(hasCustomPublicTheme(createDefaultPublicTheme())).toBe(false)
  })

  it("normalizes the public frame without changing its established defaults", () => {
    expect(
      normalizePublicTheme({
        pageWidth: 9999,
        canvasColor: " #AABBCC ",
        headerBorder: false,
        footerBorder: "no",
        mainSpacing: -12,
      })
    ).toMatchObject({
      pageWidth: 1600,
      canvasColor: "#aabbcc",
      headerBorder: false,
      footerBorder: true,
      mainSpacing: 0,
    })

    expect(createDefaultPublicTheme()).toMatchObject({
      pageWidth: DEFAULT_PUBLIC_PAGE_WIDTH,
      canvasColor: "",
      headerBorder: true,
      footerBorder: true,
      mainSpacing: DEFAULT_PUBLIC_MAIN_SPACING,
    })
  })

  it("treats a changed border as a public theme and blocks invalid canvas input", () => {
    expect(
      hasCustomPublicTheme({
        ...createDefaultPublicTheme(),
        headerBorder: false,
      })
    ).toBe(true)
    expect(
      isPublicThemeInputValid({
        ...createDefaultPublicTheme(),
        canvasColor: "blue",
      })
    ).toBe(false)
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
      brandOverrides: {},
      canvasColor: "",
      pageWidth: DEFAULT_PUBLIC_PAGE_WIDTH,
      mainSpacing: DEFAULT_PUBLIC_MAIN_SPACING,
      headerBorder: true,
      footerBorder: true,
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
      brandOverrides: {},
    })
    expect(
      normalizePublicBrandTheme({ brandColor: "#654321" }, "#123abc")
    ).toEqual({ brandColor: "#654321", brandOverrides: {} })
    expect(normalizePublicBrandTheme({ brandColor: "" }, "#123abc")).toEqual({
      brandColor: "",
      brandOverrides: {},
    })
  })

  it("keeps only valid automatic-colour overrides", () => {
    expect(
      normalizePublicBrandTheme({
        brandColor: "#3b82f6",
        brandOverrides: {
          hoverColor: " #112233 ",
          softColor: "blue",
          foregroundColor: "#AABBCC",
        },
      })
    ).toEqual({
      brandColor: "#3b82f6",
      brandOverrides: {
        hoverColor: "#112233",
        foregroundColor: "#aabbcc",
      },
    })
  })

  it("blocks invalid manual colours and can safely return to the app colour", () => {
    const brandOverrides = {
      hoverColor: "#112233",
      softColor: "blue",
    }

    expect(
      isPublicThemeInputValid({
        ...createDefaultPublicTheme(),
        brandColor: "#3b82f6",
        brandOverrides,
      })
    ).toBe(false)
    expect(
      isPublicThemeInputValid({
        ...createDefaultPublicTheme(),
        brandColor: "",
        brandOverrides: normalizePublicBrandOverrides(brandOverrides),
      })
    ).toBe(true)
  })

  it("keeps site colours out of a multi-site app's global settings", () => {
    const next = {
      ...createDefaultPublicTheme(),
      brandColor: "#3b82f6",
      brandOverrides: { hoverColor: "#112233" },
      canvasColor: "#f5f5f5",
      pageWidth: 960,
      mainSpacing: 24,
      headerBorder: false,
      font: "serif",
      radius: 4,
    }
    const current = {
      ...createDefaultPublicTheme(),
      brandColor: "#dc2626",
      brandOverrides: { darkColor: "#f87171" },
    }

    expect(publicThemeForAppWideSave(next, current, true)).toEqual({
      ...next,
      brandColor: current.brandColor,
      brandOverrides: current.brandOverrides,
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
      "--shell-public-primary-light": "#f8fafc",
      "--shell-public-primary-dark": "#f8fafc",
      "--shell-public-primary-foreground-light": "#18181b",
      "--shell-public-primary-foreground-dark": "#18181b",
      "--radius": "0rem",
      "--radius-sm": "calc(var(--radius) * 0.6)",
      "--radius-xl": "calc(var(--radius) * 1.4)",
      "--radius-4xl": "calc(var(--radius) * 2.6)",
      "--app-font-sans": '"Inter", ui-sans-serif, system-ui, sans-serif',
      fontFamily: "var(--app-font-sans)",
    })
    expect(style).not.toHaveProperty("--primary")
    expect(style).not.toHaveProperty("--shell-primary")
  })
})
