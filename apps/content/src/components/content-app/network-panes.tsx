import * as React from "react"

import type { CrmFrame } from "@/components/crm/crm-frame"
import { CrmListHeader } from "@/components/crm/crm-row"
import { AccountsSection } from "@/components/social/projects-dashboard/accounts-section"
import { VoicesSection } from "@/components/social/projects-dashboard/voices-section"
import { ProjectColumns } from "@/components/social/projects/project-columns"
import { ErrorRow } from "@/components/ui/error-row"
import { LoadingRow } from "@/components/ui/loading-row"
import { loadProjectRows } from "@/lib/api/social/projects"
import { getRedditAccountsErrorMessage, loadRedditAccounts } from "@/lib/api/social/reddit-accounts"
import { getVoiceErrorMessage, loadVoices } from "@/lib/api/social/voices"
import { useLoad } from "@/lib/hooks/use-load"
import type { Network } from "@/lib/social/networks"
import type { AccountsFilter } from "@/lib/social/projects-dashboard-search"

/**
 * Voices and Accounts as tabs on each network of a project's page
 * (`workspace/docs/content-app.md`, "Voices and Accounts on each network";
 * Tyler, 27 Nov 2026: "The voices goes into the middle tab for its own
 * network", and of accounts, "A tab on each netowrk but Just leave the
 * unified accounts dashboard the way it is now").
 *
 * - **The tabs** sit at the end of the network's own tab row, on each of its
 *   rows (`withPaneTabs`).
 * - **Picked,** the network's middle and right show the Voices section, or
 *   the Accounts section narrowed to this project and network, in the one
 *   header with the network's tabs (`NetworkPaneColumns`). Each network
 *   draws them in place of its own lists, so nothing of its lists runs
 *   behind them.
 * - **The address** holds `pane=voices|accounts`. A network's own tab, another
 *   row, or another network leaves it, with its open row and filters.
 *
 * A guest has neither: voices and accounts are the owner's.
 */

export const NETWORK_PANES = ["voices", "accounts"] as const
export type NetworkPane = (typeof NETWORK_PANES)[number]

const PANE_LABELS: Record<NetworkPane, string> = { voices: "Voices", accounts: "Accounts" }

/** A pane's value among the network's own tab values, which never start this way. */
const paneValue = (pane: NetworkPane) => `pane:${pane}`

export type NetworkPanes = {
  /** The pane showing, or null while the network's own list does. */
  pane: NetworkPane | null
  network: Network
  projectId: string
  /** What the pane's list keeps in the address. */
  search: AccountsFilter & { q?: string; open?: string }
  onPane: (pane: NetworkPane) => void
}

const NetworkPanesContext = React.createContext<NetworkPanes | null>(null)

export const NetworkPanesProvider = NetworkPanesContext.Provider

/** The panes of the network showing; null on a guest's page and outside a project's page. */
export function useNetworkPanes() {
  return React.useContext(NetworkPanesContext)
}

/**
 * A network's tab choices with Voices and Accounts after them, the value
 * showing, and a pick that opens a pane or goes to the network's own tab. For
 * `DashboardTabs` (`tabs`) and the narrow `ViewMenu` (`choices`) alike.
 */
export function withPaneTabs<Choice extends { value: string; label: string; count?: number }>(
  panes: NetworkPanes | null,
  value: string,
  onValueChange: (next: string) => void,
  choices: Choice[]
): { value: string; onValueChange: (next: string) => void; choices: Array<Choice | { value: string; label: string }> } {
  if (!panes) return { value, onValueChange, choices }
  return {
    value: panes.pane ? paneValue(panes.pane) : value,
    onValueChange: (next) => {
      const pane = NETWORK_PANES.find((each) => paneValue(each) === next)
      if (pane) panes.onPane(pane)
      else onValueChange(next)
    },
    choices: [...choices, ...NETWORK_PANES.map((pane) => ({ value: paneValue(pane), label: PANE_LABELS[pane] }))],
  }
}

/**
 * The network's middle and right while Voices or Accounts shows. `tabs` is
 * what the network's own header starts with (its reopen button, the arrow
 * back and its tab row), so the pane keeps the one header.
 */
export function NetworkPaneColumns({
  panes,
  tabs,
  left,
  dialogs,
}: {
  panes: NetworkPanes & { pane: NetworkPane }
  tabs: React.ReactNode
  left: React.ReactNode
  dialogs: React.ReactNode
}) {
  const frame: CrmFrame = (panels) => (
    <ProjectColumns
      left={left}
      middle={panels.middle}
      right={panels.right?.content ?? null}
      rightOpen={Boolean(panels.showRightFor)}
      rightLabel={panels.right?.showLabel ?? ""}
      reopenInHeader
    >
      {dialogs}
      {panels.windows}
    </ProjectColumns>
  )
  return panes.pane === "voices" ? (
    <VoicesPane panes={panes} tabs={tabs} frame={frame} />
  ) : (
    <AccountsPane panes={panes} tabs={tabs} frame={frame} />
  )
}

/** The middle while the pane's rows are read, or what went wrong, under the network's tabs. */
function Waiting({ tabs, label, error, onRetry }: { tabs: React.ReactNode; label: string; error: string | null; onRetry: () => void }) {
  return (
    <div className="@container flex h-full min-h-0 flex-col overflow-hidden bg-card">
      <CrmListHeader tabs={tabs} search={null} massSelect={null} menuLabel="More" />
      {error ? <ErrorRow message={error} onRetry={onRetry} className="p-4" /> : <LoadingRow label={label} />}
    </div>
  )
}

function VoicesPane({ panes, tabs, frame }: { panes: NetworkPanes; tabs: React.ReactNode; frame: CrmFrame }) {
  const read = useLoad(loadVoices, getVoiceErrorMessage, { remember: "content-network-voices" })
  const { setData } = read
  const reread = React.useCallback(async () => setData(await loadVoices()), [setData])
  if (!read.data) {
    return frame({
      ids: [],
      middle: <Waiting tabs={tabs} label="Reading your voices" error={read.error} onRetry={read.retry} />,
      right: { label: "Voice", showLabel: "Show the voice", content: <LoadingRow label="Reading your voices" /> },
    })
  }
  return <VoicesSection voices={read.data} search={panes.search} frame={frame} tabs={tabs} onChanged={reread} />
}

function AccountsPane({ panes, tabs, frame }: { panes: NetworkPanes; tabs: React.ReactNode; frame: CrmFrame }) {
  const read = useLoad(
    async () => {
      const [page, projects] = await Promise.all([loadRedditAccounts(false), loadProjectRows()])
      return { page, projects: projects.map((project) => ({ id: project.id, name: project.name })) }
    },
    getRedditAccountsErrorMessage,
    { remember: "content-network-accounts" }
  )
  if (!read.data) {
    return frame({
      ids: [],
      middle: <Waiting tabs={tabs} label="Reading this project's accounts" error={read.error} onRetry={read.retry} />,
      right: { label: "Account", showLabel: "Show the account", content: <LoadingRow label="Reading this project's accounts" /> },
    })
  }
  return (
    <AccountsSection
      initial={read.data.page}
      projects={read.data.projects}
      search={{ ...panes.search, platform: panes.network }}
      projectId={panes.projectId}
      frame={frame}
      tabs={tabs}
    />
  )
}
