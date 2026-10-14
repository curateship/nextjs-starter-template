import type { PhoneConnection } from "@/lib/phones/options"

/**
 * How a phone reaches the internet, in a few words: its SIM's carrier and
 * number, or the house Wi-Fi and the proxy it goes out through.
 */
export function connectionWords(phone: {
  connection: PhoneConnection
  simCarrier: string
  simNumber: string
  proxy: { label: string; host: string } | null
}): string {
  if (phone.connection === "wifi") {
    return phone.proxy ? `Wi-Fi through ${phone.proxy.label || phone.proxy.host}` : "Wi-Fi, the house's own address"
  }
  const sim = [phone.simCarrier, phone.simNumber].filter(Boolean).join(" ")
  return sim || "SIM, carrier not typed"
}

/** A finished check's answer in one line, from what the rack sent back. */
export function resultWords(action: string, result: Record<string, unknown>): string {
  if (action === "phone/android-version") {
    const screen = String(result.fromScreen ?? "")
    const system = String(result.fromSystem ?? "")
    return result.match
      ? `Settings says Android ${screen}, the same as Android itself reports.`
      : `Settings says Android ${screen}, but Android itself reports ${system}.`
  }
  if (action === "phone/health") {
    const parts = [
      typeof result.batteryPercent === "number"
        ? `Battery ${result.batteryPercent}%${result.charging ? ", charging" : ""}`
        : "",
      typeof result.temperatureC === "number" ? `${result.temperatureC}°C` : "",
      typeof result.freeStorageMb === "number" ? `${(result.freeStorageMb / 1024).toFixed(1)} GB free` : "",
      typeof result.upHours === "number" ? `on for ${result.upHours} hours` : "",
      result.screen ? `screen ${String(result.screen).toLowerCase()}` : "",
    ]
    return parts.filter(Boolean).join(", ") || "The phone answered with nothing to show."
  }
  if (action === "phone/list" && Array.isArray(result.phones)) {
    return `The rack sees ${result.phones.length} ${result.phones.length === 1 ? "phone" : "phones"}.`
  }
  return "Done."
}
