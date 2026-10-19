import { APP_WORDS, TRACKED_APPS, actionWords, type PhoneConnection, type TrackedApp } from "@/lib/phones/options"

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
    const name = result.kind === "iphone" ? "iOS" : "Android"
    return result.match
      ? `Settings says ${name} ${screen}, the same as the phone itself reports.`
      : `Settings says ${name} ${screen}, but the phone itself reports ${system}.`
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
  if (action === "phone/self-test" && Array.isArray(result.actions)) {
    const lines = result.actions as Array<{ action?: unknown; passed?: unknown; step?: unknown }>
    const broken = lines.filter((line) => line.passed !== true)
    if (!lines.length) return "The rack had no actions to walk."
    if (!broken.length) return `All ${lines.length} ${lines.length === 1 ? "action" : "actions"} walked to their last button. Nothing was pressed there.`
    return broken
      .map((line) => `${actionWords(String(line.action ?? ""))} stopped at "${String(line.step ?? "") || "its first step"}"`)
      .join(". ")
      .concat(".")
  }
  if (action === "phone/check-updates" && result.apps && typeof result.apps === "object") {
    const apps = result.apps as Record<string, { version?: unknown; update?: unknown }>
    const parts = TRACKED_APPS.filter((app) => apps[app]).map(
      (app) => `${APP_WORDS[app]} ${String(apps[app]?.version ?? "")}${apps[app]?.update === true ? ", update out" : ", up to date"}`
    )
    return parts.length ? parts.join(". ").concat(".") : "None of the apps Promo watches is on this phone."
  }
  if (action === "phone/update-app") {
    const app = APP_WORDS[String(result.app ?? "") as keyof typeof APP_WORDS] ?? String(result.app ?? "The app")
    return `${app} went from ${String(result.from ?? "")} to ${String(result.to ?? "")}.`
  }
  if (action === "phone/setup-check") return "Read the phone's setup and the address apps see. Each line is on the Setup tab."
  if (action === "phone/outside-address") {
    const seen = (result.phone ?? {}) as { ip?: unknown }
    const home = (result.home ?? {}) as { ip?: unknown }
    return seen.ip
      ? `Apps see ${String(seen.ip)}${home.ip ? `; the house's own address is ${String(home.ip)}` : ""}.`
      : "The address apps see could not be read."
  }
  if (action === "phone/wipe") {
    return result.wiped === true ? "Erased. The phone restarts into its setup screens." : "Found the erase button and pressed nothing."
  }
  if (action === "phone/icloud-state") {
    return result.signedOut === true
      ? "No Apple ID is signed in, so it can be wiped."
      : `Signed in to an Apple ID${result.appleId ? ` as ${String(result.appleId)}` : ""}. Sign out on its screen before wiping.`
  }
  if (action === "reddit/state" || action === "reddit/quick_state") {
    if (result.checked === false) return "The Reddit app could not be read."
    return result.handle ? `Reddit is signed in as u/${String(result.handle)}.` : "Reddit is signed in to nobody."
  }
  if (action === "reddit/health") {
    if (!result.handle) return "Reddit is signed in to nobody, so there was nothing to read."
    return `u/${String(result.handle)}${typeof result.karma === "number" ? `, ${result.karma} karma` : ""}.`
  }
  if (action === "reddit/comment") return "Posted. The reader browser finds its link in the thread."
  if (action === "phone/list" && Array.isArray(result.phones)) {
    return `The rack sees ${result.phones.length} ${result.phones.length === 1 ? "phone" : "phones"}.`
  }
  return "Done."
}

/** The SIM's service in words: Android's own word, or "not_reported" from an iPhone, which gives none. */
export function signalWords(signal: string): string {
  switch (signal) {
    case "not_reported":
      return "Not reported"
    case "in_service":
      return "Has a signal"
    case "out_of_service":
      return "No signal"
    case "emergency_only":
      return "Emergency calls only"
    case "power_off":
      return "Radio off"
    default:
      return "Not read"
  }
}

/** "Reddit 2025.40.0 · TikTok 37.1.4", or why there is nothing to say. */
export function appVersionWords(phone: { apps: Partial<Record<TrackedApp, string>>; vitals: { at: Date | null } }): string {
  const versions = TRACKED_APPS.filter((app) => phone.apps[app]).map((app) => `${APP_WORDS[app]} ${phone.apps[app]}`)
  if (versions.length) return versions.join(" · ")
  return phone.vitals.at ? "None of Reddit, Instagram or TikTok is on it" : "Apps not read yet"
}
