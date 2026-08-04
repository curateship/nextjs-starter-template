import { z } from "zod"

export const BROADCAST_BLOCK_KINDS = [
  "header",
  "richText",
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
  richText: { name: "Rich Text", description: "Formatted text content" },
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
