import { z } from "zod"

/**
 * What the right-click order window was set to last time it placed something.
 *
 * Only the parts of the window that describe how you size a trade — how much,
 * in what, at what leverage, and where you get out. What it does not carry is
 * "only reduce what I hold": that one is about the position in front of you at
 * the time, and a remembered yes would quietly shrink the next order somewhere
 * else.
 */
export const quickOrderPrefsSchema = z.object({
  /**
   * How the size was being said: in dollars, as a share of the free cash, or
   * as the share of the whole wallet the trade may lose.
   */
  sizeUnit: z.enum(["usd", "pct", "risk"]),
  /** The number typed beside it, kept as typed so it comes back the same. */
  size: z.string().max(24),
  leverage: z.number().int().min(1).max(100),
  /** The old combined switch. True still means both lines are on. */
  bracketOn: z.boolean(),
  /** Independent switches added after the combined bracket control. */
  stopOn: z.boolean().default(false),
  targetOn: z.boolean().default(false),
  /** Whether the stop box holds a distance or the exact losing price. */
  stopUnit: z.enum(["pct", "price"]).default("pct"),
  /** The exact stop price, kept separately from the old percent value. */
  stopPrice: z.string().max(24).default(""),
  stopPct: z.string().max(12),
  targetPct: z.string().max(12),
})

export type QuickOrderPrefs = z.infer<typeof quickOrderPrefsSchema>

/** A first visit: nothing typed, no borrowed money, no stop or target. */
export const DEFAULT_QUICK_ORDER: QuickOrderPrefs = {
  sizeUnit: "usd",
  size: "",
  leverage: 1,
  bracketOn: false,
  stopOn: false,
  targetOn: false,
  stopUnit: "pct",
  stopPrice: "",
  stopPct: "2",
  targetPct: "5",
}

/** Stored settings, with the plain defaults for a first or unreadable value. */
export function readQuickOrderPrefs(value: unknown): QuickOrderPrefs {
  const parsed = quickOrderPrefsSchema.safeParse(value)
  return parsed.success ? parsed.data : DEFAULT_QUICK_ORDER
}
