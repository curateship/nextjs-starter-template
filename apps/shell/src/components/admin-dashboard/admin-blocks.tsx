import * as React from "react"
import { EyeIcon, EyeOffIcon, LayoutDashboardIcon, PackageIcon, PlusIcon, type LucideIcon } from "lucide-react"

import { AdditionBoundary } from "@/components/shared/widgets/addition-boundary"
import { blockView, useBlockMenu } from "@/components/shared/notes/block-card"
import { DashboardsRows } from "@/components/shared/notes/dashboards-rows"
import { SideRows } from "@/components/shared/notes/side-rows"
import { blockNode, keepOnPage, type AppBlock } from "@/components/shared/notes/note-block-nodes"
import { ErrorRow } from "@/components/ui/error-row"
import { appBlockNodeName, type AdminAdditionProps } from "@/lib/admin-dashboard/admin-additions"
import { ADMIN_SECTIONS_NODE, SHELL_ADMIN_BLOCK_KEYS } from "@/lib/admin-dashboard/admin-page"
import { ADMIN_TAB_LABELS, ADMIN_TABS, type AdminTab } from "@/lib/admin-dashboard/admin-search"
import { orderSections } from "@/lib/layout/styling-values"
import type { AnalyticsRange } from "@/lib/analytics/range"
import type { AdminSectionCounts } from "@/lib/api/admin-dashboard"
import type { AdminPlan } from "@/lib/api/billing/admin-plans"
import { appAdminBlocks } from "@/lib/app-options"
import { formatPlanPrice } from "@/lib/format/money"

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
  /** A press on the section already showing, which takes it back to its list. */
  onRepickTab?: (tab: AdminTab) => void
  /** Sections left out of the block, and changing them from its ⋮. */
  hiddenSections: readonly AdminTab[]
  onHiddenSectionsChange: (hidden: AdminTab[]) => void
  /** The sections' saved order, dragged in the block's ⋮; unset is the shell's. */
  sectionOrder?: readonly string[]
  onSectionOrderChange?: (order: string[]) => void
  /** Null while they are read, or when the read failed. */
  counts: AdminSectionCounts | null
  /** Counts worked out in the browser from the settings: Styling's groups, Navigations' links. */
  localCounts?: Partial<Record<AdminTab, number>>
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

const SECTION_COUNT: Record<AdminTab, keyof AdminSectionCounts | null> = {
  overview: null,
  pages: "pages",
  styling: null,
  navigation: null,
  users: "users",
  feedback: "feedback",
  announcements: "announcements",
  media: "media",
}


/**
 * Overview, Users, Feedback, Announcements and Media library, the one
 * showing picked. Also
 * drawn on its own while the left page is read or could not be, because it is
 * the only way between the sections.
 *
 * Its ⋮ lists every section but Overview, an open eye on one that shows and
 * an eye with a slash on one that is hidden (Tyler, 9 Nov 2026: "the
 * dashboard block is missing the 3 dot dropdown and need to add the
 * hide/show dashboards", drawn on Trade's Protocols block). One press swaps
 * it and the menu stays open for the next. The section showing keeps its row
 * until another is picked, so the block never loses the row you are on.
 */
export function SectionsBlock() {
  const blocks = React.useContext(AdminBlocksContext)
  const hidden = blocks?.hiddenSections ?? []
  const changeHidden = blocks?.onHiddenSectionsChange
  // In the order saved, dragged in the ⋮ (Tyler, 9 Nov 2026: "I want to be
  // able to drag and drop dashboard item positions"). Overview stays first,
  // and is never hidden: it is where the dashboard starts.
  const ordered = orderSections(ADMIN_TABS, blocks?.sectionOrder)
  useBlockMenu(
    changeHidden
      ? ordered.filter((tab) => tab !== "overview").map((tab) => {
          const isHidden = hidden.includes(tab)
          return {
            label: ADMIN_TAB_LABELS[tab],
            ariaLabel: `${isHidden ? "Show" : "Hide"} ${ADMIN_TAB_LABELS[tab]}`,
            muted: isHidden,
            keepOpen: true,
            end: isHidden ? <EyeOffIcon aria-hidden /> : <EyeIcon aria-hidden />,
            sortKey: tab,
            onSelect: () =>
              changeHidden(isHidden ? hidden.filter((other) => other !== tab) : [...hidden, tab]),
          }
        })
      : undefined,
    blocks?.onSectionOrderChange
  )
  if (!blocks) return <Unplaced />
  return (
    <DashboardsRows
      current={blocks.tab}
      onPick={blocks.onPickTab}
      onRepick={blocks.onRepickTab}
      sections={ordered.filter((tab) => tab === blocks.tab || !hidden.includes(tab)).map((tab) => {
        const counted = SECTION_COUNT[tab]
        const local = blocks.localCounts?.[tab]
        return {
          key: tab,
          label: ADMIN_TAB_LABELS[tab],
          value:
            tab === "overview"
              ? blocks.widgetCount?.toLocaleString()
              : local !== undefined
                ? local.toLocaleString()
                : counted && blocks.counts
                ? blocks.counts[counted].toLocaleString()
                : undefined,
        }
      })}
    />
  )
}

/** A plan's dot: blue the default, green on the pricing page, amber hidden, grey archived. */
function planDot(plan: AdminPlan) {
  if (!plan.active) return "bg-muted-foreground/40"
  if (plan.isDefault) return "bg-blue-500"
  return plan.isPublic ? "bg-emerald-500" : "bg-amber-500"
}

/**
 * Every plan, a row each that opens its window, archived plans last. New
 * plan is the Admin ⋮'s Plans tab footer, and in the block's own ⋮.
 */
export function PlanRows({
  plans,
  onOpen,
}: {
  plans: AdminPlan[]
  onOpen: (plan: AdminPlan) => void
}) {
  const sorted = [...plans].sort((a, b) => Number(b.active) - Number(a.active) || a.sortOrder - b.sortOrder)
  return (
    <SideRows
      empty="No plans yet."
      // The price after the dot, where the dot's words were, and how many
      // accounts are on the plan in the pill, where the price was (Tyler,
      // 9 Nov 2026: "replace all these text label with the priceing instead
      // and where the pricing was put the amount of users in that plan").
      // The dot keeps its colour: blue default, green on the pricing page,
      // amber hidden, grey archived.
      rows={sorted.map((plan) => ({
        key: plan.id,
        name: plan.name,
        dot: planDot(plan),
        line: formatPlanPrice(plan.priceMonthlyCents, plan.priceYearlyCents, plan.currency),
        value: plan.memberCount === undefined ? undefined : plan.memberCount.toLocaleString(),
        onPress: () => onOpen(plan),
      }))}
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
  // Active plans only (Tyler, 9 Nov 2026: "only show active plans. dont show
  // archived plans in the block"). The Admin ⋮'s Plans tab still lists the
  // archived ones, where one is opened to bring it back.
  return <PlanRows plans={blocks.plans.filter((plan) => plan.active)} onOpen={blocks.onOpenPlan} />
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
