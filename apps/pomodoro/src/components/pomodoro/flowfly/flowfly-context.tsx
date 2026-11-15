import * as React from "react"

import type { CrmFrame } from "@/components/crm/crm-frame"
import type { FlowflySearch, FlowflyTab } from "@/lib/pomodoro/flowfly-search"

/**
 * What the Flowfly frame hands the list showing (Tyler, 13 Nov 2026): which
 * tab it is, the address as that tab reads it, the header's start (the
 * section's tabs), and the `frame` its middle and record are drawn through.
 *
 * Each list used to be a page of its own and read its own route. Here it
 * reads this instead, so the address it sees is always its own: while the
 * next tab's rows load, the last tab keeps the address it was drawn for and
 * never asks the server with another list's sort or filters.
 */
export type FlowflyTabFrame = {
  tab: FlowflyTab
  search: FlowflySearch
  /** The header's start: the reopen button for a shut left panel, then the section's tabs. */
  heading: React.ReactNode
  frame: CrmFrame
}

const TabFrame = React.createContext<FlowflyTabFrame | null>(null)

export const FlowflyTabProvider = TabFrame.Provider

export function useFlowflyTab(): FlowflyTabFrame {
  const value = React.useContext(TabFrame)
  if (!value) throw new Error("A Flowfly list is drawn outside the Flowfly dashboard.")
  return value
}

/** The address as the list showing reads it, typed as that list's own search. */
export function useFlowflySearch<Search>(): Search {
  return useFlowflyTab().search as Search
}
