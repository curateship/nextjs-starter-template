import { and, asc, eq, sql } from "drizzle-orm"

import { readEmailAddress } from "@/lib/crm/crm"
import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { getEmailSettings, saveInboundAddress } from "@/server/email/settings"
import { customShellCrmInboundAddresses } from "@/server/schema"

/**
 * The addresses one site's mail arrives at, such as sales@ and support@ (CRM
 * task 18, built in task 36 on 7 Nov 2026). The CRM's left page lists them in
 * its Emails block, and the + in that panel's header adds one.
 *
 * **`email_settings.inbound_address` stays the first address.** It was the
 * only one before the list, Settings → Email still edits it, and the reply
 * sender falls back to it. So adding the first address writes it there too,
 * and removing it moves the next one in. Migration 0098 copied every saved
 * address into the list.
 */

/** The id the Settings → Email address carries while it has no row of its own. */
const SETTINGS_ID = "settings:"

export type InboundAddress = {
  id: string
  address: string
  /** A short name such as "Sales", or "". */
  label: string
}

/** The longest an address and a label may be, the columns' own sizes. */
export const INBOUND_ADDRESS_MAX = 255
export const INBOUND_LABEL_MAX = 80

/**
 * Every address mail arrives at, oldest first. An address saved in Settings
 * → Email that is not on the list yet (saved after 0098 ran) comes first, so
 * the list never hides the one the CRM is already using.
 */
export async function listInboundAddresses(
  workspaceId: string,
  database: CustomShellDb = db
): Promise<InboundAddress[]> {
  const [rows, settings] = await Promise.all([
    database
      .select({
        id: customShellCrmInboundAddresses.id,
        address: customShellCrmInboundAddresses.address,
        label: customShellCrmInboundAddresses.label,
      })
      .from(customShellCrmInboundAddresses)
      .where(eq(customShellCrmInboundAddresses.workspaceId, workspaceId))
      .orderBy(asc(customShellCrmInboundAddresses.createdAt)),
    getEmailSettings(workspaceId, database),
  ])
  const saved = settings?.inboundAddress?.trim().toLowerCase()
  if (saved && !rows.some((row) => row.address.toLowerCase() === saved)) {
    return [{ id: `${SETTINGS_ID}${saved}`, address: saved, label: "" }, ...rows]
  }
  return rows
}

/** What a row calls the address: its label, or the address itself. */
export function inboundAddressName(address: InboundAddress) {
  return address.label.trim() || address.address
}

export type AddInboundAddressResult =
  | { added: true; address: InboundAddress }
  | { added: false; reason: "invalid" | "taken" }

/**
 * Adds an address mail arrives at. The same address twice, capitals aside,
 * is refused as taken rather than written again. The first address a site
 * adds also becomes the Settings → Email one.
 */
export async function addInboundAddress(
  workspaceId: string,
  input: { address: string; label?: string },
  database: CustomShellDb = db
): Promise<AddInboundAddressResult> {
  const address = readEmailAddress(input.address)
  if (!address) return { added: false, reason: "invalid" }
  const label = (input.label ?? "").trim().slice(0, INBOUND_LABEL_MAX)

  const existing = await listInboundAddresses(workspaceId, database)
  if (existing.some((row) => row.address.toLowerCase() === address)) {
    return { added: false, reason: "taken" }
  }

  // The Settings → Email address, shown on the list without a row yet, gets
  // its row first, so it stays the oldest and so the first address.
  const settingsOnly = existing.find((row) => row.id.startsWith(SETTINGS_ID))
  if (settingsOnly) {
    await database
      .insert(customShellCrmInboundAddresses)
      .values({
        id: uuid(),
        workspaceId,
        address: settingsOnly.address,
        label: "",
        createdAt: new Date(now().getTime() - 1),
      })
      .onConflictDoNothing()
  }

  const id = uuid()
  const inserted = await database
    .insert(customShellCrmInboundAddresses)
    .values({ id, workspaceId, address, label, createdAt: now() })
    .onConflictDoNothing()
    .returning({ id: customShellCrmInboundAddresses.id })
  if (inserted.length === 0) return { added: false, reason: "taken" }

  if (existing.length === 0) {
    await saveInboundAddress(workspaceId, address, database)
  }
  return { added: true, address: { id, address, label } }
}

