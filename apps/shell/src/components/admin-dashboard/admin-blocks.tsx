import * as React from "react"
import { LayoutDashboardIcon, PackageIcon, PlusIcon, type LucideIcon } from "lucide-react"

import { SideRows } from "@/components/admin-dashboard/admin-parts"
import { AdditionBoundary } from "@/components/admin-dashboard/addition-boundary"
import { blockView, useBlockMenu } from "@/components/shared/notes/block-card"
import { blockNode, keepOnPage, type AppBlock } from "@/components/shared/notes/note-block-nodes"
import { Button } from "@/components/ui/button"
import { ErrorRow } from "@/components/ui/error-row"
import { appBlockNodeName, type AdminAdditionProps } from "@/lib/admin-dashboard/admin-additions"
import { ADMIN_SECTIONS_NODE, SHELL_ADMIN_BLOCK_KEYS } from "@/lib/admin-dashboard/admin-page"
import { ADMIN_TAB_LABELS, ADMIN_TABS, type AdminTab } from "@/lib/admin-dashboard/admin-search"
import type { AnalyticsRange } from "@/lib/analytics/range"
import type { AdminSectionCounts } from "@/lib/api/admin-dashboard"
import type { AdminPlan } from "@/lib/api/billing/admin-plans"
import { appAdminBlocks } from "@/lib/app-options"
import { formatPlanPrice } from "@/lib/format/money"
import { focusRingInset } from "@/lib/layout/focus-ring"
import { cn } from "@/lib/utils"

/**
 * The Admin dashboard's own "/" blocks, on both its pages. They keep no
 * values of their own: the dashboard hands down what it read through
 * `AdminBlocksProvider`.
 *
 * - **Dashboards**, fixed on the left page: a row per section, the one
 *   showing picked (Tyler, 8 Nov 2026: "we're moving the 3 tabs ... to the
 *   left side as a block and we add media library to it too").
 * - **Plans**, offered on both (Plans "as well as a block for it").
 * - **The app's own**, from `admin.blocks` in its `src/app/options.ts`.
 */

export type AdminBlocks = {
  /** The section the middle shows, and picking another. */
  tab: AdminTab
  onPickTab: (tab: AdminTab) => void
  /** Null while they are read, or when the read failed. */
  counts: AdminSectionCounts | null
  /** How many widgets Overview shows; null while the layout is read. */
  widgetCount: number | null
  /** The range picked on Overview, handed to the app's blocks. */
  days: AnalyticsRange
  /** Null while they are read, or when the read failed. */
  plans: AdminPlan[] | null
  plansError: string | null
  onRetryPlans: () => void
  onOpenPlan: (plan: AdminPlan) => void
  onNewPlan: () => void
}

const AdminBlocksContext = React.createContext<AdminBlocks | null>(null)

export const AdminBlocksProvider = AdminBlocksContext.Provider

function Unplaced() {
  return <p className="p-3 text-xs text-muted-foreground">This block shows on the Admin dashboard.</p>
}

function Reading() {
  return <p className="p-3 text-xs text-muted-foreground">Reading…</p>
}

/** How long the Dashboards block's bar takes to grow; `SideRows`' `nav` transition. */
const SECTION_BAR_MS = 220

const SECTION_COUNT: Record<AdminTab, keyof AdminSectionCounts | null> = {
  overview: null,
  users: "users",
  feedback: "feedback",
  media: "media",
}

/**
 * Overview, Users, Feedback and Media library, the one showing picked. Also
 * drawn on its own while the left page is read or could not be, because it is
 * the only way between the sections.
 */
export function SectionsBlock() {
  const blocks = React.useContext(AdminBlocksContext)
  // The row pressed is picked at once, and the section switch waits for its
  // bar to finish growing (Tyler, 8 Nov 2026: "animation is not smooth").
  // Drawing a new section keeps the browser busy for 100 to 185ms, and a bar
  // growing at the same time skipped most of its frames. The address takes
  // over once it says something new.
  const [pressed, setPressed] = React.useState<{ tab: AdminTab; from: AdminTab } | null>(null)
  if (pressed && blocks && blocks.tab !== pressed.from) setPressed(null)
  const timer = React.useRef(0)
  React.useEffect(() => () => window.clearTimeout(timer.current), [])
  if (!blocks) return <Unplaced />
  const shown = pressed?.tab ?? blocks.tab
  return (
    <SideRows
      nav
      empty=""
      rows={ADMIN_TABS.map((tab) => {
        const counted = SECTION_COUNT[tab]
        return {
          key: tab,
          name: ADMIN_TAB_LABELS[tab],
          value:
            tab === "overview"
              ? blocks.widgetCount?.toLocaleString()
              : counted && blocks.counts
                ? blocks.counts[counted].toLocaleString()
                : undefined,
          picked: tab === shown,
          onPress: () => {
            window.clearTimeout(timer.current)
            if (tab === blocks.tab) {
              setPressed(null)
              return
            }
            setPressed({ tab, from: blocks.tab })
            const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches
            // Switches only if the page is still where it was pressed.
            const from = window.location.href
            timer.current = window.setTimeout(() => {
              if (window.location.href === from) blocks.onPickTab(tab)
            }, still ? 0 : SECTION_BAR_MS)
          },
        }
      })}
    />
  )
}

