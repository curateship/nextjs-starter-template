import { scaffoldStyling } from "@/lib/layout/scaffold-styling"

/**
 * The saved styling values, with no React and no shell config around them.
 *
 * Two screens save this shape. Settings → Styling saves it for the signed-in
 * app, where ShellLayout and DashboardContent apply it; Settings → Public site
 * → Styling saves it for the signed-out pages, where PublicPageFrame applies
 * it. Both reach the same rules in theme.css through the same CSS variables.
 *
 * It lives here rather than in `custom-shell.tsx` because `public-theme.ts`
 * needs it and `custom-shell.tsx` already imports `public-theme.ts`.
 */

export type ShellBackgroundMode = "default" | "muted" | "custom"

export type ShellBackground = {
  /** default = keep the theme's own token; muted = theme muted at a strength; custom = a fixed color. */
  mode: ShellBackgroundMode
  /** 0–100, applied when mode === "muted". */
  strength: number
  /** CSS color, applied when mode === "custom". */
  color: string
}

export type ShellStyling = {
  /** Outer padding + gap between cards, in px (0–48). 0 = flat mode. */
  gutter: number
  /** Card border width in px (0 = off). */
  cardBorderWidth: number
  /** Card + table border color. */
  cardBorderColor: ShellBackground
  /** Divider lines: the rules inside cards and tables, and the sidebar edge. */
  dividerColor: ShellBackground
  /** Main content area background. */
  content: ShellBackground
  /** Sidebar + sticky header background. */
  chrome: ShellBackground
  /** Dialog / modal styling. */
  modal: ShellModalStyling
}

export type ShellModalStyling = {
  /** Modal surface background. */
  background: ShellBackground
  /** Modal border width in px (0 = off). */
  borderWidth: number
  /** Modal border color. */
  borderColor: ShellBackground
  /** Inner padding in px. */
  padding: number
  /** Backdrop dimming behind the modal, 0–100. */
  overlayOpacity: number
  /** Background of cards inside the modal. */
  cardBackground: ShellBackground
  /** Border width of cards inside the modal, in px (0 = off). */
  cardBorderWidth: number
  /** Border color of cards inside the modal. */
  cardBorderColor: ShellBackground
}

export const MIN_CONTENT_GUTTER = 0
export const MAX_CONTENT_GUTTER = 48
export const DEFAULT_CONTENT_GUTTER = 14
export const MAX_CARD_BORDER_WIDTH = 3
export const DEFAULT_CARD_BORDER_WIDTH = 1
export const MAX_MODAL_PADDING = 48
export const DEFAULT_MODAL_PADDING = 20
export const DEFAULT_MODAL_OVERLAY_OPACITY = 8
// Fallback strength used when a stored value is missing/invalid.
export const DEFAULT_CONTENT_BACKGROUND_STRENGTH = 60
export const SHELL_BACKGROUND_MODES: readonly ShellBackgroundMode[] = [
  "default",
  "muted",
  "custom",
] as const

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.round(value)))
}

export function clampGutter(value: unknown): number {
  return clampInt(value, MIN_CONTENT_GUTTER, MAX_CONTENT_GUTTER, DEFAULT_CONTENT_GUTTER)
}

export function clampCardBorderWidth(value: unknown): number {
  return clampInt(value, 0, MAX_CARD_BORDER_WIDTH, DEFAULT_CARD_BORDER_WIDTH)
}

export function clampStrength(value: unknown): number {
  return clampInt(value, 0, 100, DEFAULT_CONTENT_BACKGROUND_STRENGTH)
}

export function clampModalPadding(value: unknown): number {
  return clampInt(value, 0, MAX_MODAL_PADDING, DEFAULT_MODAL_PADDING)
}

export function clampOverlayOpacity(value: unknown): number {
  return clampInt(value, 0, 100, DEFAULT_MODAL_OVERLAY_OPACITY)
}

