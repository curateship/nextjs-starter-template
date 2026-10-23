/**
 * Runtime admin "Styling" settings (Settings → Styling tab). Applied at runtime
 * via CSS variables on the admin content canvas (AdminLayout), the shell wrapper
 * (chrome/sidebar background), and the document root (modal styling). Mirrors the
 * mechanism used by apps/custom-shell, but persisted in directory's own
 * admin_settings table and applied through directory's admin shell.
 *
 * Defaults are tuned to reproduce directory's current look (12px canvas gutter,
 * borderless cards, popover modal surface, light 10% backdrop), so enabling the
 * feature changes nothing until an admin adjusts a control.
 */

export type AdminBackgroundMode = "default" | "muted" | "custom"

export type AdminBackground = {
  /** default = keep the theme's own token; muted = theme muted at a strength; custom = a fixed color. */
  mode: AdminBackgroundMode
  /** 0–100, applied when mode === "muted". */
  strength: number
  /** CSS color, applied when mode === "custom". */
  color: string
}

export type AdminModalStyling = {
  /** Modal surface background. */
  background: AdminBackground
  /** Modal border width in px (0 = off). */
  borderWidth: number
  /** Modal border color. */
  borderColor: AdminBackground
  /** Inner spacing: modal padding + the gaps between its sections/cards, in px. */
  padding: number
  /** Backdrop dimming behind the modal, 0–100. */
  overlayOpacity: number
  /** Background of cards inside the modal. */
  cardBackground: AdminBackground
  /** Border width of cards inside the modal, in px (0 = off). */
  cardBorderWidth: number
  /** Border color of cards inside the modal. */
  cardBorderColor: AdminBackground
}

export type AdminStyling = {
  /** Outer canvas padding, in px (0–48). 0 = flat mode. */
  gutter: number
  /** Card border width in px (0 = off). */
  cardBorderWidth: number
  /** Card + table border color. */
  cardBorderColor: AdminBackground
  /** Divider lines: the rules inside cards, the sidebar edge, chart gridlines. */
  dividerColor: AdminBackground
  /** Main content area background. */
  content: AdminBackground
  /** Sidebar + sticky header background. */
  chrome: AdminBackground
  /** Dialog / modal styling. */
  modal: AdminModalStyling
}

export const MIN_CONTENT_GUTTER = 0
export const MAX_CONTENT_GUTTER = 48
// Reproduces AdminLayout's current `p-3` (12px) canvas gutter.
export const DEFAULT_CONTENT_GUTTER = 12
export const MAX_CARD_BORDER_WIDTH = 3
// Directory admin cards are borderless by default.
export const DEFAULT_CARD_BORDER_WIDTH = 0
export const MAX_MODAL_PADDING = 48
// A modal's inner spacing (padding + section/card gaps), independent of the
// page content gutter.
export const DEFAULT_MODAL_PADDING = 24
// A light dimming behind the modal, matching the shared custom-shell standard.
export const DEFAULT_MODAL_OVERLAY_OPACITY = 10
export const DEFAULT_STRENGTH = 60

export const ADMIN_BACKGROUND_MODES: readonly AdminBackgroundMode[] = [
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
  return clampInt(value, 0, 100, DEFAULT_STRENGTH)
}

export function clampModalPadding(value: unknown): number {
  return clampInt(value, 0, MAX_MODAL_PADDING, DEFAULT_MODAL_PADDING)
}

export function clampOverlayOpacity(value: unknown): number {
  return clampInt(value, 0, 100, DEFAULT_MODAL_OVERLAY_OPACITY)
}

export function createDefaultModalStyling(): AdminModalStyling {
  return {
    background: { mode: "default", strength: 100, color: "#ffffff" },
    borderWidth: 1,
    borderColor: { mode: "default", strength: 40, color: "#d4d4d8" },
    padding: DEFAULT_MODAL_PADDING,
    overlayOpacity: DEFAULT_MODAL_OVERLAY_OPACITY,
    cardBackground: { mode: "default", strength: 100, color: "#ffffff" },
    cardBorderWidth: DEFAULT_CARD_BORDER_WIDTH,
    cardBorderColor: { mode: "default", strength: 40, color: "#d4d4d8" },
  }
}

