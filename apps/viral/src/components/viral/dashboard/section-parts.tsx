import * as React from "react"

import type { CrmFrame } from "@/components/crm/crm-frame"
import { ActionRow } from "@/components/crm/crm-record-menu"
import { TabbedMenu, type MySettingsTab } from "@/components/shared/notes/tabbed-menu"
import { Button } from "@/components/ui/button"
import { useListSearchNavigate } from "@/lib/nav/list-search"
import type { ViralDashboardSearch } from "@/lib/viral/dashboard-search"

/**
 * Small pieces every row of the Viral dashboard draws with, so the four
 * lists read as one dashboard (Tyler, 7 Nov 2026, of a merged dashboard:
 * "The Ui is all over the place"). Copied from Directory's Listings
 * dashboard (`listings-dashboard/section-parts.tsx`): the empty line with
 * Clear filters, the record's ⋮, and the open row on arrival.
 */

/** What every row of the dashboard is handed by the frame. */
export type SectionProps<Data> = {
  data: Data
  search: ViralDashboardSearch
  frame: CrmFrame
  /** Something changed: the counts on the left and the list read again. */
  onChanged: () => Promise<unknown>
}

/** A list with nothing to show for its words or filters: what was asked, and Clear filters. */
export function NoMatches({ words, noun, onClear }: { words: string; noun: string; onClear: () => void }) {
  return (
    <span className="grid justify-items-center gap-2">
      {words.trim() ? `No ${noun} match "${words.trim()}".` : `No ${noun} match those filters.`}
      <Button type="button" variant="outline" size="sm" onClick={onClear}>
        Clear filters
      </Button>
    </span>
  )
}

export type MenuAction = {
  label: string
  icon: React.ReactNode
  onSelect: () => void
  destructive?: boolean
  disabled?: boolean
}

/**
 * A record's ⋮ (the Admin 3 panel design, "The record ⋮"): one General tab
 * of grouped rows, then the action rows, then the red ones under a line.
 * 20.4rem wide.
 */
export function RecordMenu({
  label,
  groups,
  actions,
  tabs = [],
}: {
  /** "Idea menu". */
  label: string
  /** `PickGroup`s of rows, already drawn. */
  groups?: React.ReactNode
  actions: MenuAction[]
  /** Tabs after General. */
  tabs?: MySettingsTab[]
}) {
  const [open, setOpen] = React.useState(false)
  const run = (action: MenuAction) => () => {
    setOpen(false)
    action.onSelect()
  }
  const plain = actions.filter((action) => !action.destructive)
  const red = actions.filter((action) => action.destructive)
  return (
    <TabbedMenu
      label={label}
      align="end"
      width="20.4rem"
      open={open}
      onOpenChange={setOpen}
      tabs={[
        {
          value: "general",
          label: "General",
          content: (
            <div className="grid gap-3 p-3">
              {groups}
              {plain.length || red.length ? (
                <div className="grid">
                  {plain.map((action) => (
                    <ActionRow key={action.label} icon={action.icon} disabled={action.disabled} onClick={run(action)}>
                      {action.label}
                    </ActionRow>
                  ))}
                  {red.length ? <div aria-hidden className="-mx-3 my-1.5 border-t" /> : null}
                  {red.map((action) => (
                    <ActionRow key={action.label} destructive icon={action.icon} disabled={action.disabled} onClick={run(action)}>
                      {action.label}
                    </ActionRow>
                  ))}
                </div>
              ) : null}
            </div>
          ),
        },
        ...tabs,
      ]}
    />
  )
}

/**
 * The right panel is never left empty (Tyler, 23 Oct 2026: "The first load
 * always show the first task"): with nothing open, or the open record gone
 * from the list, the list's first row opens.
 */
export function useOpenFirstRow(ids: string[], openId: string | undefined) {
  const setListSearch = useListSearchNavigate()
  const firstId = ids[0]
  const openInList = Boolean(openId && ids.includes(openId))
  React.useEffect(() => {
    if (!firstId || openInList) return
    setListSearch({ open: firstId })
  }, [firstId, openInList, setListSearch])
}