// The out-of-the-box look for a new workspace/app and every reset. These are the
// tuned values captured from Tyler's own workspace, kept verbatim (some settings
// are deliberately left on "default"/Automatic) so a reset lands on the look he
// actually wants rather than the raw theme colors.
export function createDefaultModalStyling(): ShellModalStyling {
  return {
    background: { mode: "muted", strength: 44, color: "#ffffff" },
    borderWidth: 1,
    borderColor: { mode: "default", strength: 28, color: "#d4d4d8" },
    padding: 20,
    overlayOpacity: 8,
    cardBackground: { mode: "muted", strength: 0, color: "#ffffff" },
    cardBorderWidth: 1,
    cardBorderColor: { mode: "muted", strength: 6, color: "#d4d4d8" },
  }
}

export function createDefaultStyling(): ShellStyling {
  if (scaffoldStyling) {
    return {
      ...scaffoldStyling,
      cardBorderColor: { ...scaffoldStyling.cardBorderColor },
      dividerColor: { ...scaffoldStyling.dividerColor },
      content: { ...scaffoldStyling.content },
      chrome: { ...scaffoldStyling.chrome },
      modal: {
        ...scaffoldStyling.modal,
        background: { ...scaffoldStyling.modal.background },
        borderColor: { ...scaffoldStyling.modal.borderColor },
        cardBackground: { ...scaffoldStyling.modal.cardBackground },
        cardBorderColor: { ...scaffoldStyling.modal.cardBorderColor },
      },
    }
  }

  return {
    gutter: 14,
    cardBorderWidth: 1,
    cardBorderColor: { mode: "muted", strength: 7, color: "#d4d4d8" },
    // Starting value only — Tyler tunes this live, then it gets captured here.
    dividerColor: { mode: "muted", strength: 10, color: "#d4d4d8" },
    content: { mode: "muted", strength: 95, color: "#f4f4f5" },
    chrome: { mode: "muted", strength: 27, color: "#ffffff" },
    modal: createDefaultModalStyling(),
  }
}

function normalizeBackground(
  value: unknown,
  fallback: ShellBackground
): ShellBackground {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...fallback }
  }
  const bg = value as Partial<ShellBackground>
  return {
    mode: SHELL_BACKGROUND_MODES.includes(bg.mode as ShellBackgroundMode)
      ? (bg.mode as ShellBackgroundMode)
      : fallback.mode,
    strength: clampStrength(bg.strength ?? fallback.strength),
    color: typeof bg.color === "string" && bg.color.trim() ? bg.color : fallback.color,
  }
}

export function normalizeStyling(value: unknown): ShellStyling {
  const fallback = createDefaultStyling()
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fallback
  }
  const styling = value as Partial<ShellStyling>
  return {
    gutter: clampGutter(styling.gutter ?? fallback.gutter),
    cardBorderWidth: clampCardBorderWidth(
      styling.cardBorderWidth ?? fallback.cardBorderWidth
    ),
    cardBorderColor: normalizeBackground(
      styling.cardBorderColor,
      fallback.cardBorderColor
    ),
    dividerColor: normalizeBackground(
      styling.dividerColor,
      fallback.dividerColor
    ),
    content: normalizeBackground(styling.content, fallback.content),
    chrome: normalizeBackground(styling.chrome, fallback.chrome),
    modal: normalizeModalStyling(styling.modal),
  }
}

export function normalizeModalStyling(value: unknown): ShellModalStyling {
  const fallback = createDefaultModalStyling()
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fallback
  }
  const modal = value as Partial<ShellModalStyling>
  return {
    background: normalizeBackground(modal.background, fallback.background),
    borderWidth: clampCardBorderWidth(modal.borderWidth ?? fallback.borderWidth),
    borderColor: normalizeBackground(modal.borderColor, fallback.borderColor),
    padding: clampModalPadding(modal.padding ?? fallback.padding),
    overlayOpacity: clampOverlayOpacity(
      modal.overlayOpacity ?? fallback.overlayOpacity
    ),
    cardBackground: normalizeBackground(
      modal.cardBackground,
      fallback.cardBackground
    ),
    cardBorderWidth: clampCardBorderWidth(
      modal.cardBorderWidth ?? fallback.cardBorderWidth
    ),
    cardBorderColor: normalizeBackground(
      modal.cardBorderColor,
      fallback.cardBorderColor
    ),
  }
}