export function createDefaultStyling(): AdminStyling {
  return {
    gutter: DEFAULT_CONTENT_GUTTER,
    cardBorderWidth: DEFAULT_CARD_BORDER_WIDTH,
    cardBorderColor: { mode: "default", strength: 40, color: "#d4d4d8" },
    dividerColor: { mode: "default", strength: 25, color: "#e4e4e7" },
    content: { mode: "default", strength: DEFAULT_STRENGTH, color: "#f4f4f5" },
    chrome: { mode: "default", strength: 100, color: "#ffffff" },
    modal: createDefaultModalStyling(),
  }
}

function normalizeBackground(
  value: unknown,
  fallback: AdminBackground
): AdminBackground {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...fallback }
  }
  const bg = value as Partial<AdminBackground>
  return {
    mode: ADMIN_BACKGROUND_MODES.includes(bg.mode as AdminBackgroundMode)
      ? (bg.mode as AdminBackgroundMode)
      : fallback.mode,
    strength: clampStrength(bg.strength ?? fallback.strength),
    color: typeof bg.color === "string" && bg.color.trim() ? bg.color : fallback.color,
  }
}

export function normalizeModalStyling(value: unknown): AdminModalStyling {
  const fallback = createDefaultModalStyling()
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fallback
  }
  const modal = value as Partial<AdminModalStyling>
  return {
    background: normalizeBackground(modal.background, fallback.background),
    borderWidth: clampCardBorderWidth(modal.borderWidth ?? fallback.borderWidth),
    borderColor: normalizeBackground(modal.borderColor, fallback.borderColor),
    padding: clampModalPadding(modal.padding ?? fallback.padding),
    overlayOpacity: clampOverlayOpacity(modal.overlayOpacity ?? fallback.overlayOpacity),
    cardBackground: normalizeBackground(modal.cardBackground, fallback.cardBackground),
    cardBorderWidth: clampCardBorderWidth(modal.cardBorderWidth ?? fallback.cardBorderWidth),
    cardBorderColor: normalizeBackground(modal.cardBorderColor, fallback.cardBorderColor),
  }
}

export function normalizeStyling(value: unknown): AdminStyling {
  const fallback = createDefaultStyling()
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fallback
  }
  const styling = value as Partial<AdminStyling>
  return {
    gutter: clampGutter(styling.gutter ?? fallback.gutter),
    cardBorderWidth: clampCardBorderWidth(styling.cardBorderWidth ?? fallback.cardBorderWidth),
    cardBorderColor: normalizeBackground(styling.cardBorderColor, fallback.cardBorderColor),
    dividerColor: normalizeBackground(styling.dividerColor, fallback.dividerColor),
    content: normalizeBackground(styling.content, fallback.content),
    chrome: normalizeBackground(styling.chrome, fallback.chrome),
    modal: normalizeModalStyling(styling.modal),
  }
}

type ResolveBackgroundOptions = {
  /** CSS custom property to blend for the "muted" mode (default --muted). */
  base?: string
  /** When true, "muted" blends toward the opaque background instead of transparent. */
  opaque?: boolean
}

/**
 * Resolve a background/color to a CSS color string, or undefined when the
 * theme's own token should be left in place (mode === "default").
 */