/** Where a plan shows, in a word or two, and its dot's colour. */
function planWhere(plan: AdminPlan) {
  if (!plan.active) return { line: "Archived", dot: "bg-muted-foreground/40" }
  if (plan.isDefault) return { line: "Default plan", dot: "bg-blue-500" }
  return plan.isPublic ? { line: "On pricing page", dot: "bg-emerald-500" } : { line: "Hidden", dot: "bg-amber-500" }
}

/**
 * Every plan, a row each that opens its window, archived plans last. The
 * Admin ⋮'s Plans tab ends with New plan; the block has it in its own ⋮.
 */
export function PlanRows({
  plans,
  onOpen,
  onNew,
}: {
  plans: AdminPlan[]
  onOpen: (plan: AdminPlan) => void
  /** Left out, the list ends with no New plan button. */
  onNew?: () => void
}) {
  const sorted = [...plans].sort((a, b) => Number(b.active) - Number(a.active) || a.sortOrder - b.sortOrder)
  return (
    <SideRows
      empty="No plans yet."
      rows={sorted.map((plan) => ({
        key: plan.id,
        name: plan.name,
        ...planWhere(plan),
        value: formatPlanPrice(plan.priceMonthlyCents, plan.priceYearlyCents, plan.currency),
        onPress: () => onOpen(plan),
      }))}
      after={
        onNew ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={cn("justify-self-start", focusRingInset)}
            onClick={onNew}
          >
            <PlusIcon className="size-4" />
            New plan
          </Button>
        ) : null
      }
    />
  )
}

function PlansBlock() {
  const blocks = React.useContext(AdminBlocksContext)
  // New plan is in the block's ⋮, above Delete block (Tyler, 8 Nov 2026:
  // "Move this into the dropdown").
  useBlockMenu(
    blocks ? [{ label: "New plan", icon: <PlusIcon className="size-4" />, onSelect: blocks.onNewPlan }] : undefined
  )
  if (!blocks) return <Unplaced />
  if (!blocks.plans) {
    return blocks.plansError ? (
      <ErrorRow message={blocks.plansError} onRetry={blocks.onRetryPlans} className="py-4" />
    ) : (
      <Reading />
    )
  }
  return <PlanRows plans={blocks.plans} onOpen={blocks.onOpenPlan} />
}

/**
 * An app's block: its component, loaded the first time a page shows it,
 * handed the range picked. One that throws says so inside its own card.
 */
function appBlockDraw(load: () => Promise<{ default: React.ComponentType<AdminAdditionProps> }>) {
  const Lazy = React.lazy(load)
  return function AppBlockDraw() {
    const blocks = React.useContext(AdminBlocksContext)
    if (!blocks) return <Unplaced />
    return (
      <AdditionBoundary kind="block">
        <React.Suspense fallback={<Reading />}>
          <Lazy days={blocks.days} />
        </React.Suspense>
      </AdditionBoundary>
    )
  }
}

function pageBlock(
  key: string,
  node: string,
  label: string,
  Icon: LucideIcon,
  Draw: () => React.ReactNode,
  fixed = false
): AppBlock {
  const made = blockNode(node, {}, blockView({ kind: `admin-${key}`, title: label, icon: <Icon />, Draw, fixed }))
  return {
    key,
    label,
    icon: Icon,
    node,
    extension: fixed ? keepOnPage(made) : made,
    offered: !fixed,
  }
}

let made: readonly AppBlock[] | null = null

/**
 * Every block the Admin pages know, made once: Dashboards (fixed, never in
 * the "/" list), Plans, then the app's own. Their node names are
 * `adminPageBlockTypes()`, which the server cleans a saved page with.
 */
export function adminBlocks(): readonly AppBlock[] {
  made ??= [
    pageBlock("sections", ADMIN_SECTIONS_NODE, "Dashboards", LayoutDashboardIcon, SectionsBlock, true),
    pageBlock("plans", "noteAdminPlans", "Plans", PackageIcon, PlansBlock),
    ...appAdminBlocks(SHELL_ADMIN_BLOCK_KEYS).map((block) =>
      pageBlock(block.key, appBlockNodeName(block.key), block.label, block.icon, appBlockDraw(block.load))
    ),
  ]
  return made
}
