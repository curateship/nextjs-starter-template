import { createFileRoute } from "@tanstack/react-router"

import { routeErrorComponent } from "@/components/shell/route-error"
import { VaultPage, type VaultPageSearch } from "@/components/viral/vault-page"
import { loadSavedViews } from "@/lib/api/saved-views"
import { getViralErrorMessage } from "@/lib/api/viral/viral"
import { loadViralProjects } from "@/lib/api/viral/viral-projects"
import { loadVault } from "@/lib/api/viral/viral-vault"
import { readOneOf, readSearchText } from "@/lib/nav/list-search"
import { savedViewScreen } from "@/lib/saved-views"
import { cleanTag, VAULT_STATUSES } from "@/lib/viral/vault"
import { VAULT_SAVED_VIEW_KIND } from "@/lib/viral/vault-saved-views"

/** An id's shape only; whether it is theirs is the loader's job. */
function readId(value: unknown) {
  return typeof value === "string" && /^[A-Za-z0-9-]{1,36}$/.test(value) ? value : undefined
}

/**
 * The Vault page: every project's saved ideas (`workspace/docs/vault.md`).
 * The picked project, the search, the status and tag filters and the open
 * idea all live in the address, so a reload or a pasted link opens the same
 * list and idea. Archived projects are left out of the left panel.
 */
export const Route = createFileRoute("/_authenticated/admin/vault")({
  validateSearch: (search: Record<string, unknown>): VaultPageSearch => {
    const tag = typeof search.tag === "string" ? cleanTag(search.tag) : ""
    return {
      project: readId(search.project),
      q: readSearchText(search.q),
      status: readOneOf(search.status, VAULT_STATUSES),
      tag: tag || undefined,
      open: readId(search.open),
    }
  },
  loader: async () => {
    const [vault, list, views] = await Promise.all([
      loadVault(),
      loadViralProjects({ archived: false }),
      loadSavedViews(savedViewScreen(VAULT_SAVED_VIEW_KIND, "")),
    ])
    return {
      items: vault.items,
      tags: vault.tags,
      projects: list.projects.map((project) => ({ id: project.id, name: project.name, vaultCount: project.vault_count })),
      views,
    }
  },
  component: VaultRoute,
  errorComponent: routeErrorComponent(getViralErrorMessage),
})

function VaultRoute() {
  const data = Route.useLoaderData()
  const search = Route.useSearch()
  return <VaultPage items={data.items} tags={data.tags} projects={data.projects} views={data.views} search={search} />
}
