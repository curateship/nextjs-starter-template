import { z } from "zod"

export const BROADCAST_BLOCK_KINDS = [
  "header",
  "richText",
  "button",
  "divider",
  "footer",
] as const

export type BroadcastBlockKind = (typeof BROADCAST_BLOCK_KINDS)[number]

const hexColorSchema = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "Use a hex color like #ffffff")

const alignmentSchema = z.enum(["left", "center", "right"])

const headerContentSchema = z.object({
  logoUrl: z.string().trim().max(2000).default(""),
  logoWidth: z.number().int().min(16).max(600).default(120),
  logoHeight: z.number().int().min(8).max(600).nullable().default(null),
  alignment: alignmentSchema.default("center"),
  backgroundColor: hexColorSchema.default("#ffffff"),
  paddingTop: z.number().int().min(0).max(120).default(20),
  paddingBottom: z.number().int().min(0).max(120).default(20),
})

const richTextContentSchema = z.object({
  htmlContent: z.string().max(200_000).default(""),
  backgroundColor: hexColorSchema.default("#ffffff"),
  padding: z.number().int().min(0).max(120).default(20),
})

/**
 * The token an action button falls back to when it has no address of its own.
 *
 * The app's own emails all exist to get somebody to one link — verify this,
 * reset that — and that link is built fresh every time with a one-use token in
 * it. So the button in those emails cannot hold an address; it holds this, and
 * the send fills it in. Leaving `url` blank on a newsletter means the same
 * thing, and there the token has nothing to fill it, so the button is dropped
 * rather than sent pointing at nonsense.
 */
export const ACTION_URL_TOKEN = "{{action_url}}"

/** The only schemes a link in an email may use. Matches the rich-text editor. */
const SAFE_LINK_SCHEMES = ["http:", "https:", "mailto:"]

/**
 * An address that is safe to put in an href, or empty if it is not one.
 *
 * `javascript:` is the one that matters. Escaping the address stops it breaking
 * out of the attribute but does nothing about the scheme, and the editor draws
 * every block by handing this HTML straight to the browser — so a saved
 * `javascript:` button would be a live link in the next admin's preview, not
 * just in somebody's inbox. Rich-text links have been held to these three
 * schemes all along; this holds buttons to the same three.
 */
export function safeLinkUrl(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) return ""
  try {
    // A relative address has no scheme to be wrong about, but an email is read
    // outside the app and has nothing to resolve one against, so the base only
    // exists to let the parser work — a link that needs it is not usable.
    const parsed = new URL(trimmed)
    return SAFE_LINK_SCHEMES.includes(parsed.protocol) ? trimmed : ""
  } catch {
    return ""
  }
}

const buttonContentSchema = z.object({
  label: z.string().trim().max(120).default("Open"),
  /** Blank means "the link the app makes" — see ACTION_URL_TOKEN. */
  url: z.string().trim().max(2000).default(""),
  backgroundColor: hexColorSchema.default("#18181b"),
  textColor: hexColorSchema.default("#fafafa"),
  alignment: alignmentSchema.default("left"),
  borderRadius: z.number().int().min(0).max(40).default(8),
  padding: z.number().int().min(0).max(120).default(20),
})

const dividerContentSchema = z.object({
  color: hexColorSchema.default("#e5e7eb"),
  thickness: z.number().int().min(1).max(16).default(1),
  width: z.number().int().min(10).max(100).default(100),
  spacing: z.number().int().min(0).max(120).default(20),
})

const footerContentSchema = z.object({
  companyName: z.string().max(255).default(""),
  companyAddress: z.string().max(500).default(""),
  alignment: alignmentSchema.default("center"),
  showUnsubscribe: z.boolean().default(true),
})

const blockIdSchema = z.string().min(1).max(100)

export const broadcastBlockSchema = z.discriminatedUnion("kind", [
  z.object({
    id: blockIdSchema,
    kind: z.literal("header"),
    content: headerContentSchema,
  }),
  z.object({
    id: blockIdSchema,
    kind: z.literal("richText"),
    content: richTextContentSchema,
  }),
  z.object({
    id: blockIdSchema,
    kind: z.literal("button"),
    content: buttonContentSchema,
  }),
  z.object({
    id: blockIdSchema,
    kind: z.literal("divider"),
    content: dividerContentSchema,
  }),
  z.object({
    id: blockIdSchema,
    kind: z.literal("footer"),
    content: footerContentSchema,
  }),
])

export const broadcastBlocksSchema = z
  .array(broadcastBlockSchema)
  .max(40, "A broadcast can hold at most 40 blocks")

