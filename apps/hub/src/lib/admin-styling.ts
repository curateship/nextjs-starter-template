/**
 * Runtime admin appearance styling (Admin → Settings → Appearance).
 *
 * Framework-agnostic pure TypeScript ported from the custom-shell app so hub's
 * Next.js admin shell can offer the same runtime "Styling" controls: content
 * gutter/spacing, card border width + color, content / sidebar / modal
 * background colors, and modal styling (padding, overlay opacity, inner-card
 * bg/border). Values are persisted globally in adminSettings.settings.styling
 * and applied at runtime via CSS variables (see admin-client-shell.tsx and the
 * scoped rules in globals.css). Mirrors the --sidebar-width variable pattern.
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

export type ShellStyling = {
  /** Outer padding + gap between cards, in px (0–48). 0 = flat mode. */
  gutter: number
  /** Card border width in px (0 = off). */
  cardBorderWidth: number
  /** Card + table border color. */
  cardBorderColor: ShellBackground
  /** Main content area background. */
  content: ShellBackground
  /** Sidebar + sticky header background. */
  chrome: ShellBackground
  /** Dialog / modal styling. */
  modal: ShellModalStyling
}

export const MIN_CONTENT_GUTTER = 0
export const MAX_CONTENT_GUTTER = 48
export const DEFAULT_CONTENT_GUTTER = 24
export const MAX_CARD_BORDER_WIDTH = 3
export const DEFAULT_CARD_BORDER_WIDTH = 1
export const MAX_MODAL_PADDING = 48
export const DEFAULT_MODAL_PADDING = 24
export const DEFAULT_MODAL_OVERLAY_OPACITY = 50
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

export function createDefaultModalStyling(): ShellModalStyling {
  return {
    background: { mode: "default", strength: 100, color: "#ffffff" },
    borderWidth: DEFAULT_CARD_BORDER_WIDTH,
    borderColor: { mode: "default", strength: 40, color: "#d4d4d8" },
    padding: DEFAULT_MODAL_PADDING,
    overlayOpacity: DEFAULT_MODAL_OVERLAY_OPACITY,
    cardBackground: { mode: "default", strength: 100, color: "#ffffff" },
    cardBorderWidth: DEFAULT_CARD_BORDER_WIDTH,
    cardBorderColor: { mode: "default", strength: 40, color: "#d4d4d8" },
  }
}

export function createDefaultStyling(): ShellStyling {
  return {
    gutter: DEFAULT_CONTENT_GUTTER,
    cardBorderWidth: DEFAULT_CARD_BORDER_WIDTH,
    cardBorderColor: { mode: "default", strength: 40, color: "#d4d4d8" },
    // "default" keeps hub's existing bg-background canvas; users opt into muted/custom.
    content: { mode: "default", strength: DEFAULT_CONTENT_BACKGROUND_STRENGTH, color: "#f4f4f5" },
    chrome: { mode: "default", strength: 100, color: "#ffffff" },
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
    content: normalizeBackground(styling.content, fallback.content),
    chrome: normalizeBackground(styling.chrome, fallback.chrome),
    modal: normalizeModalStyling(styling.modal),
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
 * effect in AdminClientShell) so they reach the dialog, which portals to
 * document.body outside the shell subtree. Consumed by the modal rules in
 * globals.css. Values in "default" mode are omitted so the theme's own tokens
 * show through.
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
