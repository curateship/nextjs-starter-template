import { loadSavedViews, type SavedView } from "@/lib/api/saved-views"
import { loadLibrary } from "@/lib/api/viral/viral-library"
import { loadViralProjects } from "@/lib/api/viral/viral-projects"
import { loadVault, type VaultItem } from "@/lib/api/viral/viral-vault"
import { savedViewScreen } from "@/lib/saved-views"
import type { ViralSection } from "@/lib/viral/dashboard-search"
import { LIBRARY_SAVED_VIEW_KIND } from "@/lib/viral/library"
import { VAULT_SAVED_VIEW_KIND } from "@/lib/viral/vault-saved-views"

type Library = Awaited<ReturnType<typeof loadLibrary>>

/** A project as the Vault, Hooks and Formats rows know it: for names, counts and Write for. */
export type SectionProject = { id: string; name: string; sample: boolean }

/**
 * What the Projects dashboard reads for the Research list showing
 * (`workspace/docs/content-app.md`, "The Projects dashboard"). Each reads only
 * its own records.
 */
export type ViralLoaded =
  | { section: "vault"; items: VaultItem[]; tags: string[]; projects: SectionProject[]; views: SavedView[] }
  | { section: "hooks"; library: Library; projects: SectionProject[]; views: SavedView[] }
  | { section: "formats"; library: Library; projects: SectionProject[] }

async function sectionProjects(): Promise<SectionProject[]> {
  const list = await loadViralProjects({ archived: false })
  return list.projects.map((project) => ({ id: project.id, name: project.name, sample: project.sample }))
}

export async function loadViralSection({ section }: { section: ViralSection }): Promise<ViralLoaded> {
  if (section === "vault") {
    const [vault, projects, views] = await Promise.all([
      loadVault(),
      sectionProjects(),
      loadSavedViews(savedViewScreen(VAULT_SAVED_VIEW_KIND, "")),
    ])
    return { section, items: vault.items, tags: vault.tags, projects, views }
  }
  if (section === "hooks") {
    const [library, projects, views] = await Promise.all([
      loadLibrary(),
      sectionProjects(),
      loadSavedViews(savedViewScreen(LIBRARY_SAVED_VIEW_KIND, "")),
    ])
    return { section, library, projects, views }
  }
  const [library, projects] = await Promise.all([loadLibrary(), sectionProjects()])
  return { section, library, projects }
}
