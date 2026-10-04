import { WebhookIcon } from "lucide-react"
import { z } from "zod"

import { defineNode } from "../node-descriptor"

export const WEBHOOK_SECRET_HEADER = "X-Webhook-Secret"

/**
 * The stable body an outside service receives. The preview uses placeholders;
 * the executor replaces them with facts from the frozen run.
 */
export const WEBHOOK_PAYLOAD_PREVIEW = {
  event: "{{eventKind}}",
  timestamp: "{{timestamp}}",
  automation: {
    id: "{{automationId}}",
    runId: "{{runId}}",
  },
  subject: {
    id: "{{memberId}}",
    email: "{{memberEmail}}",
  },
  facts: {
    factName: "{{eventFactValue}}",
  },
} as const

/** An error suitable for both the inspector and compile-time validation. */
export function webhookUrlError(value: string): string | null {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return "Enter a complete webhook address."
  }

  if (url.protocol !== "https:") return "Webhook addresses must use https."
  if (url.username || url.password) {
    return "Put secrets in the secret header, not in the address."
  }
  if (url.hash) {
    return "Remove the # fragment because it is not sent with webhook requests."
  }
  if (isPrivateWebhookHostname(url.hostname)) {
    return "Webhook addresses cannot point to a private or internal address."
  }
  return null
}

/**
 * Blocks hosts that can be recognised without DNS, so a bad draft is refused
 * when it is saved. The executor repeats this and also checks every DNS answer.
 */
export function isPrivateWebhookHostname(value: string): boolean {
  const hostname = value
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "")
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname === "local" ||
    hostname.endsWith(".local") ||
    hostname === "internal" ||
    hostname.endsWith(".internal") ||
    hostname === "home.arpa" ||
    hostname.endsWith(".home.arpa")
  ) {
    return true
  }

  const ipv4 = parseIpv4(hostname)
  if (ipv4) return isPrivateIpv4(ipv4)
  if (!hostname.includes(":")) return false

  const words = parseIpv6(hostname)
  if (!words) return true
  const [first, second, third, fourth, fifth, sixth] = words
  if (
    first === 0 &&
    second === 0 &&
    third === 0 &&
    fourth === 0 &&
    fifth === 0 &&
    sixth === 0xffff
  ) {
    const [high, low] = words.slice(6)
    return isPrivateIpv4([high >> 8, high & 255, low >> 8, low & 255])
  }
  const ipv4Compatible = [first, second, third, fourth, fifth, sixth].every(
    (word) => word === 0
  )
  return (
    ipv4Compatible ||
    (first === 0x64 &&
      second === 0xff9b &&
      words.slice(2, 6).every((word) => word === 0)) ||
    (first === 0x64 && second === 0xff9b && third === 1) ||
    (first === 0x100 && second === 0 && third === 0 && fourth === 0) ||
    (first === 0x2001 && second === 0xdb8) ||
    (first & 0xfe00) === 0xfc00 ||
    (first & 0xffc0) === 0xfe80 ||
    (first & 0xffc0) === 0xfec0 ||
    (first & 0xff00) === 0xff00
  )
}

function parseIpv6(value: string): number[] | null {
  let normalized = value
  const dotted = /(^|:)(\d+\.\d+\.\d+\.\d+)$/.exec(normalized)
  if (dotted) {
    const ipv4 = parseIpv4(dotted[2])
    if (!ipv4) return null
    const replacement = `${((ipv4[0] << 8) | ipv4[1]).toString(16)}:${((ipv4[2] << 8) | ipv4[3]).toString(16)}`
    normalized = `${normalized.slice(0, dotted.index + dotted[1].length)}${replacement}`
  }

  const halves = normalized.split("::")
  if (halves.length > 2) return null
  const left = halves[0] ? halves[0].split(":") : []
  const right = halves[1] ? halves[1].split(":") : []
  const missing = 8 - left.length - right.length
  if ((halves.length === 1 && missing !== 0) || missing < 0) return null
  const parts = [...left, ...Array(missing).fill("0"), ...right]
  if (
    parts.length !== 8 ||
    parts.some((part) => !/^[0-9a-f]{1,4}$/.test(part))
  ) {
    return null
  }
  return parts.map((part) => Number.parseInt(part, 16))
}

function parseIpv4(value: string): [number, number, number, number] | null {
  const parts = value.split(".")
  if (parts.length !== 4) return null
  const octets = parts.map(Number)
  if (
    octets.some(
      (octet, index) =>
        !Number.isInteger(octet) ||
        octet < 0 ||
        octet > 255 ||
        String(octet) !== parts[index]
    )
  ) {
    return null
  }
  return octets as [number, number, number, number]
}

function isPrivateIpv4([a, b, c]: [number, number, number, number]): boolean {
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 192 && b === 88 && c === 99) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  )
}

export const webhookSettingsSchema = z.object({
  url: z
    .string()
    .trim()
    .min(1, "Enter a webhook address.")
    .max(2_000, "Keep the webhook address to 2,000 characters or fewer.")
    .superRefine((value, context) => {
      const error = webhookUrlError(value)
      if (error) context.addIssue({ code: "custom", message: error })
    }),
  secret: z
    .string()
    .max(500, "Keep the secret to 500 characters or fewer.")
    .refine((value) => !/[\r\n]/.test(value), {
      message: "The secret must stay on one line.",
    }),
})

export type WebhookSettings = z.infer<typeof webhookSettingsSchema>

export function readWebhookSettings(
  settings: Record<string, unknown>
): WebhookSettings {
  return webhookSettingsSchema.parse(settings)
}

export const webhookNode = defineNode({
  kind: "webhook",
  palette: {
    key: "action-webhook",
    group: "Actions",
    description: "POST this run's facts to an outside service",
  },
  createSettings: () => ({ url: "", secret: "" }),
  settingsSchema: webhookSettingsSchema,
  name: () => "Webhook",
  description: (settings) => {
    const url = typeof settings.url === "string" ? settings.url.trim() : ""
    return url
      ? `POSTs this run's facts to ${url}.`
      : "Calls an outside service."
  },
  icon: WebhookIcon,
  outputPorts: [{ id: "then", label: "Then" }],
  hasInput: true,
  connectionError: () => null,
  fields: () => import("@/components/automations/nodes/webhook-panel"),
})
