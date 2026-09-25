import { describe, expect, it } from "vitest"

import {
  DEFAULT_PUBLIC_BACKGROUND_PATTERN_OPACITY,
  DEFAULT_PUBLIC_GUTTER,
  DEFAULT_PUBLIC_MAIN_SPACING,
  DEFAULT_PUBLIC_PAGE_WIDTH,
  MAX_PUBLIC_BACKGROUND_PATTERN_OPACITY,
  PUBLIC_BACKGROUND_PATTERNS,
  PUBLIC_BACKGROUND_PATTERN_SIZES,
  PUBLIC_BUTTON_CASINGS,
  PUBLIC_BUTTON_STYLES,
  PUBLIC_COLOR_SCHEMES,
  PUBLIC_CONTENT_ALIGNMENTS,
  createDefaultPublicTheme,
  hasCustomPublicTheme,
  isPublicBrandColor,
  isPublicThemeInputValid,
  noFlashThemeScript,
  normalizePublicBrandTheme,
  normalizePublicBrandOverrides,
  normalizePublicTheme,
  publicThemeForAppWideSave,
  publicThemeForSite,
  publicShellStyling,
  publicThemeOverrides,
  publicThemeStyle,
} from "@/lib/public-theme"

describe("public theme", () => {
  it("adds no document style for an untouched app", () => {
    expect(publicThemeStyle(createDefaultPublicTheme())).toBeUndefined()
    expect(hasCustomPublicTheme(createDefaultPublicTheme())).toBe(false)
  })

  it("normalizes the public colour scheme and treats a pin as a custom theme", () => {
    expect(PUBLIC_COLOR_SCHEMES).toEqual(["system", "light", "dark"])
    expect(createDefaultPublicTheme().colorScheme).toBe("system")
    expect(normalizePublicTheme({ colorScheme: "dark" }).colorScheme).toBe(
      "dark"
    )
    expect(normalizePublicTheme({ colorScheme: "sepia" }).colorScheme).toBe(
      "system"
    )
    expect(
      hasCustomPublicTheme({
        ...createDefaultPublicTheme(),
        colorScheme: "light",
      })
    ).toBe(true)
  })

  it("pins a public scheme before paint or follows the saved visitor choice", () => {
    expect(noFlashThemeScript("dark")).toBe(
      "try{document.documentElement.classList.add('dark')}catch(e){}"
    )
    expect(noFlashThemeScript("system")).toContain(
      "localStorage.getItem('theme')"
    )
  })

  it("normalizes the public frame without changing its established defaults", () => {
    expect(
      normalizePublicTheme({
        pageWidth: 9999,
        canvasColor: " #AABBCC ",
        headerBorder: false,
        footerBorder: "no",
        mainSpacing: -12,
        contentAlignment: "right",
      })
    ).toMatchObject({
      pageWidth: 1600,
      canvasColor: { mode: "custom", strength: 60, color: "#aabbcc" },
      headerBorder: false,
      footerBorder: true,
      mainSpacing: 0,
      contentAlignment: "right",
    })

    expect(createDefaultPublicTheme()).toMatchObject({
      pageWidth: DEFAULT_PUBLIC_PAGE_WIDTH,
      canvasColor: { mode: "default", strength: 60, color: "#ffffff" },
      headerBorder: true,
      footerBorder: true,
      mainSpacing: DEFAULT_PUBLIC_MAIN_SPACING,
      contentAlignment: "center",
      backgroundPattern: "none",
      backgroundPatternSize: "medium",
      backgroundPatternOpacity: DEFAULT_PUBLIC_BACKGROUND_PATTERN_OPACITY,
      buttonStyle: "solid",
      buttonCasing: "as-written",
    })
  })

  it("normalizes public patterns and button choices conservatively", () => {
    expect(PUBLIC_BACKGROUND_PATTERNS).toEqual(["none", "dots", "grid"])
    expect(PUBLIC_BACKGROUND_PATTERN_SIZES).toEqual([
      "small",
      "medium",
      "large",
    ])
    expect(PUBLIC_BUTTON_STYLES).toEqual(["solid", "outline"])
    expect(PUBLIC_BUTTON_CASINGS).toEqual(["as-written", "uppercase"])

    expect(
      normalizePublicTheme({
        backgroundPattern: "grid",
        backgroundPatternSize: "large",
        backgroundPatternOpacity: 999,
        buttonStyle: "outline",
        buttonCasing: "uppercase",
      })
    ).toMatchObject({
      backgroundPattern: "grid",
      backgroundPatternSize: "large",
      backgroundPatternOpacity: MAX_PUBLIC_BACKGROUND_PATTERN_OPACITY,
      buttonStyle: "outline",
      buttonCasing: "uppercase",
    })

    expect(
      normalizePublicTheme({
        backgroundPattern: "waves",
        backgroundPatternSize: "huge",
        backgroundPatternOpacity: -1,
        buttonStyle: "ghost",
        buttonCasing: "title-case",
      })
    ).toMatchObject({
      backgroundPattern: "none",
      backgroundPatternSize: "medium",
      backgroundPatternOpacity: 0,
      buttonStyle: "solid",
      buttonCasing: "as-written",
    })
  })

  it("centres public content by default and normalizes saved alignment", () => {
    expect(PUBLIC_CONTENT_ALIGNMENTS).toEqual(["left", "center", "right"])
    expect(createDefaultPublicTheme().contentAlignment).toBe("center")
    expect(
      normalizePublicTheme({ contentAlignment: "left" }).contentAlignment
    ).toBe("left")
    expect(
      normalizePublicTheme({ contentAlignment: "middle" }).contentAlignment
    ).toBe("center")
    expect(
      hasCustomPublicTheme({
        ...createDefaultPublicTheme(),
        contentAlignment: "right",
      })
    ).toBe(true)
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
        canvasColor: { mode: "custom", strength: 60, color: "blue" },
      })
    ).toBe(false)
  })

  it("reads a canvas colour saved before the mode picker existed", () => {
    expect(normalizePublicTheme({ canvasColor: "#F1F5F9" }).canvasColor).toEqual(
      { mode: "custom", strength: 60, color: "#f1f5f9" }
    )
    expect(normalizePublicTheme({ canvasColor: "" }).canvasColor).toEqual({
      mode: "default",
      strength: 60,
      color: "#ffffff",
    })
    expect(
      normalizePublicTheme({ canvasColor: "not a colour" }).canvasColor.mode
    ).toBe("default")
  })

  it("keeps a public colour to the one hex shape the save schema allows", () => {
    const theme = normalizePublicTheme({
      chrome: { mode: "custom", strength: 50, color: "red; background:url(x)" },
      dividerColor: { mode: "custom", strength: 50, color: "#AABBCC" },
    })

    expect(theme.chrome.color).toBe(
      createDefaultPublicTheme().chrome.color
    )
    expect(theme.dividerColor.color).toBe("#aabbcc")
  })

  it("keeps the public spacing and border defaults a site already draws", () => {
    const theme = createDefaultPublicTheme()

    expect(theme.gutter).toBe(DEFAULT_PUBLIC_GUTTER)
    expect(theme.cardBorderWidth).toBe(1)
    expect(theme.cardBorderColor.mode).toBe("default")
    expect(theme.dividerColor.mode).toBe("default")
    expect(theme.chrome.mode).toBe("default")
    expect(theme.modal.padding).toBe(24)
    expect(theme.modal.overlayOpacity).toBe(10)
    expect(hasCustomPublicTheme(theme)).toBe(false)
    expect(publicThemeOverrides(theme, createDefaultPublicTheme())).toEqual({})
  })

  it("saves a changed spacing, border or modal value and nothing else", () => {
    const theme = createDefaultPublicTheme()

    expect(
      publicThemeOverrides({ ...theme, gutter: 0 }, createDefaultPublicTheme())
    ).toEqual({ gutter: 0 })
    expect(hasCustomPublicTheme({ ...theme, gutter: 0 })).toBe(true)

    const recoloured = {
      ...theme,
      dividerColor: { mode: "custom" as const, strength: 10, color: "#445566" },
    }
    expect(
      publicThemeOverrides(recoloured, createDefaultPublicTheme())
    ).toEqual({
      dividerColor: { mode: "custom", strength: 10, color: "#445566" },
    })
    expect(hasCustomPublicTheme(recoloured)).toBe(true)

    const dimmer = {
      ...theme,
      modal: { ...theme.modal, overlayOpacity: 40 },
    }
    expect(publicThemeOverrides(dimmer, createDefaultPublicTheme())).toEqual({
      modal: dimmer.modal,
    })
    expect(hasCustomPublicTheme(dimmer)).toBe(true)
  })

  it("ignores a strength parked behind a colour on theme default", () => {
    const theme = createDefaultPublicTheme()
    const parked = {
      ...theme,
      chrome: { ...theme.chrome, strength: 3, color: "#010203" },
    }

    expect(publicThemeOverrides(parked, createDefaultPublicTheme())).toEqual({})
    expect(hasCustomPublicTheme(parked)).toBe(false)
  })

  it("blocks a half-typed colour anywhere on the public tab", () => {
    const theme = createDefaultPublicTheme()

    expect(
      isPublicThemeInputValid({
        ...theme,
        chrome: { mode: "custom", strength: 27, color: "#ab" },
      })
    ).toBe(false)
    expect(
      isPublicThemeInputValid({
        ...theme,
        modal: {
          ...theme.modal,
          cardBorderColor: { mode: "custom", strength: 6, color: "#abc" },
        },
      })
    ).toBe(false)
    expect(
      isPublicThemeInputValid({
        ...theme,
        chrome: { mode: "custom", strength: 27, color: "#abcdef" },
      })
    ).toBe(true)
  })

  it("reads the public theme as the styling shape the frame applies", () => {
    const theme = {
      ...createDefaultPublicTheme(),
      gutter: 20,
      canvasColor: { mode: "custom" as const, strength: 60, color: "#f1f5f9" },
    }

    expect(publicShellStyling(theme)).toEqual({
      gutter: 20,
      cardBorderWidth: theme.cardBorderWidth,
      cardBorderColor: theme.cardBorderColor,
      dividerColor: theme.dividerColor,
      content: theme.canvasColor,
      chrome: theme.chrome,
      modal: theme.modal,
    })
  })

  it("normalizes font and corner values", () => {
    expect(
      normalizePublicTheme({
        brandColor: { light: "#3366aa", dark: "#112233" },
        font: "remote-font",
        radius: 99,
      })
    ).toEqual({
      ...createDefaultPublicTheme(),
      brandColor: "",
      brandOverrides: {},
      pageWidth: DEFAULT_PUBLIC_PAGE_WIDTH,
      mainSpacing: DEFAULT_PUBLIC_MAIN_SPACING,
      backgroundPattern: "none",
      backgroundPatternSize: "medium",
      backgroundPatternOpacity: DEFAULT_PUBLIC_BACKGROUND_PATTERN_OPACITY,
      buttonStyle: "solid",
      buttonCasing: "as-written",
      headerBorder: true,
      footerBorder: true,
      colorScheme: "system",
      contentAlignment: "center",
      useCustomFont: false,
      font: "system",
      radius: 24,
    })
  })

  it("fills only missing saved values from the app's public theme", () => {
    const appTheme = {
      ...createDefaultPublicTheme(),
      brandColor: "#123456",
      brandOverrides: { darkColor: "#abcdef" },
      canvasColor: { mode: "custom" as const, strength: 60, color: "#f5f5f5" },
      colorScheme: "dark" as const,
      font: "serif" as const,
      radius: 4,
    }

    expect(
      normalizePublicTheme(
        {
          brandOverrides: { hoverColor: "#654321" },
          font: "mono",
        },
        appTheme
      )
    ).toEqual({
      ...appTheme,
      brandOverrides: {
        darkColor: "#abcdef",
        hoverColor: "#654321",
      },
      font: "mono",
    })
  })

  it("puts a site's saved brand values over the app's public theme", () => {
    const appTheme = {
      ...createDefaultPublicTheme(),
      brandColor: "#123456",
      brandOverrides: { darkColor: "#abcdef" },
    }

    expect(
      publicThemeForSite(appTheme, {
        brandColor: "#654321",
        brandOverrides: { hoverColor: "#112233" },
      })
    ).toEqual({
      ...appTheme,
      brandColor: "#654321",
      brandOverrides: { hoverColor: "#112233" },
    })
    expect(publicThemeForSite(appTheme, undefined)).toEqual(appTheme)
  })

  it("stores only public values that differ from their inherited values", () => {
    const appTheme = {
      ...createDefaultPublicTheme(),
      brandColor: "#123456",
      brandOverrides: { darkColor: "#abcdef" },
      font: "serif" as const,
    }
    const selectedTheme = {
      ...appTheme,
      brandOverrides: {},
      font: "mono" as const,
    }

    const saved = publicThemeOverrides(selectedTheme, appTheme)

    expect(saved).toEqual({
      brandOverrides: { darkColor: "" },
      font: "mono",
    })
    expect(normalizePublicTheme(saved, appTheme)).toEqual(selectedTheme)
    expect(publicThemeOverrides(appTheme, appTheme)).toEqual({})
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
      canvasColor: { mode: "custom", strength: 60, color: "#f5f5f5" },
      pageWidth: 960,
      mainSpacing: 24,
      contentAlignment: "right",
      headerBorder: false,
      colorScheme: "dark",
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

  it("writes a visible background pattern and treats zero opacity as none", () => {
    const patterned = {
      ...createDefaultPublicTheme(),
      backgroundPattern: "dots" as const,
      backgroundPatternSize: "large" as const,
      backgroundPatternOpacity: 12,
    }

    expect(publicThemeStyle(patterned)).toMatchObject({
      "--shell-public-pattern-color":
        "color-mix(in oklab, var(--foreground) 12%, transparent)",
      "--shell-public-pattern-size": "24px",
    })
    expect(hasCustomPublicTheme(patterned)).toBe(true)
    expect(
      publicThemeStyle({ ...patterned, backgroundPatternOpacity: 0 })
    ).toBeUndefined()
    expect(
      hasCustomPublicTheme({ ...patterned, backgroundPatternOpacity: 0 })
    ).toBe(false)
  })

  it("stores public button and pattern changes over an app default", () => {
    const baseline = createDefaultPublicTheme()
    const selected = {
      ...baseline,
      backgroundPattern: "grid" as const,
      backgroundPatternSize: "small" as const,
      backgroundPatternOpacity: 4,
      buttonStyle: "outline" as const,
      buttonCasing: "uppercase" as const,
    }

    expect(publicThemeOverrides(selected, baseline)).toEqual({
      backgroundPattern: "grid",
      backgroundPatternSize: "small",
      backgroundPatternOpacity: 4,
      buttonStyle: "outline",
      buttonCasing: "uppercase",
    })
    expect(hasCustomPublicTheme(selected)).toBe(true)
  })
})
