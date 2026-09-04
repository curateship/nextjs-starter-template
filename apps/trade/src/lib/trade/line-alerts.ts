import { z } from "zod"

/**
 * A drawn line's alert as the Alerts panel lists it, beside the price alerts.
 *
 * Browser-safe on purpose: the server builds these and the panel reads them,
 * so the shape lives where both can see it. The price is where the line is
 * at the moment of the read for an armed one, and where it was when it fired
 * for a fired one. Null means a line straight up and down, with no one price.
 */
export const lineAlertSchema = z.object({
  id: z.string().min(1).max(36),
  marketKey: z.string().min(1).max(180),
  kind: z.enum(["level", "trendline"]),
  price: z.number().finite().nullable(),
  direction: z.enum(["above", "below"]),
  armedAt: z.number().int().nonnegative(),
  firedAt: z.number().int().nonnegative().nullable(),
  /** The name typed in the line's window, shown in place of the kind word. */
  name: z.string().nullable().optional(),
})

export type LineAlert = z.infer<typeof lineAlertSchema>

export const lineAlertListSchema = z.object({
  armed: z.array(lineAlertSchema),
  fired: z.array(lineAlertSchema),
  /**
   * The master switch in Settings is off: every line keeps its armed state
   * but none rings until it goes back on.
   */
  paused: z.boolean(),
})

export type LineAlertList = z.infer<typeof lineAlertListSchema>

/** How many fired line alerts the panel keeps, the same as price alerts. */
export const MAX_RECENT_FIRED_LINE_ALERTS = 100
