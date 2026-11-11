import { isAutomationTemplateKey, type AutomationTemplateKey } from "@/lib/automations/templates"
import { readOpenSearch } from "@/lib/hooks/use-open-from-link"
import { readDirection, readOneOf, readSearchText } from "@/lib/nav/list-search"

/**
 * The Automations dashboard's address (Tyler, 9 Nov 2026: "turn the
 * automation dashboard into the 3 panel design pattern. The dashboard block
 * can have: Automations, Runs and Waiting on you"). `?tab=` is the section,
 * picked in the left page's Dashboards block, and each section reads only its
 * own keys, as the CRM's address does (`crm-search.ts`).
 *
 * - **Automations:** `open` is the flow picked in the table, `full=1` opens
 *   its canvas in the middle, `template=<key>` opens a template's canvas
 *   instead. On an open flow `pane=runs` shows its Runs tab, `run=` the run
 *   open on the right there, and `node=` the step picked on the canvas.
 * - **Waiting on you:** `open` is the run on the right; `q` searches.
 */
/**
 * Runs were a section of their own until Tyler, 9 Nov 2026, picked "Only the
 * flow's Runs tab": a flow's runs are on its own canvas, and only.
 */
export const AUTOMATION_TABS = ["automations", "waiting"] as const
export type AutomationTab = (typeof AUTOMATION_TABS)[number]

/** Each section's name in the Dashboards block, in Tyler's order. */
export const AUTOMATION_TAB_LABELS: Record<AutomationTab, string> = {
  automations: "Automations",
  waiting: "Waiting on you",
}

/** The Automations table's columns that sort. */
export const AUTOMATION_SORTS = ["name", "live", "steps", "nextRun", "updated"] as const
export type AutomationSort = (typeof AUTOMATION_SORTS)[number]

/** One flat shape for the router; what is in it is one section's keys. */
export type AutomationsSearch = {
  /** Automations when absent; written out once somebody picks a section. */
  tab?: AutomationTab
  open?: string
  q?: string
  // Automations
  full?: true
  template?: AutomationTemplateKey
  pane?: "runs"
  run?: string
  node?: string
  sort?: AutomationSort
  direction?: "asc" | "desc"
}

/** An id-sized value, or nothing. */
function readId(value: unknown, max = 36) {
  return typeof value === "string" && value.length > 0 && value.length <= max ? value : undefined
}

function readTrue(value: unknown): true | undefined {
  return value === true || value === "true" || value === 1 || value === "1" ? true : undefined
}

export function readAutomationsSearch(search: Record<string, unknown>): AutomationsSearch {
  const tab = readOneOf(search.tab, AUTOMATION_TABS)
  if (tab === "waiting") {
    return { tab, ...readOpenSearch(search), q: readSearchText(search.q) }
  }
  const template = isAutomationTemplateKey(search.template) ? search.template : undefined
  // A template's canvas has no runs, so only a flow's keeps the Runs tab.
  const full = template ? undefined : readTrue(search.full)
  return {
    tab,
    ...readOpenSearch(search),
    q: readSearchText(search.q),
    sort: readOneOf(search.sort, AUTOMATION_SORTS),
    direction: readDirection(search.direction),
    full,
    template,
    pane: full && search.pane === "runs" ? "runs" : undefined,
    run: full ? readId(search.run) : undefined,
    node: full || template ? readId(search.node, 64) : undefined,
  }
}

/** The section showing: Automations when the address does not say. */
export function automationTabOf(search: AutomationsSearch): AutomationTab {
  return search.tab ?? "automations"
}

/**
 * The whole address for a section picked in the Dashboards block. The section
 * is written out, because a bare `/admin/automations` is what sends the
 * dashboard back to where it last was.
 */
export function automationTabSearch(
  tab: AutomationTab,
  extra: Partial<AutomationsSearch> = {}
): AutomationsSearch {
  return { tab, ...extra }
}

/** The address that opens one flow's canvas, optionally on its Runs tab with a run open. */
export function flowSearch(
  automationId: string,
  extra: { pane?: "runs"; run?: string; node?: string } = {}
): AutomationsSearch {
  return { tab: "automations", open: automationId, full: true, ...extra }
}
