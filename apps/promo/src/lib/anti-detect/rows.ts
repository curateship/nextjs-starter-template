import type { ProxyTest } from "@/lib/anti-detect/search"
import type { BanRow } from "@/lib/api/bans"
import type { ProfileRow } from "@/lib/api/browser/profiles"
import type { ProxyView } from "@/lib/api/browser/proxies"
import type { PhoneRecord, PhonesPage, RackView } from "@/lib/api/phones/phones"
import { appName } from "@/lib/bans/options"
import { formatTimeAgo } from "@/lib/format/format-time"
import { setupWarning } from "@/lib/phones/wording"
import { handleWords } from "@/lib/social/networks"

/**
 * How the Anti Detect dashboard's rows say what they are, shared by each
 * section, its record on the right and Overview's widgets (Tyler, 12 Nov
 * 2026).
 */

/** The browser's state in words, as the Browser column says it. */
export function browserWords(profile: ProfileRow): string {
  if (profile.closing) return "Stopping"
  if (profile.browser === "opening") return "Opening"
  if (profile.browser === "open") return profile.onOldProxy ? "Open, on its old proxy" : "Open"
  return "Stopped"
}

/** How a proxy's last test went. */
export function proxyTestOf(proxy: ProxyView): ProxyTest {
  if (!proxy.lastTestResult) return "untested"
  return proxy.lastTestResult.ok ? "working" : "failed"
}

/** A rack's phones as the row counts them (Racks dashboard, parts 75 and 80). */
type RackCounts = { total: number; online: number; warnings: number }

/** A phone needing a look: offline, needing a wipe, or with the amber setup line. */
function needsALook(phone: PhoneRecord): boolean {
  return phone.status === "offline" || Boolean(setupWarning(phone))
}

/** Each rack's phones online, out of how many, and how many need a look. */
export function rackCounts(page: Pick<PhonesPage, "racks" | "phones">): Map<string, RackCounts> {
  const byRack = new Map<string, PhoneRecord[]>()
  for (const phone of page.phones) {
    if (phone.rackId) byRack.set(phone.rackId, [...(byRack.get(phone.rackId) ?? []), phone])
  }
  return new Map(
    page.racks.map((rack) => {
      const phones = byRack.get(rack.id) ?? []
      return [
        rack.id,
        {
          total: phones.length,
          online: phones.filter((phone) => phone.status !== "offline").length,
          warnings: phones.filter(needsALook).length,
        },
      ]
    })
  )
}

/** "Checking in", "Not checking in, last seen 5 minutes ago", or what to do next. */
export function rackStateWords(rack: RackView): string {
  if (rack.state === "unpaired") return "Waiting for the rack program"
  if (rack.state === "disconnected") return "Disconnected"
  if (rack.state === "live") return "Checking in"
  return rack.seenAt ? `Not checking in, last seen ${formatTimeAgo(rack.seenAt)}` : "Not checked in yet"
}

/** Who was banned: the handle as its network writes it, or which app's account when none was read. */
export const banWho = (row: BanRow) =>
  handleWords(row.app, row.account?.handle || row.handle) || `${appName(row.app)} account, not signed in`
