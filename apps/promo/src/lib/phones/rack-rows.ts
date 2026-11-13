import type { PhoneRecord, PhonesPage } from "@/lib/api/phones/phones"
import { PHONE_KIND_WORDS, PHONE_KINDS, PHONE_STATUS_WORDS } from "@/lib/phones/options"
import { NO_GROUP, PHONE_STATUS_FILTERS, type RackSearch } from "@/lib/phones/rack-search"

/** What the SIM itself says beats what was typed. */
export const carrierOf = (phone: PhoneRecord) => phone.setupCheck?.figures.simCarrier || phone.simCarrier

/** Slot 2 before slot 10, then the phones with no slot, each by name (part 98). */
function bySlot(a: PhoneRecord, b: PhoneRecord): number {
  const slot = (phone: PhoneRecord) => (/^\d+$/.test(phone.shelfSlot.trim()) ? Number(phone.shelfSlot.trim()) : Number.POSITIVE_INFINITY)
  const order = slot(a) - slot(b)
  if (order) return order
  const typed = a.shelfSlot.trim().localeCompare(b.shelfSlot.trim(), undefined, { numeric: true })
  return typed || a.name.localeCompare(b.name)
}

/** The phones this rack's list shows, in order, under their group headings when the list is grouped. */
export function rackRows(page: Pick<PhonesPage, "phones" | "projects">, search: RackSearch): Array<{ group: string; phones: PhoneRecord[] }> {
  const query = (search.q ?? "").trim().toLowerCase()
  const projectPhoneIds = new Set(page.projects.find((project) => project.id === search.project)?.phoneIds ?? [])
  const shown = page.phones
    .filter((phone) => {
      if (search.folder === NO_GROUP ? phone.folderId : search.folder && phone.folderId !== search.folder) return false
      if (search.label === NO_GROUP ? phone.labelId : search.label && phone.labelId !== search.label) return false
      if (search.tag && !phone.tags.includes(search.tag)) return false
      if (search.status && phone.status !== search.status) return false
      if (search.kind && phone.kind !== search.kind) return false
      if (search.carrier && carrierOf(phone) !== search.carrier) return false
      if (search.project && !projectPhoneIds.has(phone.id)) return false
      if (search.wipe && !phone.needsWipeAt) return false
      if (search.banned && !phone.bannedOn[search.banned]) return false
      if (!query) return true
      return [phone.name, phone.model, phone.serial, phone.simCarrier, phone.simNumber, phone.notes, phone.shelfSlot]
        .concat(phone.tags, phone.accounts.map((account) => account.handle))
        .some((text) => text.toLowerCase().includes(query))
    })
    .sort(bySlot)
  if (search.group === "status") {
    return PHONE_STATUS_FILTERS.map((status) => ({ group: PHONE_STATUS_WORDS[status], phones: shown.filter((phone) => phone.status === status) })).filter(
      (group) => group.phones.length
    )
  }
  if (search.group === "kind") {
    return PHONE_KINDS.map((kind) => ({ group: PHONE_KIND_WORDS[kind], phones: shown.filter((phone) => phone.kind === kind) })).filter(
      (group) => group.phones.length
    )
  }
  return [{ group: "", phones: shown }]
}
