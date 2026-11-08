import * as React from "react"
import {
  CpuIcon,
  FileTextIcon,
  GaugeIcon,
  Globe2Icon,
  MonitorSmartphoneIcon,
  PackageIcon,
  PlusIcon,
  WorkflowIcon,
  type LucideIcon,
} from "lucide-react"

import { SideRows, type SideRow } from "@/components/admin-dashboard/admin-parts"
import {
  deviceRows,
  EMPTY_TEXT,
  featureRows,
  meterRows,
  modelRows,
  referrerRows,
  topPageRows,
} from "@/components/admin-dashboard/figure-rows"
import type { OverviewFigures } from "@/lib/admin-dashboard/overview-figures"
import { blockView } from "@/components/shared/notes/block-card"
import { blockNode, type AppBlock } from "@/components/shared/notes/note-block-nodes"
import { Button } from "@/components/ui/button"
import { ErrorRow } from "@/components/ui/error-row"
import type { AdminPageBlockType } from "@/lib/admin-dashboard/admin-page"
import type { AdminPlan } from "@/lib/api/billing/admin-plans"
import { formatPlanPrice } from "@/lib/format/money"
import { focusRingInset } from "@/lib/layout/focus-ring"
import { cn } from "@/lib/utils"

/**
 * The Admin dashboard's own "/" blocks, offered on both its pages (Tyler,
 * 8 Nov 2026: Plans "as well as a block for it", and the right panel's lists
 * "should be real blocks"). They keep no values of their own: the dashboard
 * hands down what it read through `AdminBlocksProvider`, for the range picked
 * in the middle.
 */

export type AdminBlocks = {
  /** Null while they are read, or when the read failed. */
  figures: OverviewFigures | null
  figuresError: string | null
  onRetryFigures: () => void
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

/** A block of one of Overview's lists, for the range picked. */
function figureBlock(rows: (figures: OverviewFigures) => SideRow[], empty: string) {
  return function FigureRows() {
    const blocks = React.useContext(AdminBlocksContext)
    if (!blocks) return <Unplaced />
    if (blocks.figures) return <SideRows rows={rows(blocks.figures)} empty={empty} />
    if (blocks.figuresError) return <ErrorRow message={blocks.figuresError} onRetry={blocks.onRetryFigures} className="py-4" />
    return <Reading />
  }
}

/** Where a plan shows, in a word or two. */
function planWhere(plan: AdminPlan) {
  if (!plan.active) return "Archived"
  if (plan.isDefault) return "Default plan"
  return plan.isPublic ? "On pricing page" : "Hidden"
}

/**
 * Every plan, a row each that opens its window, then New plan. Archived
 * plans come last.
 */
export function PlanRows({ plans, onOpen, onNew }: { plans: AdminPlan[]; onOpen: (plan: AdminPlan) => void; onNew: () => void }) {
  const sorted = [...plans].sort((a, b) => Number(b.active) - Number(a.active) || a.sortOrder - b.sortOrder)
  return (
    <SideRows
      empty="No plans yet."
      rows={sorted.map((plan) => ({
        key: plan.id,
        name: plan.name,
        line: planWhere(plan),
        value: formatPlanPrice(plan.priceMonthlyCents, plan.priceYearlyCents, plan.currency),
        onPress: () => onOpen(plan),
      }))}
      after={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn("m-1.5 justify-self-start", focusRingInset)}
          onClick={onNew}
        >
          <PlusIcon className="size-4" />
          New plan
        </Button>
      }
    />
  )
}

function PlansBlock() {
  const blocks = React.useContext(AdminBlocksContext)
  if (!blocks) return <Unplaced />
  if (!blocks.plans) {
    return blocks.plansError ? (
      <ErrorRow message={blocks.plansError} onRetry={blocks.onRetryPlans} className="py-4" />
    ) : (
      <Reading />
    )
  }
  return <PlanRows plans={blocks.plans} onOpen={blocks.onOpenPlan} onNew={blocks.onNewPlan} />
}

function appBlock(
  key: string,
  node: AdminPageBlockType,
  label: string,
  Icon: LucideIcon,
  Draw: () => React.ReactNode
): AppBlock {
  return {
    key,
    label,
    icon: Icon,
    node,
    extension: blockNode(node, {}, blockView({ kind: `admin-${key}`, title: label, icon: <Icon />, Draw })),
  }
}

/**
 * The blocks both Admin pages offer under Advanced blocks. Their node names
 * are `ADMIN_PAGE_BLOCK_TYPES`, which the server cleans a saved page with.
 */
export const ADMIN_APP_BLOCKS: readonly AppBlock[] = [
  appBlock("plans", "noteAdminPlans", "Plans", PackageIcon, PlansBlock),
  appBlock("top-pages", "noteAdminTopPages", "Top pages", FileTextIcon, figureBlock((f) => topPageRows(f.traffic), EMPTY_TEXT.pages)),
  appBlock("devices", "noteAdminDevices", "Devices", MonitorSmartphoneIcon, figureBlock((f) => deviceRows(f.traffic), EMPTY_TEXT.devices)),
  appBlock("referrers", "noteAdminReferrers", "Top referrers", Globe2Icon, figureBlock((f) => referrerRows(f.traffic), EMPTY_TEXT.referrers)),
  appBlock("ai-features", "noteAdminAiFeatures", "By feature", WorkflowIcon, figureBlock((f) => featureRows(f.ai), EMPTY_TEXT.features)),
  appBlock("ai-models", "noteAdminAiModels", "By model", CpuIcon, figureBlock((f) => modelRows(f.ai), EMPTY_TEXT.models)),
  appBlock("meters", "noteAdminMeters", "By meter", GaugeIcon, figureBlock((f) => meterRows(f.metered), EMPTY_TEXT.meters)),
]
