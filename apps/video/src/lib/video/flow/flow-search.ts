/**
 * What the Flow dashboard's address holds (workspace/docs/flow.md).
 *
 * - `tab`: Flows (left out) or Runs, the left panel's two rows.
 * - `open`: the flow picked in the table, shown on the right.
 * - `edit`: the flow open in the builder, which takes the middle.
 * - `node`: the node picked on the builder's canvas.
 * - `run`: the run open on its steps page, which takes the middle.
 * - `step`: the step picked on the steps page.
 * - `q`: the table's search.
 */
export const FLOW_TABS = ["flows", "runs"] as const
export type FlowTab = (typeof FLOW_TABS)[number]

export const FLOW_TAB_LABELS: Record<FlowTab, string> = { flows: "Flows", runs: "Runs" }

export type FlowSearch = {
  tab?: "runs"
  open?: string
  edit?: string
  node?: string
  run?: string
  step?: string
  q?: string
}

function text(value: unknown, max: number) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined
}

export function readFlowSearch(search: Record<string, unknown>): FlowSearch {
  const tab = search.tab === "runs" ? "runs" : undefined
  const read: FlowSearch = {
    tab,
    open: text(search.open, 36),
    edit: tab ? undefined : text(search.edit, 36),
    node: tab ? undefined : text(search.node, 64),
    run: tab ? text(search.run, 36) : undefined,
    step: tab ? text(search.step, 36) : undefined,
    q: text(search.q, 120),
  }
  return Object.fromEntries(Object.entries(read).filter(([, value]) => value !== undefined)) as FlowSearch
}

export function flowTabOf(search: FlowSearch): FlowTab {
  return search.tab === "runs" ? "runs" : "flows"
}

/** The dashboard's layout keys, plain strings: Flow's own, never in the shell's list. */
export const FLOW_LAYOUT_KEYS = {
  three: "video-flow-v1",
  two: "video-flow-two-v1",
  place: "video-flow-place-v1",
} as const
