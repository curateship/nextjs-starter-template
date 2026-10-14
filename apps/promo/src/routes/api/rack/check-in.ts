import { createFileRoute } from "@tanstack/react-router"
import { z } from "zod"

import { checkIn } from "@/server/phones/rack"
import { answerSigned } from "@/server/phones/rack-http"

const checkInShape = z.object({
  version: z.string().max(40),
  platform: z.string().max(80).default(""),
  phones: z
    .array(
      z.object({
        serial: z.string().max(120),
        state: z.string().max(40),
        usb: z.string().max(120).default(""),
        model: z.string().max(120).default(""),
        android: z.string().max(40).default(""),
        timezone: z.string().max(64).default(""),
        vitals: z
          .object({
            batteryPercent: z.number().int().min(0).max(100).nullable().default(null),
            temperatureC: z.number().min(-40).max(150).nullable().default(null),
            storageUsedPercent: z.number().int().min(0).max(100).nullable().default(null),
            signal: z.string().max(20).default(""),
            upSeconds: z.number().int().min(0).nullable().default(null),
            apps: z.record(z.string().max(20), z.string().max(60)).nullable().default(null),
            restartWhy: z.string().max(300).default(""),
          })
          .nullable()
          .default(null),
      })
    )
    .max(200),
  rolledBack: z
    .object({ from: z.string().max(40), to: z.string().max(40), at: z.string().max(40), why: z.string().max(200) })
    .nullable()
    .default(null),
})

/**
 * Every 15 seconds: the phones adb sees, and the program's version, and
 * about once a minute each phone's battery, heat, storage and signal. The
 * answer says which version Promo serves, so the rack updates itself.
 */
export const Route = createFileRoute("/api/rack/check-in")({
  server: {
    handlers: {
      POST: ({ request }) => answerSigned(request, checkInShape, (rack, data) => checkIn(rack, data)),
    },
  },
})
