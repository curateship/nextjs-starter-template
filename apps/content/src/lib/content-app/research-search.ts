import { isResearchSection, sectionOf, type ProjectsSearch, type ResearchSection } from "@/lib/social/projects-dashboard-search"
import type { ViralDashboardSearch } from "@/lib/viral/dashboard-search"
import { VAULT_STATUSES, type VaultStatus } from "@/lib/viral/vault"

/**
 * The Projects dashboard's address as Research's own section screens read it,
 * for its Vault, Hooks and Formats sections (`workspace/docs/content-app.md`,
 * "The Projects dashboard"). Null on any other section. The record open on
 * the right is left out of what is read, as Research's dashboard did, so
 * opening one never reads the list again; `withOpen` puts it back.
 */
export function researchSearchOf(search: ProjectsSearch): (ViralDashboardSearch & { section: ResearchSection }) | null {
  const section = sectionOf(search)
  if (!isResearchSection(section)) return null
  const status = (VAULT_STATUSES as readonly string[]).includes(search.status ?? "") ? (search.status as VaultStatus) : undefined
  return {
    section,
    ...(search.project ? { project: search.project } : {}),
    ...(search.q ? { q: search.q } : {}),
    ...(status ? { status } : {}),
    ...(search.tag ? { tag: search.tag } : {}),
    ...(search.type ? { type: search.type } : {}),
    ...(search.show === "board" ? { show: "board" as const } : {}),
  }
}

/** The same, with the open record, for the section screens themselves. */
export function withOpen(research: ViralDashboardSearch, search: ProjectsSearch): ViralDashboardSearch {
  return search.open ? { ...research, open: search.open } : research
}
