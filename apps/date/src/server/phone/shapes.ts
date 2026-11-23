import { z } from "zod"

import { NEXT_MAX_WAIT_SECONDS } from "./link"

/**
 * The shapes of what the phone sends to each signed address. Kept here rather
 * than in the route files, which export only their route.
 */

export const checkInShape = z.object({
  appVersion: z.string().max(40).default(""),
  model: z.string().max(120).default(""),
  android: z.string().max(40).default(""),
  timezone: z.string().max(64).default(""),
  batteryPercent: z.number().int().min(0).max(100).nullable().default(null),
  tinderVersion: z.string().max(60).default(""),
  tinderInFront: z.boolean().default(false),
  facebookVersion: z.string().max(60).default(""),
  facebookInFront: z.boolean().default(false),
  phoneSwitchOn: z.boolean().default(true),
})

export const nextShape = z.object({
  /** How long to hold the ask open when nothing is waiting, up to twenty seconds. */
  waitSeconds: z.number().int().min(0).max(NEXT_MAX_WAIT_SECONDS).default(0),
  /** Whether the phone is already sending screen pictures, so the answer comes back early when that should change. */
  watching: z.boolean().default(false),
})

export const resultShape = z.object({
  id: z.string().min(1).max(36),
  ok: z.boolean(),
  answer: z.record(z.string(), z.unknown()).nullable().default(null),
  error: z.string().max(4_000).default(""),
  /** The screen as a JPEG in base64, when the action read the screen or took a picture. */
  screenshot: z.string().max(7_500_000).regex(/^[A-Za-z0-9+/=]*$/).nullable().default(null),
})

export const screenShape = z.object({
  frame: z
    .object({
      jpeg: z.string().max(2_000_000).regex(/^[A-Za-z0-9+/=]*$/),
      width: z.number().int().min(1).max(10_000),
      height: z.number().int().min(1).max(10_000),
      screenWidth: z.number().int().min(1).max(10_000),
      screenHeight: z.number().int().min(1).max(10_000),
    })
    .nullable()
    .default(null),
})