type ResolveBackgroundOptions = {
  /** CSS custom property to blend for the "muted" mode (default --muted). */
  base?: string
  /**
   * When true, "muted" blends toward the opaque background instead of
   * transparent — used for chrome so the sidebar and header render the same
   * solid color regardless of what sits behind them.
   */
  opaque?: boolean
}

/**
 * Resolve a background/color to a CSS color string, or undefined when the
 * theme's own token should be left in place (mode === "default").
 */
export function resolveBackground(
  bg: ShellBackground,
  options: ResolveBackgroundOptions = {}
): string | undefined {
  const { base = "--muted", opaque = false } = options
  if (bg.mode === "custom") return bg.color
  if (bg.mode === "muted") {
    const mixWith = opaque ? "var(--background)" : "transparent"
    return `color-mix(in oklab, var(${base}) ${clampStrength(bg.strength)}%, ${mixWith})`
  }
  return undefined
}

/**
 * CSS custom properties for modal styling. Applied to the document root (via an
 * effect in ShellLayout) so they reach the dialog, which portals to document.body
 * outside the shell subtree. Consumed by the modal rules in theme.css. Values in
 * "default" mode are omitted so the theme's own tokens show through.
 */
export function getModalStyleVars(modal: ShellModalStyling): Record<string, string> {
  const vars: Record<string, string> = {
    "--shell-modal-overlay-opacity": `${clampOverlayOpacity(modal.overlayOpacity)}%`,
    "--shell-modal-padding": `${clampModalPadding(modal.padding)}px`,
    "--shell-modal-border-width": String(clampCardBorderWidth(modal.borderWidth)),
    "--shell-modal-card-border-width": String(
      clampCardBorderWidth(modal.cardBorderWidth)
    ),
  }
  const background = resolveBackground(modal.background, {
    base: "--muted",
    opaque: true,
  })
  if (background) vars["--shell-modal-bg"] = background
  const borderColor = resolveBackground(modal.borderColor, {
    base: "--muted-foreground",
  })
  if (borderColor) vars["--shell-modal-border-color"] = borderColor
  const cardBackground = resolveBackground(modal.cardBackground, {
    base: "--muted",
    opaque: true,
  })
  if (cardBackground) vars["--shell-modal-card-bg"] = cardBackground
  const cardBorderColor = resolveBackground(modal.cardBorderColor, {
    base: "--muted-foreground",
  })
  if (cardBorderColor) vars["--shell-modal-card-border-color"] = cardBorderColor
  return vars
}

/** The full set of modal CSS variable names, used to clear stale values. */
export const MODAL_STYLE_VAR_NAMES = [
  "--shell-modal-overlay-opacity",
  "--shell-modal-padding",
  "--shell-modal-border-width",
  "--shell-modal-border-color",
  "--shell-modal-bg",
  "--shell-modal-card-border-width",
  "--shell-modal-card-border-color",
  "--shell-modal-card-bg",
] as const

/**
 * Border CSS custom properties from the Styling settings, applied to the
 * document root (via an effect in ShellLayout) so they reach content that
 * portals to document.body — popovers, dropdown menus, selects, sheets, and
 * toasts. Inside the shell subtree the same values are already set closer to
 * the content (ShellLayout's wrapper and DashboardContent), so this only
 * changes what the portaled layers see. Values in "default" mode are omitted
 * so the theme's own tokens show through.
 */
export function getBorderStyleVars(styling: ShellStyling): Record<string, string> {
  const vars: Record<string, string> = {
    "--shell-card-border-width": String(
      clampCardBorderWidth(styling.cardBorderWidth)
    ),
  }
  const dividerColor = resolveBackground(styling.dividerColor, {
    base: "--muted-foreground",
  })
  if (dividerColor) {
    vars["--border"] = dividerColor
    vars["--sidebar-border"] = dividerColor
  }
  const cardBorderColor = resolveBackground(styling.cardBorderColor, {
    base: "--muted-foreground",
  })
  if (cardBorderColor) vars["--shell-card-border-color"] = cardBorderColor
  return vars
}

/** The full set of border CSS variable names, used to clear stale values. */
export const BORDER_STYLE_VAR_NAMES = [
  "--border",
  "--sidebar-border",
  "--shell-card-border-width",
  "--shell-card-border-color",
] as const