export type BroadcastBlock = z.infer<typeof broadcastBlockSchema>

export const BROADCAST_BLOCK_META: Record<
  BroadcastBlockKind,
  { name: string; description: string }
> = {
  header: { name: "Header", description: "Logo banner" },
  richText: { name: "Rich text", description: "Formatted text content" },
  button: { name: "Button", description: "A button to click" },
  divider: { name: "Divider", description: "Horizontal separator" },
  footer: { name: "Footer", description: "Company info and unsubscribe" },
}

/**
 * How each kind of block is set up before anyone touches it.
 *
 * Empty to begin with, which means "use the built-in settings". Editing a block
 * in the left panel — one that is not in any email yet — writes its kind in
 * here, and from then on every new block of that kind starts that way. Saved per
 * workspace, so one person's company footer is not everyone's.
 *
 * A kind missing from here is not an error; it is the common case.
 */
export type BroadcastBlockDefaults = {
  [K in BroadcastBlockKind]?: Extract<BroadcastBlock, { kind: K }>["content"]
}

/**
 * Keeps only the saved defaults that still make sense.
 *
 * These are read back out of a settings blob that was written by an older
 * version of this app, so a colour that is no longer a colour or a field that
 * has since been removed has to fall away quietly rather than break the editor.
 * The block schema is the judge, and the block it judges carries a throwaway id
 * because ids belong to blocks, not to defaults.
 */
export function cleanBroadcastBlockDefaults(
  value: unknown
): BroadcastBlockDefaults {
  if (!value || typeof value !== "object") return {}

  const source = value as Record<string, unknown>
  // Filled through a loose record and typed once at the end. Writing straight
  // into the typed shape asks TypeScript to satisfy every kind's content at
  // once, because the loop variable is all four kinds; the schema below has
  // already tied each key to the right one.
  const defaults: Record<string, unknown> = {}
  for (const kind of BROADCAST_BLOCK_KINDS) {
    if (!(kind in source)) continue
    const parsed = broadcastBlockSchema.safeParse({
      id: "default",
      kind,
      content: source[kind],
    })
    if (parsed.success) defaults[kind] = parsed.data.content
  }

  return defaults as BroadcastBlockDefaults
}

export function createBroadcastBlock(
  kind: BroadcastBlockKind,
  defaults: BroadcastBlockDefaults = {}
): BroadcastBlock {
  const id = `${kind}-${crypto.randomUUID()}`
  // The saved default is validated on the way in and again here, so a block is
  // never built out of settings the schema would reject. Anything unsaved or
  // unusable falls through to the built-in setup.
  const saved = broadcastBlockSchema.safeParse({
    id,
    kind,
    content: defaults[kind],
  })
  if (saved.success) return saved.data

  switch (kind) {
    case "header":
      return { id, kind, content: headerContentSchema.parse({}) }
    case "richText":
      return { id, kind, content: richTextContentSchema.parse({}) }
    case "button":
      return { id, kind, content: buttonContentSchema.parse({}) }
    case "divider":
      return { id, kind, content: dividerContentSchema.parse({}) }
    case "footer":
      return { id, kind, content: footerContentSchema.parse({}) }
  }
}

/** Blocks a fresh broadcast starts with when no default template exists. */
export function createStarterBlocks(): BroadcastBlock[] {
  return [
    createBroadcastBlock("header"),
    createBroadcastBlock("richText"),
    createBroadcastBlock("footer"),
  ]
}

/** Parses stored blocks, dropping anything that no longer validates. */
export function parseStoredBlocks(value: unknown): BroadcastBlock[] {
  if (!Array.isArray(value)) return []
  const blocks: BroadcastBlock[] = []
  for (const entry of value) {
    const parsed = broadcastBlockSchema.safeParse(entry)
    if (parsed.success) blocks.push(parsed.data)
  }
  return blocks
}

export const broadcastAudienceFilterSchema = z.union([
  z.object({ kind: z.literal("all") }),
  z.object({
    kind: z.literal("tags"),
    tags: z.array(z.string().trim().min(1).max(100)).min(1).max(25),
  }),
])

export type BroadcastAudienceFilter = z.infer<
  typeof broadcastAudienceFilterSchema
>

export function parseAudienceFilter(value: unknown): BroadcastAudienceFilter {
  const parsed = broadcastAudienceFilterSchema.safeParse(value)
  return parsed.success ? parsed.data : { kind: "all" }
}

export function describeAudienceFilter(filter: BroadcastAudienceFilter) {
  return filter.kind === "all"
    ? "All subscribed contacts"
    : `Tagged: ${filter.tags.join(", ")}`
}