export function resolveBackground(
  bg: AdminBackground,
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
 * CSS custom properties applied to the document root, so they reach the dialog,
 * which portals to <body> outside the shell subtree. Consumed by the modal rules
 * in styles.css. Values in "default" mode are omitted so the theme's own tokens
 * (via the CSS fallbacks) show through.
 *
 * `--shell-gutter` is emitted here as well as on the content canvas so portaled
 * surfaces can read the page content spacing. Modals no longer follow it: their
 * inner spacing has its own setting, emitted as `--shell-modal-padding`.
 */
export function getRootStyleVars(styling: AdminStyling): Record<string, string> {
  const modal = styling.modal
  const vars: Record<string, string> = {
    "--shell-gutter": `${clampGutter(styling.gutter)}px`,
    "--shell-modal-padding": `${clampModalPadding(modal.padding)}px`,
    "--shell-modal-overlay-opacity": `${clampOverlayOpacity(modal.overlayOpacity)}%`,
    "--shell-modal-border-width": String(clampCardBorderWidth(modal.borderWidth)),
    "--shell-modal-card-border-width": String(clampCardBorderWidth(modal.cardBorderWidth)),
  }
  // Divider lines are everywhere and they all resolve to the theme's --border
  // token: the rules inside cards, the sidebar edge, table row separators, and
  // recharts gridlines (which chart.tsx maps onto stroke-border). Overriding the
  // token itself recolors the lot without touching a single component.
  const dividerColor = resolveBackground(styling.dividerColor, {
    base: "--muted-foreground",
  })
  if (dividerColor) {
    vars["--border"] = dividerColor
    vars["--sidebar-border"] = dividerColor
  }
  const background = resolveBackground(modal.background, { base: "--muted", opaque: true })
  if (background) vars["--shell-modal-bg"] = background
  const borderColor = resolveBackground(modal.borderColor, { base: "--muted-foreground" })
  if (borderColor) vars["--shell-modal-border-color"] = borderColor
  const cardBackground = resolveBackground(modal.cardBackground, { base: "--muted", opaque: true })
  if (cardBackground) vars["--shell-modal-card-bg"] = cardBackground
  const cardBorderColor = resolveBackground(modal.cardBorderColor, { base: "--muted-foreground" })
  if (cardBorderColor) vars["--shell-modal-card-border-color"] = cardBorderColor
  return vars
}

/**
 * Card styling variables for public site pages: the gap between cards plus the
 * border width and colour. All three are consumed by the `[data-site-cards]`
 * rules in styles.css, which map the gutter onto the `--shell-gutter` that
 * `CardGroup` already reads.
 *
 * Public cards default to a 1px hairline in CSS, so nothing is emitted until an
 * admin has actually saved the Settings → Styling controls — a saved value
 * (including 0 = no border) then wins on the public site as well as in the admin.
 */
export function getSiteCardStyleVars(
  styling: unknown
): Record<string, string> | undefined {
  if (!styling || typeof styling !== "object" || Array.isArray(styling)) return undefined

  const normalized = normalizeStyling(styling)
  const vars: Record<string, string> = {
    // Content spacing drives the gap between cards, the same value the admin
    // canvas uses. Without it CardGroup falls back to its own 12px default and
    // the public page silently ignores the setting. Emitted under its own name
    // so it only reaches card groups inside a [data-site-cards] subtree (see
    // styles.css) rather than every public block that happens to use CardGroup.
    "--site-content-gutter": `${normalized.gutter}px`,
    // Content spacing 0 is flat mode: the admin turns card borders off there and
    // disables the border control, so the public site must not keep drawing them.
    "--site-card-border-width": String(normalized.gutter === 0 ? 0 : normalized.cardBorderWidth),
  }
  const borderColor = resolveBackground(normalized.cardBorderColor, {
    base: "--muted-foreground",
  })
  if (borderColor) vars["--site-card-border-color"] = borderColor

  return vars
}

/** The full set of root CSS variable names, used to clear stale values. */
export const ROOT_STYLE_VAR_NAMES = [
  "--shell-gutter",
  "--border",
  "--sidebar-border",
  "--shell-modal-padding",
  "--shell-modal-overlay-opacity",
  "--shell-modal-border-width",
  "--shell-modal-border-color",
  "--shell-modal-bg",
  "--shell-modal-card-border-width",
  "--shell-modal-card-border-color",
  "--shell-modal-card-bg",
] as const
