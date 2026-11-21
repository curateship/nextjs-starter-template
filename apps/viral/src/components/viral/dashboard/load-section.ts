import { loadSavedViews, type SavedView } from "@/lib/api/saved-views"
import { searchEveryProjectFn, type ViralSearchHit } from "@/lib/api/viral/viral-finding"
import { loadLibrary } from "@/lib/api/viral/viral-library"
import { loadViralProjects, type ViralFolderSummary } from "@/lib/api/viral/viral-projects"
import { loadVault, type VaultItem } from "@/lib/api/viral/viral-vault"
import { savedViewScreen } from "@/lib/saved-views"
import { viralSectionOf, type ViralDashboardSearch } from "@/lib/viral/dashboard-search"
import { LIBRARY_SAVED_VIEW_KIND } from "@/lib/viral/library"
import { ARCHIVED_PROJECTS, NO_FOLDER } from "@/lib/viral/project-folders"
import { VAULT_SAVED_VIEW_KIND } from "@/lib/viral/vault-saved-views"
import type { ViralProjectItem } from "@/lib/viral/viral"

type Library = Awaited<ReturnType<typeof loadLibrary>>

/** A project as the Vault, Hooks and Formats rows know it: for names, counts and Write for. */
export type SectionProject = { id: string; name: string; sample: boolean }

/**
 * What the route reads for the Viral dashboard's row showing (task
 * features/03). Each row reads only its own records. Projects reads the
 * list the old Projects page read, and with words in its search, the
 * videos of every project that match them, as the old Today page's search
 * did (Tyler, 19 Nov 2026: "Today's 'Search every project' moves into the
 * Projects row's search").
 */
export type ViralLoaded =
  | { section: "overview" }
  | { section: "projects"; projects: ViralProjectItem[]; folders: ViralFolderSummary[]; hits: ViralSearchHit[] }
  | { section: "vault"; items: VaultItem[]; tags: string[]; projects: SectionProject[]; views: SavedView[] }
  | { section: "hooks"; library: Library; projects: SectionProject[]; views: SavedView[] }
  | { section: "formats"; library: Library; projects: SectionProject[] }

async function sectionProjects(): Promise<SectionProject[]> {
  const list = await loadViralProjects({ archived: false })
  return list.projects.map((project) => ({ id: project.id, name: project.name, sample: project.sample }))
}

export async function loadViralSection(search: ViralDashboardSearch): Promise<ViralLoaded> {
  const section = viralSectionOf(search)
  if (section === "overview") return { section }
  if (section === "projects") {
    const archived = search.folder === ARCHIVED_PROJECTS
    const folderId = archived || !search.folder ? undefined : search.folder === NO_FOLDER ? null : search.folder
    const words = search.q?.trim() ?? ""
    const [list, hits] = await Promise.all([
      loadViralProjects({ search: words || undefined, folderId, archived }),
      words ? searchEveryProjectFn(words) : Promise.resolve([]),
    ])
    return { section, projects: list.projects, folders: list.folders, hits }
  }
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
