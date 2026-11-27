import { readOneOf, readSearchText } from "@/lib/nav/list-search"
import { cleanTag, VAULT_STATUSES, type VaultStatus } from "@/lib/viral/vault"

/**
 * What Research's three lists keep in the Projects dashboard's address
 * (`workspace/docs/content-app.md`, "The Projects dashboard"), so a reload,
 * Back or a pasted link opens the same list, filters and open record. They
 * were rows of Viral's own dashboard, whose Overview and Projects rows went
 * with it on 27 Nov 2026.
 */

export const VIRAL_SECTIONS = ["vault", "hooks", "formats"] as const
export type ViralSection = (typeof VIRAL_SECTIONS)[number]

export type ViralDashboardSearch = {
  section?: ViralSection
  /** The record open on the right: an idea, a hook or a format. */
  open?: string
  q?: string
  /** The project picked in the Projects block. */
  project?: string
  /** Vault: one status. */
  status?: VaultStatus
  /** Vault and Hooks: one tag. */
  tag?: string
  /** Hooks: one hook type. */
  type?: string
  /** Vault: Board in place of the list. */
  show?: "board"
}

const ID = /^[\w-]{1,36}$/

function readId(value: unknown) {
  return typeof value === "string" && ID.test(value) ? value : undefined
}

/** The address read safely: anything unknown is left out. */
export function readViralDashboardSearch(search: Record<string, unknown>): ViralDashboardSearch {
  const out: ViralDashboardSearch = {}
  const section = readOneOf(search.section, VIRAL_SECTIONS)
  if (section) out.section = section
  const open = readId(search.open)
  if (open) out.open = open
  const q = readSearchText(search.q)
  if (q) out.q = q
  const project = readId(search.project)
  if (project) out.project = project
  const status = readOneOf(search.status, VAULT_STATUSES)
  if (status) out.status = status
  const tag = typeof search.tag === "string" ? cleanTag(search.tag) : ""
  if (tag) out.tag = tag
  const type = readId(search.type)
  if (type) out.type = type
  if (search.show === "board") out.show = "board"
  return out
}
