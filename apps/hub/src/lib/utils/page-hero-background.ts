const MUTED_BACKGROUND_SHADE_COLORS = [
  "var(--background)",
  "color-mix(in oklab, var(--muted) 32%, var(--background))",
  "color-mix(in oklab, var(--muted) 46%, var(--background))",
  "color-mix(in oklab, var(--muted) 60%, var(--background))",
  "color-mix(in oklab, var(--muted) 76%, var(--background))",
  "var(--muted)",
  "color-mix(in oklab, var(--muted) 88%, var(--foreground))",
  "color-mix(in oklab, var(--muted) 76%, var(--foreground))",
  "color-mix(in oklab, var(--muted) 64%, var(--foreground))",
  "color-mix(in oklab, var(--muted) 52%, var(--foreground))",
]

const RENDERABLE_PAGE_BLOCK_TYPES = new Set([
  "hero",
  "rich-text",
  "faq",
  "listing-views",
  "divider",
  "auth",
  "testimonials",
  "embedded",
])

function getMutedShadeValue(value?: number) {
  if (typeof value !== "number" || Number.isNaN(value)) return 1
  return Math.min(10, Math.max(1, Math.round(value)))
}

export function getMutedHeroBackgroundColor(shade?: number) {
  return MUTED_BACKGROUND_SHADE_COLORS[getMutedShadeValue(shade) - 1]
}

export function getHeroBackgroundColor(backgroundColor?: string, customColor?: string, mutedShade?: number) {
  if (backgroundColor === "custom" && /^#[0-9a-fA-F]{6}$/.test(customColor || "")) {
    return customColor!
  }

  return getMutedHeroBackgroundColor(mutedShade)
}

function getResolvedHeroStyleConfig(content: Record<string, any> | null | undefined) {
  if (!content) return {}

  const heroStyle = typeof content.heroStyle === "string" ? content.heroStyle : "default"
  return content.styleConfig?.[heroStyle] || content
}

export function getHeroNavigationBackgroundColor(
  blocks: Array<{ type: string; content: Record<string, any>; display_order?: number }>
) {
  const firstRenderableBlock = [...blocks]
    .sort((a, b) => {
      const orderA = typeof a.display_order === "number" ? a.display_order : 0
      const orderB = typeof b.display_order === "number" ? b.display_order : 0
      return orderA - orderB
    })
    .find((block) => RENDERABLE_PAGE_BLOCK_TYPES.has(block.type))

  if (firstRenderableBlock?.type !== "hero") return undefined

  const config = getResolvedHeroStyleConfig(firstRenderableBlock.content)
  if (config.extendBackgroundUnderNavigation !== true) return undefined

  return getHeroBackgroundColor(config.backgroundColor, config.backgroundCustomColor, config.backgroundMutedShade)
}