/** Renames an address. Answers whether it was this site's. */
export async function renameInboundAddress(
  workspaceId: string,
  id: string,
  label: string,
  database: CustomShellDb = db
): Promise<boolean> {
  // The Settings → Email address with no row yet gets its row, named.
  if (id.startsWith(SETTINGS_ID)) {
    const listed = await listInboundAddresses(workspaceId, database)
    const row = listed.find((entry) => entry.id === id)
    if (!row) return false
    await database
      .insert(customShellCrmInboundAddresses)
      .values({
        id: uuid(),
        workspaceId,
        address: row.address,
        label: label.trim().slice(0, INBOUND_LABEL_MAX),
        createdAt: new Date(0),
      })
      .onConflictDoNothing()
    return true
  }
  const changed = await database
    .update(customShellCrmInboundAddresses)
    .set({ label: label.trim().slice(0, INBOUND_LABEL_MAX) })
    .where(
      and(
        eq(customShellCrmInboundAddresses.workspaceId, workspaceId),
        eq(customShellCrmInboundAddresses.id, id)
      )
    )
    .returning({ id: customShellCrmInboundAddresses.id })
  return changed.length > 0
}

/**
 * Takes an address off the list. Its mail stays where it was: nothing in the
 * inbox is deleted. When it was the Settings → Email address, the next one on
 * the list takes its place, or none when it was the last.
 */
export async function removeInboundAddress(
  workspaceId: string,
  id: string,
  database: CustomShellDb = db
): Promise<boolean> {
  // The Settings → Email address with no row yet: removing it clears that box.
  if (id.startsWith(SETTINGS_ID)) {
    const listed = await listInboundAddresses(workspaceId, database)
    if (!listed.some((entry) => entry.id === id)) return false
    const next = listed.find((entry) => entry.id !== id)
    await saveInboundAddress(workspaceId, next?.address ?? "", database)
    return true
  }
  const removed = await database
    .delete(customShellCrmInboundAddresses)
    .where(
      and(
        eq(customShellCrmInboundAddresses.workspaceId, workspaceId),
        eq(customShellCrmInboundAddresses.id, id)
      )
    )
    .returning({ address: customShellCrmInboundAddresses.address })
  const [gone] = removed
  if (!gone) return false

  const settings = await getEmailSettings(workspaceId, database)
  if (settings?.inboundAddress?.toLowerCase() === gone.address.toLowerCase()) {
    // The rows left, not `listInboundAddresses`: that still shows the Settings
    // → Email address until this line changes it, so it would hand back the
    // address just removed.
    const [next] = await database
      .select({ address: customShellCrmInboundAddresses.address })
      .from(customShellCrmInboundAddresses)
      .where(eq(customShellCrmInboundAddresses.workspaceId, workspaceId))
      .orderBy(asc(customShellCrmInboundAddresses.createdAt))
      .limit(1)
    await saveInboundAddress(workspaceId, next?.address ?? "", database)
  }
  return true
}

/**
 * Whether `address` is on this site's list, capitals aside. The reply sender
 * asks before sending from a conversation's own address, so a conversation
 * whose address was taken off the list replies from the first one instead.
 */
export async function isInboundAddress(
  workspaceId: string,
  address: string,
  database: CustomShellDb = db
): Promise<boolean> {
  const wanted = address.trim().toLowerCase()
  if (!wanted) return false
  const [row] = await database
    .select({ id: customShellCrmInboundAddresses.id })
    .from(customShellCrmInboundAddresses)
    .where(
      and(
        eq(customShellCrmInboundAddresses.workspaceId, workspaceId),
        sql`lower(${customShellCrmInboundAddresses.address}) = ${wanted}`
      )
    )
    .limit(1)
  return Boolean(row)
}
