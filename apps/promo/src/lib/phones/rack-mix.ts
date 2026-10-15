import { MIX_MIN_PHONES, MIX_WARN_SHARE, type PhoneConnection } from "./options"

/**
 * The rack mix (part 27 of the phone farm): how many phones share each model,
 * carrier and Android version, and a warning when too many share one, so
 * Tyler knows what to buy next to keep the rack looking like different people.
 *
 * The rule is Tyler's (14 Oct 2026): more than half the phones sharing one,
 * once the rack has four phones or more. A value nobody has read yet, such as
 * a model left blank, is listed but never warned about.
 */

export type MixPhone = {
  model: string
  androidVersion: string
  connection: PhoneConnection
  /** The SIM's carrier, read by the setup check or typed by hand. */
  carrier: string
  /** The proxy a Wi-Fi phone goes out through, by name, or empty. */
  proxyName: string
}

export type MixKind = "model" | "carrier" | "android"

export const MIX_KIND_WORDS: Record<MixKind, string> = {
  model: "Models",
  carrier: "Carriers",
  android: "Android versions",
}

export type MixCount = { value: string; count: number; known: boolean }

export type MixWarning = { kind: MixKind; value: string; count: number; total: number; text: string }

export type RackMix = {
  total: number
  counts: Record<MixKind, MixCount[]>
  warnings: MixWarning[]
}

function valueOf(phone: MixPhone, kind: MixKind): { value: string; known: boolean } {
  if (kind === "model") return phone.model.trim() ? { value: phone.model.trim(), known: true } : { value: "Model not read", known: false }
  if (kind === "android") {
    return phone.androidVersion.trim()
      ? { value: `Android ${phone.androidVersion.trim()}`, known: true }
      : { value: "Version not read", known: false }
  }
  if (phone.connection === "wifi") {
    return phone.proxyName ? { value: `Wi-Fi through ${phone.proxyName}`, known: true } : { value: "House Wi-Fi", known: true }
  }
  return phone.carrier.trim() ? { value: phone.carrier.trim(), known: true } : { value: "Carrier not known", known: false }
}

export function rackMix(phones: MixPhone[]): RackMix {
  const total = phones.length
  const counts = {} as Record<MixKind, MixCount[]>
  const warnings: MixWarning[] = []
  for (const kind of ["model", "carrier", "android"] as const) {
    const byValue = new Map<string, MixCount>()
    for (const phone of phones) {
      const { value, known } = valueOf(phone, kind)
      // Carriers are compared without case: "T-Mobile" and "t-mobile" are one.
      const key = kind === "carrier" ? value.toLowerCase() : value
      const entry = byValue.get(key) ?? { value, count: 0, known }
      entry.count += 1
      byValue.set(key, entry)
    }
    counts[kind] = [...byValue.values()].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
    if (total < MIX_MIN_PHONES) continue
    for (const entry of counts[kind]) {
      if (!entry.known || entry.count / total <= MIX_WARN_SHARE) continue
      warnings.push({
        kind,
        value: entry.value,
        count: entry.count,
        total,
        text: `${entry.count} of ${total} phones ${kind === "carrier" ? "go out over" : kind === "model" ? "are a" : "run"} ${entry.value}. Over half the rack sharing one ${kind === "android" ? "Android version" : kind} looks like a farm; the next phone should be different.`,
      })
    }
  }
  return { total, counts, warnings }
}
