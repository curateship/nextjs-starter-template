import * as React from "react"
import { ChevronDownIcon } from "lucide-react"

import { DashboardTabButton, DashboardTabs, underlineTabClassName } from "@/components/shared/dashboard-tabs"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { FLOWFLY_TAB_LABELS, type FlowflyTab } from "@/lib/pomodoro/flowfly-search"
import { cn } from "@/lib/utils"

/** The room a tab row keeps between its tabs, the underline row's `gap-5`. */
const TAB_GAP = 20

/**
 * A section's tabs in the middle header (Tyler, 13 Nov 2026: "We just need
 * filtering and tabs to seperate them"), the shell's `DashboardTabs`, so
 * they follow Settings → Styling → Dashboard tabs. Words only. A tab carries
 * a count only when work waits there (reports to decide, shares to approve).
 * At 1440px wide, Library shows Backgrounds and Sounds with More holding
 * Member uploads and AI generations.
 */
export function FlowflySectionTabs({
  tabs,
  value,
  counts,
  onPick,
}: {
  tabs: readonly FlowflyTab[]
  value: FlowflyTab
  /** Work waiting behind a tab; absent or 0 shows no count. */
  counts: Partial<Record<FlowflyTab, number>>
  onPick: (tab: FlowflyTab) => void
}) {
  const list = tabs.map((tab) => ({ value: tab, label: FLOWFLY_TAB_LABELS[tab], count: counts[tab] ? counts[tab] : undefined }))
  return <FoldingTabs tabs={list} value={value} onPick={(tab) => onPick(tab as FlowflyTab)} />
}

/**
 * `DashboardTabs` whose tabs that do not fit fold into a More tab at the end
 * of the row, the shell's `DashboardTabButton`, never the tab showing. Used
 * by Flowfly's section tabs and by the member record's tabbed cards, whose
 * Activity row is wider than the narrowest right panel. Each tab's width is
 * measured once from a hidden copy of the row, and the row is measured again
 * whenever its room changes.
 */
export function FoldingTabs({
  tabs,
  value,
  onPick,
}: {
  tabs: readonly { value: string; label: string; count?: number }[]
  value: string
  onPick: (tab: string) => void
}) {
  const boxRef = React.useRef<HTMLDivElement>(null)
  const measureRef = React.useRef<HTMLDivElement>(null)
  const [fit, setFit] = React.useState<number>(tabs.length)
  // What the row reads, so a list rebuilt on every draw is measured again
  // only when a tab, its word or its count changes.
  const shape = tabs.map((tab) => `${tab.value}:${tab.label}:${tab.count ?? ""}`).join("|")
  const count = tabs.length

  React.useLayoutEffect(() => {
    const box = boxRef.current
    const measure = measureRef.current
    if (!box || !measure) return
    const work = () => {
      const widths = Array.from(measure.querySelectorAll<HTMLElement>("[data-measure-tab]")).map(
        (element) => element.getBoundingClientRect().width
      )
      const moreWidth = measure.querySelector<HTMLElement>("[data-measure-more]")?.getBoundingClientRect().width ?? 64
      const room = box.getBoundingClientRect().width
      const all = widths.reduce((sum, width) => sum + width, 0) + TAB_GAP * Math.max(0, widths.length - 1)
      if (all <= room) {
        setFit(count)
        return
      }
      let used = moreWidth
      let shown = 0
      for (const width of widths) {
        if (used + width + TAB_GAP > room) break
        used += width + TAB_GAP
        shown += 1
      }
      setFit(Math.max(1, shown))
    }
    work()
    const observer = new ResizeObserver(work)
    observer.observe(box)
    return () => observer.disconnect()
  }, [shape, count])

  // The tab showing always stays in the row: it takes the last place shown.
  let shown = tabs.slice(0, fit)
  const current = tabs.find((tab) => tab.value === value)
  if (current && !shown.includes(current) && shown.length) shown = [...shown.slice(0, -1), current]
  const folded = tabs.filter((tab) => !shown.includes(tab))

  return (
    // Never narrower than one tab and More, so a phone's header still names the tab showing.
    <div ref={boxRef} className="relative flex min-w-24 flex-1 self-stretch">
      {/* The hidden copy every width is read from, in a box of no size so it
          never widens the header. */}
      <div aria-hidden className="pointer-events-none invisible absolute top-0 left-0 size-0 overflow-hidden">
      <div ref={measureRef} className="flex w-max">
        {tabs.map((tab) => (
          <span key={tab.value} data-measure-tab="" className={underlineTabClassName}>
            {tab.label}
            {tab.count !== undefined ? <span className="text-xs">{tab.count}</span> : null}
          </span>
        ))}
        <span data-measure-more="" className={cn(underlineTabClassName, "gap-1")}>
          More
          <ChevronDownIcon className="size-4" />
        </span>
      </div>
      </div>
      <DashboardTabs
        value={value}
        onValueChange={onPick}
        tabs={shown.map((tab) => ({ value: tab.value, label: tab.label, count: tab.count }))}
        after={
          folded.length ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <DashboardTabButton aria-label="More tabs" className="gap-1">
                  More
                  <ChevronDownIcon className="size-4" />
                </DashboardTabButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-40">
                {folded.map((tab) => (
                  <DropdownMenuItem key={tab.value} onSelect={() => onPick(tab.value)}>
                    {tab.label}
                    {tab.count !== undefined ? (
                      <span className="ml-auto text-xs text-muted-foreground">{tab.count}</span>
                    ) : null}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null
        }
      />
    </div>
  )
}
