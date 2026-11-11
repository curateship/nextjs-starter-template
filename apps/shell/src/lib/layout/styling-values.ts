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
  /**
   * Main content area background. **The signed-in app no longer reads this.**
   * The page colour is `--shell-canvas` in theme.css, which is a shade under
   * `--card` in both light and dark, so a card always reads as raised. This
   * setting blended toward `--muted`, which sits below `--card` in light mode
   * and above it in dark, so the same saved number turned the page darker than
   * the cards in one mode and lighter in the other. The field stays because
   * Settings → Public site → Styling still saves a value of its own through
   * `publicShellStyling`, and because a saved row must never lose a field.
   */
  content: ShellBackground
  /**
   * Sidebar + sticky header background. **The signed-in app no longer reads
   * this**, for the same reason as `content`: the saved "muted at 27%" put the
   * sidebar at 40 out of 255 in dark mode against cards at 46, the darkest
   * strip on the screen, while the identical number was invisible in light
   * mode. The rail and the sticky bar follow the theme's own `--sidebar`,
   * which sits between the page and a card in both modes. Kept for the public
   * side and for the saved row.
   */
  chrome: ShellBackground
  /** Dialog / modal styling. */
  modal: ShellModalStyling
  /** How dark the dark mode is. Ignored in light mode. */
  darkShade: DarkShadeId
  /**
   * How a three-column dashboard draws the tabs in its panel headers. Unset
   * reads as pills (`DEFAULT_DASHBOARD_TABS`). Optional, because a row saved
   * before the choice existed, and a scaffold captured before it, have none.
   */
  dashboardTabs?: DashboardTabStyle
  /**
   * Where the left menu and the sticky bar sit between the page colour (0) and
   * a card's colour (100). Unset reads as halfway (`DEFAULT_SIDEBAR_SHADE`).
   * Optional for the same reason as `dashboardTabs`.
   */
  sidebarShade?: number
  /**
   * How dark the page behind the cards is, from a card's colour (0) to the
   * theme's deepest page grey (100). Unset reads as halfway
   * (`DEFAULT_PAGE_SHADE`). Optional for the same reason as `dashboardTabs`.
   */
  pageShade?: number
  /**
   * The page blocks' look (Tyler, 7 Nov 2026: "I want to add blocks styling to
   * styling settings ... rounded corner, the gray shade bg and this padding"):
   * how round a block's corners are in px, how grey the block is behind its
   * white tile (0 white to 100 the theme's muted grey), and how far in from
   * the grey the tile sits, in px. Unset reads as the look blocks have always
   * had. Optional for the same reason as `dashboardTabs`.
   */
  blockRadius?: number
  blockShade?: number
  blockInset?: number
  /**
   * How grey a block's body is, the tile under its heading (Tyler, 9 Nov
   * 2026: "add a block styling option to change the shade of the block body
   * bg"): 0 white to 100 the theme's muted grey. Unset is white, the look
   * the tile always had.
   */
  blockBodyShade?: number
  /**
   * A line round the whole block, in px, and a soft shadow under it, 0 none
   * to 100 the strongest (Tyler, 9 Nov 2026: "Add another styling option to
   * add a border and shade around the block"). Unset is neither, the look
   * blocks always had.
   */
  blockBorder?: number
  blockShadow?: number
  /**
   * How dark the block's line is, 0 to 100 of the theme's text colour. The
   * Divider lines colour was too faint to see as a block's edge.
   */
  blockBorderShade?: number
  /**
   * Advanced blocks, the live ones an app draws in `BlockCard`, reach the
   * panel's sides instead of sitting inside its 15px space (Tyler, 9 Nov
   * 2026: "Add another option for blocks that its edge to edge but for
   * advanced blocks only"). Basic blocks keep the space. Unset is off.
   */
  blockEdgeToEdge?: boolean
  /**
   * How wide a three-panel dashboard's left and right panels open, as a share
   * of the dashboard's width, 10 (left) or 12 (right) to 36 (Tyler, 9 Nov 2026: "Add another
   * option for me to adjust the default width of the left and right panel").
   * Unset is 10 on the left and 12 on the right (Tyler, 9 Nov 2026:
   * "default 14% on left and 16% on right", then 10 Nov 2026: "the right
   * panel width 16px is default. Make default 12px"), and neither goes
   * narrower. A
   * width dragged in a browser still outranks it there.
   */
  leftPanelWidth?: number
  rightPanelWidth?: number
  /**
   * The width an open automation's step list opens at, in pixels (Tyler,
   * 9 Nov 2026: "this panel save is inconsistent ... add a panel size
   * setting in settings"). It holds that width while the right panel comes
   * and goes. Unset is 280px, the narrowest the tab names fit at.
   */
  stepListWidth?: number
  /**
   * The Admin dashboard's sections left out of its Dashboards block, from the
   * block's ⋮ (Tyler, 9 Nov 2026: "the dashboard block is missing the 3 dot
   * dropdown and need to add the hide/show dashboards", as Trade's Protocols
   * block does). Overview is never among them. For the whole site, with the
   * rest of its look. Unset hides nothing.
   */
  hiddenAdminSections?: string[]
  /**
   * The order of the Admin dashboard's sections under Overview, dragged in
   * the Dashboards block's ⋮ (Tyler, 9 Nov 2026: "I want to be able to drag
   * and drop dashboard item positions"). Overview stays first. A section not
   * named keeps its own place after the named ones. Unset is the shell's
   * order.
   */
  adminSectionOrder?: string[]
  /** The same for the CRM's Dashboards block (Tyler, 9 Nov 2026: "apply all the design pattern we did for dashboard to crm"). */
  hiddenCrmSections?: string[]
  /** The CRM's section order, as `adminSectionOrder` (9 Nov 2026). */
  crmSectionOrder?: string[]
  /** Stages the CRM's Leads card leaves out, from its ⋮ (9 Nov 2026). */
  hiddenLeadStages?: string[]
  /**
   * Overview's widgets, set apart from the blocks (Tyler, 8 Nov 2026:
   * "Because the widget sits in a shaded background it needs its own block
   * styling options"): the same three, corners in px, the grey 0 to 100
   * behind the tile, and the tile's edge in px. Unset follows the blocks'
   * settings, the look widgets had before these existed.
   */
  widgetRadius?: number
  widgetShade?: number
  widgetInset?: number
  /**
   * The blocks' Body shade, Border, Border shade and Shadow for widgets
   * (Tyler, 9 Nov 2026: "add the same 2 styling feature for widgets"). Unset
   * follows the blocks' settings, as the three above do.
   */
  widgetBodyShade?: number
  widgetBorder?: number
  widgetBorderShade?: number
  widgetShadow?: number
  /**
   * The grey folding cards in a right panel, such as a person's Profile and
   * Plan on the Admin dashboard (`PanelCard`, Tyler, 8 Nov 2026: "Add styling
   * options for this card ui ... I want to change border and bg"). Unset, a
   * card keeps its look: the theme's grey at 40% and a 1px line in the
   * theme's border colour.
   *
   * Since 10 Nov 2026 Settings sets them with the Blocks' sliders (Tyler:
   * "I want all the same ui styling the same as the blocks styling"): Grey
   * shade writes `panelCardBackground` as the muted grey at that strength,
   * Border shade writes `panelCardBorderColor` the same way, and Border is
   * `panelCardBorderWidth`. A colour saved before then keeps reading as it
   * was.
   */
  panelCardBackground?: ShellBackground
  panelCardBorderWidth?: number
  panelCardBorderColor?: ShellBackground
  /**
   * A panel card's corners in px and the shadow under it, 0 none to 100 the
   * strongest, as the Blocks' (10 Nov 2026). Unset is 10px, the corners the
   * cards always had, and no shadow.
   */
  panelCardRadius?: number
  panelCardShadow?: number
  /**
   * The rest of the Blocks' settings (Tyler, 10 Nov 2026: "i told you to
   * copy all of the same settings from the blocks Ui"): how far in from the
   * card's grey its tile sits in px, the tile's own grey 0 to 100, and
   * whether the card reaches the panel's sides. Unset is no edge, a tile the
   * card's own grey and off, the look the cards always had.
   */
  panelCardInset?: number
  panelCardBodyShade?: number
  panelCardEdgeToEdge?: boolean
}

/**
 * The two ways a dashboard's header tabs can be drawn: the grey track with a
 * raised pill, or words with a line under the one showing. Tyler, 20 Oct
 * 2026: "Line tab or pill tabs should be a choice all apps can make".
 */
export const DASHBOARD_TAB_STYLES = ["pills", "underline"] as const

export type DashboardTabStyle = (typeof DASHBOARD_TAB_STYLES)[number]

/** Pills, Tyler's pick on 20 Oct 2026 for a site that never chose. */
export const DEFAULT_DASHBOARD_TABS: DashboardTabStyle = "pills"

export function isDashboardTabStyle(value: unknown): value is DashboardTabStyle {
  return DASHBOARD_TAB_STYLES.includes(value as DashboardTabStyle)
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

/**
 * How dark the dark mode is, as four steps from the shell's original near
 * black up to a soft grey. Tyler asked for the same control Pomodoro has,
 * where the near-black canvas "is too dark and hurts the eye".
 *
 * `lift` is added to the lightness of every grey surface in the `.dark` block
 * of theme.css, so one number moves the whole palette together. The steps
 * match Pomodoro's four canvas colours: #0b0b0e, #17171a, #212125, #2b2b31.
 */
export const DARK_SHADES = [
  {
    id: "black",
    label: "Near black",
    help: "The original: almost no light in the canvas.",
    lift: 0,
    swatch: "#0b0b0e",
  },
  {
    id: "charcoal",
    label: "Charcoal",
    help: "A step up, still clearly dark.",
    lift: 0.055,
    swatch: "#17171a",
  },
  {
    id: "graphite",
    label: "Graphite",
    help: "Mid grey. Easiest on the eyes for a long session.",
    lift: 0.098,
    swatch: "#212125",
  },
  {
    id: "ash",
    label: "Soft grey",
    help: "The lightest dark mode, closest to grey paper.",
    lift: 0.141,
    swatch: "#2b2b31",
  },
] as const

export type DarkShadeId = (typeof DARK_SHADES)[number]["id"]

/** The ids alone, in the shape zod's `enum` wants. */
export const DARK_SHADE_IDS = DARK_SHADES.map((shade) => shade.id) as [
  DarkShadeId,
  ...DarkShadeId[],
]

/** Near black is the look every existing workspace already has, so it stays the default. */
export const DEFAULT_DARK_SHADE: DarkShadeId = "black"

/**
 * The styling a generated app starts with, as its scaffold file declares it.
 *
 * `darkShade` is optional, and the rest is not. A scaffold captured before dark
 * shades existed does not carry one, which `createDefaultStyling` below has
 * always handled by falling back when the value is missing or unrecognised.
 * `ShellStyling` says it is required, so Pomodoro's captured styling stopped
 * typechecking the moment the field was added. The code was right and the type
 * was wrong. It lives here rather than in `scaffold-styling.ts`, because every
 * generated app replaces that file with its own captured value.
 */
export type ScaffoldStyling = Omit<ShellStyling, "darkShade"> &
  Partial<Pick<ShellStyling, "darkShade">>

export function isDarkShadeId(value: unknown): value is DarkShadeId {
  return DARK_SHADES.some((shade) => shade.id === value)
}

export function darkShade(id: DarkShadeId) {
  return DARK_SHADES.find((shade) => shade.id === id) ?? DARK_SHADES[0]
}

export const MIN_CONTENT_GUTTER = 0
export const MAX_CONTENT_GUTTER = 48
export const DEFAULT_CONTENT_GUTTER = 14
export const MAX_CARD_BORDER_WIDTH = 3
export const DEFAULT_CARD_BORDER_WIDTH = 1
export const MAX_MODAL_PADDING = 48
export const DEFAULT_MODAL_PADDING = 20
export const DEFAULT_MODAL_OVERLAY_OPACITY = 8
/** Halfway between the page and a card, the shade the rail has always had. */
export const DEFAULT_SIDEBAR_SHADE = 50
/** Halfway between a card and the deepest page grey: the page it has always been. */
export const DEFAULT_PAGE_SHADE = 50
/** The block card as Tyler set it on 7 Nov 2026: rounded-2xl, muted at 50%, a 3px edge. */
export const DEFAULT_BLOCK_RADIUS = 16
export const MAX_BLOCK_RADIUS = 32
export const DEFAULT_BLOCK_SHADE = 50
export const DEFAULT_BLOCK_INSET = 3
/** The block's body is white unless changed. */
export const DEFAULT_BLOCK_BODY_SHADE = 0
/** No line and no shadow round a block unless changed. */
export const DEFAULT_BLOCK_BORDER = 0
export const MAX_BLOCK_BORDER = 3
export const DEFAULT_BLOCK_SHADOW = 0
export const DEFAULT_BLOCK_BORDER_SHADE = 10
/**
 * A side panel opens at 10% on the left and 12% on the right unless changed,
 * and neither drags or is set narrower than that (Tyler, 9 Nov 2026:
 * "default 14% on left and 16% on right", "make the 14 and 16 default and
 * cannot go lower than that", then "Set left side panel narrowest default to
 * 10%", and 10 Nov 2026: "the right panel width 16px is default. Make
 * default 12px", meaning the 16% setting). Both go up to 36%.
 */
export const DEFAULT_LEFT_PANEL_WIDTH = 10
export const DEFAULT_RIGHT_PANEL_WIDTH = 12
export const MAX_SIDE_PANEL_WIDTH = 36
/** An open automation's step list: 280px unless changed, from 200 to 480. */
export const DEFAULT_STEP_LIST_WIDTH = 280
export const MIN_STEP_LIST_WIDTH = 200
export const MAX_STEP_LIST_WIDTH = 480
export const MAX_BLOCK_INSET = 16
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

export function clampSidebarShade(value: unknown): number {
  return clampInt(value, 0, 100, DEFAULT_SIDEBAR_SHADE)
}

export function clampPageShade(value: unknown): number {
  return clampInt(value, 0, 100, DEFAULT_PAGE_SHADE)
}

export function clampBlockRadius(value: unknown): number {
  return clampInt(value, 0, MAX_BLOCK_RADIUS, DEFAULT_BLOCK_RADIUS)
}

export function clampBlockShade(value: unknown): number {
  return clampInt(value, 0, 100, DEFAULT_BLOCK_SHADE)
}

export function clampBlockBodyShade(value: unknown): number {
  return clampInt(value, 0, 100, DEFAULT_BLOCK_BODY_SHADE)
}

export function clampBlockBorder(value: unknown): number {
  return clampInt(value, 0, MAX_BLOCK_BORDER, DEFAULT_BLOCK_BORDER)
}

export function clampBlockShadow(value: unknown): number {
  return clampInt(value, 0, 100, DEFAULT_BLOCK_SHADOW)
}

export function clampBlockBorderShade(value: unknown): number {
  return clampInt(value, 0, 100, DEFAULT_BLOCK_BORDER_SHADE)
}

/** A side panel's width, never under `narrowest`, which is also its default. */
export function clampSidePanelWidth(value: unknown, narrowest: number): number {
  return clampInt(value, narrowest, MAX_SIDE_PANEL_WIDTH, narrowest)
}

/** The step list's width in pixels, 200 to 480. */
export function clampStepListWidth(value: unknown): number {
  return clampInt(value, MIN_STEP_LIST_WIDTH, MAX_STEP_LIST_WIDTH, DEFAULT_STEP_LIST_WIDTH)
}

/** A Dashboards block's hidden sections: names only, once each, never Overview. */
/**
 * The sections in the order saved, Overview first whatever was saved, and any
 * the saved order does not name after the named ones in their own order.
 */
export function orderSections<T extends string>(all: readonly T[], saved: readonly string[] | undefined): T[] {
  const rest = all.filter((section) => section !== "overview")
  const named = (saved ?? []).filter((section): section is T => (rest as readonly string[]).includes(section))
  return [
    ...all.filter((section) => section === "overview"),
    ...named,
    ...rest.filter((section) => !named.includes(section)),
  ]
}

function cleanHiddenSections(sections: unknown[]): string[] {
  return [
    ...new Set(sections.filter((section): section is string => typeof section === "string" && section !== "overview")),
  ].slice(0, 20)
}

/**
 * The block's shadow at a strength of 0 to 100: at 100 the black under it is
 * 20% solid, about as strong as a lifted card's. 0 is none.
 */
export function blockShadowCss(strength: number): string {
  if (strength <= 0) return "none"
  const alpha = (strength * 0.2) / 100
  return `0 2px 12px rgb(0 0 0 / ${alpha.toFixed(3)})`
}

export function clampBlockInset(value: unknown): number {
  return clampInt(value, 0, MAX_BLOCK_INSET, DEFAULT_BLOCK_INSET)
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
      // A scaffold captured before dark shades existed has no `darkShade`.
      darkShade: isDarkShadeId(scaffoldStyling.darkShade)
        ? scaffoldStyling.darkShade
        : DEFAULT_DARK_SHADE,
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
    darkShade: DEFAULT_DARK_SHADE,
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
    darkShade: isDarkShadeId(styling.darkShade)
      ? styling.darkShade
      : fallback.darkShade,
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
    ...(isDashboardTabStyle(styling.dashboardTabs)
      ? { dashboardTabs: styling.dashboardTabs }
      : {}),
    ...(styling.sidebarShade === undefined
      ? {}
      : { sidebarShade: clampSidebarShade(styling.sidebarShade) }),
    ...(styling.pageShade === undefined
      ? {}
      : { pageShade: clampPageShade(styling.pageShade) }),
    ...(styling.blockRadius === undefined ? {} : { blockRadius: clampBlockRadius(styling.blockRadius) }),
    ...(styling.blockShade === undefined ? {} : { blockShade: clampBlockShade(styling.blockShade) }),
    ...(styling.blockInset === undefined ? {} : { blockInset: clampBlockInset(styling.blockInset) }),
    ...(styling.blockBodyShade === undefined ? {} : { blockBodyShade: clampBlockBodyShade(styling.blockBodyShade) }),
    ...(styling.blockBorder === undefined ? {} : { blockBorder: clampBlockBorder(styling.blockBorder) }),
    ...(styling.blockShadow === undefined ? {} : { blockShadow: clampBlockShadow(styling.blockShadow) }),
    ...(styling.blockBorderShade === undefined ? {} : { blockBorderShade: clampBlockBorderShade(styling.blockBorderShade) }),
    ...(typeof styling.blockEdgeToEdge === "boolean" ? { blockEdgeToEdge: styling.blockEdgeToEdge } : {}),
    ...(styling.leftPanelWidth === undefined ? {} : { leftPanelWidth: clampSidePanelWidth(styling.leftPanelWidth, DEFAULT_LEFT_PANEL_WIDTH) }),
    ...(Array.isArray(styling.hiddenAdminSections)
      ? { hiddenAdminSections: cleanHiddenSections(styling.hiddenAdminSections) }
      : {}),
    ...(Array.isArray(styling.hiddenCrmSections)
      ? { hiddenCrmSections: cleanHiddenSections(styling.hiddenCrmSections) }
      : {}),
    // The same rule cleans an order: strings, once each, never Overview.
    ...(Array.isArray(styling.adminSectionOrder)
      ? { adminSectionOrder: cleanHiddenSections(styling.adminSectionOrder) }
      : {}),
    ...(Array.isArray(styling.crmSectionOrder)
      ? { crmSectionOrder: cleanHiddenSections(styling.crmSectionOrder) }
      : {}),
    ...(Array.isArray(styling.hiddenLeadStages)
      ? { hiddenLeadStages: cleanHiddenSections(styling.hiddenLeadStages) }
      : {}),
    ...(styling.rightPanelWidth === undefined ? {} : { rightPanelWidth: clampSidePanelWidth(styling.rightPanelWidth, DEFAULT_RIGHT_PANEL_WIDTH) }),
    ...(styling.stepListWidth === undefined ? {} : { stepListWidth: clampStepListWidth(styling.stepListWidth) }),
    // Widgets keep to the blocks' ranges.
    ...(styling.widgetRadius === undefined ? {} : { widgetRadius: clampBlockRadius(styling.widgetRadius) }),
    ...(styling.widgetShade === undefined ? {} : { widgetShade: clampBlockShade(styling.widgetShade) }),
    ...(styling.widgetInset === undefined ? {} : { widgetInset: clampBlockInset(styling.widgetInset) }),
    ...(styling.widgetBodyShade === undefined ? {} : { widgetBodyShade: clampBlockBodyShade(styling.widgetBodyShade) }),
    ...(styling.widgetBorder === undefined ? {} : { widgetBorder: clampBlockBorder(styling.widgetBorder) }),
    ...(styling.widgetBorderShade === undefined ? {} : { widgetBorderShade: clampBlockBorderShade(styling.widgetBorderShade) }),
    ...(styling.widgetShadow === undefined ? {} : { widgetShadow: clampBlockShadow(styling.widgetShadow) }),
    ...(styling.panelCardBackground === undefined
      ? {}
      : { panelCardBackground: normalizeBackground(styling.panelCardBackground, DEFAULT_PANEL_CARD_COLOR) }),
    ...(styling.panelCardBorderWidth === undefined
      ? {}
      : { panelCardBorderWidth: clampCardBorderWidth(styling.panelCardBorderWidth) }),
    ...(styling.panelCardBorderColor === undefined
      ? {}
      : { panelCardBorderColor: normalizeBackground(styling.panelCardBorderColor, DEFAULT_PANEL_CARD_COLOR) }),
    ...(styling.panelCardRadius === undefined ? {} : { panelCardRadius: clampBlockRadius(styling.panelCardRadius) }),
    ...(styling.panelCardShadow === undefined ? {} : { panelCardShadow: clampBlockShadow(styling.panelCardShadow) }),
    ...(styling.panelCardInset === undefined ? {} : { panelCardInset: clampBlockInset(styling.panelCardInset) }),
    ...(styling.panelCardBodyShade === undefined
      ? {}
      : { panelCardBodyShade: clampBlockBodyShade(styling.panelCardBodyShade) }),
    ...(typeof styling.panelCardEdgeToEdge === "boolean" ? { panelCardEdgeToEdge: styling.panelCardEdgeToEdge } : {}),
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

/**
 * The dark-shade CSS variable, applied to the document root (via an effect in
 * ShellLayout) so it reaches the `.dark` block in theme.css. Both sit on
 * <html>, and an inline style beats a stylesheet rule on the same element, so
 * this overrides the `--shell-dark-lift: 0` the block declares. Light mode
 * never reads the variable.
 */
export function getDarkShadeVars(styling: ShellStyling): Record<string, string> {
  return {
    "--shell-dark-lift": String(darkShade(styling.darkShade).lift),
  }
}

/** The dark-shade CSS variable names, used to clear stale values. */
export const DARK_SHADE_VAR_NAMES = ["--shell-dark-lift"] as const

/**
 * The left menu's shade, applied to the document root the same way as the
 * dark shade. `--shell-rail` in theme.css mixes this much of `--card` into
 * `--shell-canvas`, in both palettes, so the rail stays between the page and a
 * card whatever the mode or the dark shade.
 */
export function getSidebarShadeVars(
  styling: ShellStyling
): Record<string, string> {
  return {
    "--shell-rail-card-share": `${clampSidebarShade(styling.sidebarShade)}%`,
  }
}

/** The sidebar-shade CSS variable names, used to clear stale values. */
export const SIDEBAR_SHADE_VAR_NAMES = ["--shell-rail-card-share"] as const

/**
 * The page's shade, applied to the document root like the left menu's.
 * `--shell-canvas` in theme.css mixes this much of `--shell-canvas-deep` into
 * `--card`, in both palettes. The rail is mixed from the canvas, so it follows.
 */
export function getPageShadeVars(styling: ShellStyling): Record<string, string> {
  return {
    "--shell-page-depth": `${clampPageShade(styling.pageShade)}%`,
  }
}

/** The page-shade CSS variable names, used to clear stale values. */
export const PAGE_SHADE_VAR_NAMES = ["--shell-page-depth"] as const

/**
 * The page blocks' look, on the document root so every block on every page
 * reads it (`BlockCard` in `src/components/shared/notes/block-card.tsx`).
 */
export function getBlockStyleVars(styling: ShellStyling): Record<string, string> {
  return {
    "--shell-block-radius": `${clampBlockRadius(styling.blockRadius)}px`,
    "--shell-block-shade": `${clampBlockShade(styling.blockShade)}%`,
    "--shell-block-inset": `${clampBlockInset(styling.blockInset)}px`,
    "--shell-block-body-shade": `${clampBlockBodyShade(styling.blockBodyShade)}%`,
    "--shell-block-border": `${clampBlockBorder(styling.blockBorder)}px`,
    "--shell-block-shadow": blockShadowCss(clampBlockShadow(styling.blockShadow)),
    "--shell-block-border-shade": `${clampBlockBorderShade(styling.blockBorderShade)}%`,
    // 1 reaches past the panel's space, 0 keeps it; the block multiplies.
    "--shell-block-bleed": styling.blockEdgeToEdge === true ? "1" : "0",
  }
}

/** The block CSS variable names, used to clear stale values. */
export const BLOCK_STYLE_VAR_NAMES = [
  "--shell-block-radius",
  "--shell-block-shade",
  "--shell-block-inset",
  "--shell-block-body-shade",
  "--shell-block-border",
  "--shell-block-shadow",
  "--shell-block-border-shade",
  "--shell-block-bleed",
] as const

/**
 * Overview's widgets' look (Settings → Styling → Widgets), on the root as the
 * blocks' is (`WidgetCard` in `src/components/shared/widgets/widget-card.tsx`).
 */
export function getWidgetStyleVars(styling: ShellStyling): Record<string, string> {
  return {
    // Unset, a widget follows the blocks, the look widgets had before they
    // had settings of their own.
    "--shell-widget-radius": `${clampBlockRadius(styling.widgetRadius ?? styling.blockRadius)}px`,
    "--shell-widget-shade": `${clampBlockShade(styling.widgetShade ?? styling.blockShade)}%`,
    "--shell-widget-inset": `${clampBlockInset(styling.widgetInset ?? styling.blockInset)}px`,
    "--shell-widget-body-shade": `${clampBlockBodyShade(styling.widgetBodyShade ?? styling.blockBodyShade)}%`,
    "--shell-widget-border": `${clampBlockBorder(styling.widgetBorder ?? styling.blockBorder)}px`,
    "--shell-widget-border-shade": `${clampBlockBorderShade(styling.widgetBorderShade ?? styling.blockBorderShade)}%`,
    "--shell-widget-shadow": blockShadowCss(clampBlockShadow(styling.widgetShadow ?? styling.blockShadow)),
  }
}

/** The widget CSS variable names, used to clear stale values. */
export const WIDGET_STYLE_VAR_NAMES = [
  "--shell-widget-radius",
  "--shell-widget-shade",
  "--shell-widget-inset",
  "--shell-widget-body-shade",
  "--shell-widget-border",
  "--shell-widget-border-shade",
  "--shell-widget-shadow",
] as const

/** A panel card's colours left to the theme, the look they always had. */
export const DEFAULT_PANEL_CARD_COLOR: ShellBackground = { mode: "default", strength: 40, color: "#ffffff" }
/** A panel card's line, 1px as it always was. */
export const DEFAULT_PANEL_CARD_BORDER_WIDTH = 1
/** A panel card's corners, 10px, the theme's `rounded-lg` they always had. */
export const DEFAULT_PANEL_CARD_RADIUS = 10
/** The grey a panel card left to the theme shows: its muted grey at 40%. */
export const DEFAULT_PANEL_CARD_SHADE = 40
/**
 * Where Border shade's thumb sits while the line is left to the theme. The
 * theme's border colour is about the theme's grey text colour at 18% on a
 * light page; moving the thumb saves that grey at the strength picked.
 */
export const DEFAULT_PANEL_CARD_BORDER_SHADE = 18

/**
 * Grey shade and Border shade as the Settings sliders show them: the saved
 * strength when the colour is the theme's grey, the default otherwise.
 * `custom` is true for a fixed colour saved before the sliders, which shows
 * until a slider is moved.
 */
export function panelCardShade(styling: ShellStyling) {
  return sliderShade(styling.panelCardBackground, DEFAULT_PANEL_CARD_SHADE)
}

export function panelCardBorderShade(styling: ShellStyling) {
  return sliderShade(styling.panelCardBorderColor, DEFAULT_PANEL_CARD_BORDER_SHADE)
}

function sliderShade(bg: ShellBackground | undefined, fallback: number) {
  if (bg?.mode === "muted") return { value: clampStrength(bg.strength), isDefault: false, custom: false }
  return { value: fallback, isDefault: bg?.mode !== "custom", custom: bg?.mode === "custom" }
}

/**
 * The panel cards' look, every setting the Blocks have (Settings → Styling → Panel cards),
 * on the root so every `PanelCard` reads them through its rule in
 * theme.css. A colour left to the theme sets no variable, and the rule's
 * own fallback shows.
 */
export function getPanelCardStyleVars(styling: ShellStyling): Record<string, string> {
  const vars: Record<string, string> = {
    "--shell-panel-card-border-width": String(
      clampCardBorderWidth(styling.panelCardBorderWidth ?? DEFAULT_PANEL_CARD_BORDER_WIDTH)
    ),
    "--shell-panel-card-radius": `${clampBlockRadius(styling.panelCardRadius ?? DEFAULT_PANEL_CARD_RADIUS)}px`,
    "--shell-panel-card-shadow": blockShadowCss(clampBlockShadow(styling.panelCardShadow ?? 0)),
    "--shell-panel-card-inset": `${clampBlockInset(styling.panelCardInset ?? 0)}px`,
    // Unset, the tile is see-through, so the card's own grey shows and the
    // rows sit straight on it as they always did. Given a shade, the tile is
    // drawn and its rows start 12px below its top edge.
    "--shell-panel-card-body":
      styling.panelCardBodyShade === undefined
        ? "transparent"
        : `color-mix(in oklab, var(--muted) ${clampBlockBodyShade(styling.panelCardBodyShade)}%, var(--card))`,
    "--shell-panel-card-tile-top": styling.panelCardBodyShade === undefined ? "0px" : "12px",
    // 1 reaches past the panel's space, 0 keeps it; the card multiplies.
    "--shell-panel-card-bleed": styling.panelCardEdgeToEdge === true ? "1" : "0",
  }
  const background = resolveBackground(styling.panelCardBackground ?? DEFAULT_PANEL_CARD_COLOR, {
    base: "--muted",
    opaque: true,
  })
  if (background) vars["--shell-panel-card-bg"] = background
  const borderColor = resolveBackground(styling.panelCardBorderColor ?? DEFAULT_PANEL_CARD_COLOR, {
    base: "--muted-foreground",
  })
  if (borderColor) vars["--shell-panel-card-border-color"] = borderColor
  return vars
}

/** The panel card CSS variable names, used to clear stale values. */
export const PANEL_CARD_STYLE_VAR_NAMES = [
  "--shell-panel-card-bg",
  "--shell-panel-card-border-width",
  "--shell-panel-card-border-color",
  "--shell-panel-card-radius",
  "--shell-panel-card-shadow",
  "--shell-panel-card-inset",
  "--shell-panel-card-body",
  "--shell-panel-card-tile-top",
  "--shell-panel-card-bleed",
] as const
