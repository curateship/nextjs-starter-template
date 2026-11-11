import * as React from "react"
import { createPortal } from "react-dom"
import { useNavigate } from "@tanstack/react-router"
import { BotIcon, FlaskConicalIcon, WorkflowIcon, type LucideIcon } from "lucide-react"

import type { BotsBlocks } from "@/components/bots/bots-blocks"
import { BotsOverview } from "@/components/bots/bots-overview"
import { BotsPagePanel } from "@/components/bots/bots-page-panel"
import { BacktestsSection, type BacktestsLoaded } from "@/components/bots/backtests-section"
import { BotRunsSection, type BotRunsLoaded } from "@/components/bots/bot-runs-section"
import { RecipesSection, type RecipesLoaded } from "@/components/bots/recipes-section"
import { RightCoverProvider } from "@/components/shared/notes/page-cover"
import { useWidgetLayout, type WidgetStore } from "@/components/shared/widgets/use-widget-layout"
import { ManageWidgetsProvider, WidgetSettings } from "@/components/shared/widgets/widget-menus"
import { useTabbedMenuState } from "@/components/shared/notes/tabbed-menu"
import { middleGutterClassName, MiddleHeading, PanelReopenButton, ThreePanels } from "@/components/shared/three-panels"
import { ErrorRow } from "@/components/ui/error-row"
import { widgetsShown, type WidgetLayout } from "@/lib/admin-dashboard/overview-widgets"
import {
  getBotsErrorMessage,
  loadBotsCounts,
  loadBotsPage,
  loadBotsWidgetLayout,
  saveBotsWidgetLayout,
} from "@/lib/api/trade/bots"
import { BOTS_WIDGET_OFFER } from "@/lib/bots/bots-widgets"
import {
  BOTS_VIEW_LABELS,
  botsViewOf,
  botsViewSearch,
  type BotsSearch,
  type BotsView,
} from "@/lib/bots/bots-search"
import type { TradingOverviewBot } from "@/lib/trade/dashboard/overview"
import { botsPanelKey } from "@/lib/trade/panel-keys"
import { useLoad } from "@/lib/hooks/use-load"
import type { StoredPage } from "@/lib/notes/page-body"
import { cn } from "@/lib/utils"

/** What the route's loader read, for the section showing. */
export type BotsLoaded =
  | { view: "overview"; bots: TradingOverviewBot[]; layout: WidgetLayout }
  | RecipesLoaded
  | BacktestsLoaded
  | BotRunsLoaded

/** Each section's icon, at the start of the middle's header. Overview has no header. */
const SECTION_ICONS: Record<Exclude<BotsView, "overview">, LucideIcon> = {
  recipes: WorkflowIcon,
  backtests: FlaskConicalIcon,
  bots: BotIcon,
}

/**
 * What a section hands the frame to draw: the middle's one header and what
 * sits under it, its record for the right panel, and its rows, so a bare
 * address goes back to the line last open and arrival opens the first.
 */
export type BotsPanels = {
  header: React.ReactNode
  middle: React.ReactNode
  /** Left out on a section with no record on the right: the Recipes table. */
  right?: { label: string; content: React.ReactNode }
  ids: string[]
  openId?: string
  ready?: boolean
  windows?: React.ReactNode
}

export type BotsFrame = (panels: BotsPanels) => React.ReactNode

/** What a section's start and end of the middle header are, and how it moves the address. */
export type BotsSectionProps = {
  search: BotsSearch
  /** The start of the middle's header: the reopen button, the icon and the name. */
  heading: React.ReactNode
  /** The end of the middle's header: the button that reopens a shut right panel. */
  headingEnd: React.ReactNode
  frame: BotsFrame
  /** Moves the address within this section; `push` adds to the history, as opening a record does. */
  go: (search: BotsSearch, how?: { push?: boolean }) => void
  /** Moves to another section's record, opened in the middle. */
  openElsewhere: (view: Exclude<BotsView, "overview">, id: string) => void
  /** The Dashboards block's counts are read again after a change. */
  onChanged: () => void
}

type SectionPlace = { view: BotsView; ids: string[]; openId?: string; ready: boolean; rightLabel?: string }

function samePlace(a: SectionPlace | null, b: SectionPlace) {
  return (
    a !== null &&
    a.view === b.view &&
    a.openId === b.openId &&
    a.ready === b.ready &&
    a.rightLabel === b.rightLabel &&
    a.ids.join("\n") === b.ids.join("\n")
  )
}

/** Where the Overview's layout is read and saved: on the person's own prefs, apart from the Trade Overview's. */
const BOTS_WIDGET_STORE: WidgetStore = {
  load: loadBotsWidgetLayout,
  save: saveBotsWidgetLayout,
  message: getBotsErrorMessage,
}

/**
 * The Bots dashboard at `/bots` (Tyler, 9 Nov 2026: "combine the automation,
 * backtest and bot dashboard into one 3 panel dashboard like in shell"), laid
 * out as the shell's Admin dashboard is. It takes the place of the Recipes,
 * Backtests and Live runs screens and their record pages.
 *
 * - **Left:** each admin's own page. Its fixed Dashboards block picks the
 *   section: Overview, Recipes, Backtests or Bots. It stays the page whatever
 *   is open ("if we combine all the sidebars, there's like 3 sidebar on the
 *   left").
 * - **Middle:** one header and the section's table. A line opened fills the
 *   middle: a recipe's step list and canvas, as an open automation is drawn,
 *   or a backtest's or bot's chart. Overview has no middle panel: its widgets
 *   sit straight on the dashboard.
 * - **Right:** once opened, the step picked on the canvas, or the run's Result
 *   and Trades cards.
 */
export function BotsDashboard({ loaded, search }: { loaded: BotsLoaded; search: BotsSearch }) {
  const navigate = useNavigate({ from: "/bots" })
  const view = botsViewOf(search)
  const overview = loaded.view === "overview"
  // An open recipe draws its own two panels in the middle, the step list then
  // the canvas, so the middle has no card of its own. Fixed while the recipe
  // stays open: switching it remounts the middle.
  const bare = overview || (loaded.view === "recipes" && Boolean(search.full))

  const pageRead = useLoad(loadBotsPage, getBotsErrorMessage)
  const setPage = (page: StoredPage) => pageRead.setData(() => page)
  // Read again on each section switch, after whatever was changed in the last one.
  const [changes, setChanges] = React.useState(0)
  const countsRead = useLoad(loadBotsCounts, getBotsErrorMessage, { keys: [loaded.view, changes] })
  const widgets = useWidgetLayout(BOTS_WIDGET_STORE, loaded.view === "overview" ? loaded.layout : null)
  // The left ⋮, held here so a widget's Manage widgets opens it at Widgets.
  const leftMenu = useTabbedMenuState()
  const { openAt: openLeftMenuAt } = leftMenu
  const manageWidgets = React.useCallback(() => openLeftMenuAt("widgets"), [openLeftMenuAt])

  const go = React.useCallback(
    (next: BotsSearch, how?: { push?: boolean }) => void navigate({ search: next, replace: !how?.push }),
    [navigate]
  )
  const pickView = (next: BotsView) => void navigate({ search: botsViewSearch(next) })
  const openElsewhere = (next: Exclude<BotsView, "overview">, id: string) =>
    void navigate({ search: { view: next, open: id, full: true } })

  const blocks: BotsBlocks = {
    view,
    onPickView: pickView,
    counts: countsRead.data,
    widgetCount: widgets.layout ? widgetsShown(widgets.layout) : null,
    // From an open record, its own row goes back to the table, that line still picked.
    onReturn:
      search.full && view !== "overview"
        ? () => void navigate({ search: { view, open: search.open, q: search.q, archived: search.archived, recipe: search.recipe } })
        : undefined,
  }

  // Where a section's record is drawn: a spot in the right panel that stays
  // while the section changes, and what the section says about its rows.
  const [rightSpot, setRightSpot] = React.useState<HTMLDivElement | null>(null)
  const [reported, setReported] = React.useState<SectionPlace | null>(null)
  const report = React.useCallback(
    (next: SectionPlace) => setReported((current) => (samePlace(current, next) ? current : next)),
    []
  )
  const place: SectionPlace =
    reported?.view === loaded.view ? reported : { view: loaded.view, ids: [], ready: loaded.view === "overview" }
  const recordLabel = place.rightLabel ?? "Record"
  // Two panels, page and middle, with no record on the right: Overview; every
  // table, whose line opens its record at once (Tyler, 9 Nov 2026: "clicking on
  // the recipe should just go to the canvas", then "we dont need the right
  // panel for backtest dashboard. it should go straight to the result chart.
  // same with bots dashboard"); and a canvas with no step picked ("just dont
  // show the right panel until a node is clicked on"). A step pressed in the
  // step list and not added yet shows there too, with no ?node= of its own.
  // A Backtests line picked shows its Result card on the right, with Open
  // chart in the footer (Tyler, 10 Nov 2026: "clicking on the table item
  // should open up the right panel to show the results").
  const backtestPicked = loaded.view === "backtests" && Boolean(search.open)
  const twoPanels =
    overview ||
    (!search.full && !backtestPicked) ||
    (loaded.view === "recipes" && !search.node && !place.rightLabel)

  const frame: BotsFrame = (panels) => (
    <SectionPanels view={loaded.view} panels={panels} rightSpot={rightSpot} onReport={report} />
  )
  const SectionIcon = view === "overview" ? null : SECTION_ICONS[view]
  const section: BotsSectionProps = {
    search,
    heading: SectionIcon ? <MiddleHeading icon={SectionIcon} label={BOTS_VIEW_LABELS[view]} /> : null,
    headingEnd: <PanelReopenButton side="right" label={`Show the ${recordLabel.toLowerCase()}`} />,
    frame,
    go,
    openElsewhere,
    onChanged: () => setChanges((count) => count + 1),
  }

  let middle: React.ReactNode
  if (loaded.view === "recipes") middle = <RecipesSection key="recipes" loaded={loaded} {...section} />
  else if (loaded.view === "backtests") middle = <BacktestsSection key="backtests" loaded={loaded} {...section} />
  else if (loaded.view === "bots") middle = <BotRunsSection key="bots" loaded={loaded} {...section} />
  else {
    middle = widgets.layout ? (
      <BotsOverview
        bots={loaded.bots}
        layout={widgets.layout}
        onChange={widgets.change}
        onOpenBot={(runId) => openElsewhere("bots", runId)}
        onOpenRecipes={() => pickView("recipes")}
      />
    ) : widgets.error ? (
      <ErrorRow message={widgets.error} onRetry={widgets.retry} />
    ) : null
  }

  return (
    <RightCoverProvider value={pageRead.data?.coverUrl ?? null}>
    <ManageWidgetsProvider value={manageWidgets}>
      <ThreePanels
        // Overview is two panels, with a layout of its own.
        layoutKey={twoPanels ? botsPanelKey.twoPanels : botsPanelKey.dashboard}
        place={{ key: botsPanelKey.place, search, ids: place.ids, ready: place.ready, section: loaded.view }}
        showMiddleFor={view}
        showRightFor={search.open}
        reopenInHeader={!overview}
        left={{
          label: "Page",
          showLabel: "Show the page",
          content: (
            <BotsPagePanel
              page={pageRead.data}
              error={pageRead.error}
              onRetry={pageRead.retry}
              blocks={blocks}
              onPageChange={setPage}
              menuState={leftMenu}
              menuTabs={[
                {
                  value: "widgets",
                  label: "Widgets",
                  content: (
                    <WidgetSettings
                      offer={BOTS_WIDGET_OFFER}
                      layout={widgets.layout}
                      error={widgets.error}
                      onRetry={widgets.retry}
                      onChange={widgets.change}
                    />
                  ),
                },
              ]}
            />
          ),
        }}
        middle={{
          label: BOTS_VIEW_LABELS[view],
          bare,
          content: (
            // The container its tables measure, so their columns drop out as the middle narrows.
            <div
              className={cn(
                "@container flex h-full min-h-0 flex-col overflow-hidden",
                !overview && middleGutterClassName,
                !bare && "bg-card"
              )}
            >
              {middle}
            </div>
          ),
        }}
        right={
          twoPanels
            ? undefined
            : {
                label: recordLabel,
                showLabel: `Show the ${recordLabel.toLowerCase()}`,
                content: <div ref={setRightSpot} className="flex h-full min-h-0 flex-col" />,
              }
        }
      />
    </ManageWidgetsProvider>
    </RightCoverProvider>
  )
}

/**
 * One section's panels inside the frame that stays: its header, middle and
 * windows where it stands, its record drawn into the right panel's spot, and
 * its rows told to the frame for the place it keeps.
 */
function SectionPanels({
  view,
  panels,
  rightSpot,
  onReport,
}: {
  view: BotsView
  panels: BotsPanels
  rightSpot: HTMLDivElement | null
  onReport: (place: SectionPlace) => void
}) {
  // Compared as text: a section hands over a fresh list every render.
  const idsText = panels.ids.join("\n")
  const rightLabel = panels.right?.label
  const ready = panels.ready ?? true
  React.useEffect(() => {
    onReport({ view, ids: idsText ? idsText.split("\n") : [], openId: panels.openId, ready, rightLabel })
  }, [view, idsText, panels.openId, ready, rightLabel, onReport])

  return (
    <>
      {panels.header}
      {panels.middle}
      {panels.right && rightSpot ? createPortal(panels.right.content, rightSpot) : null}
      {panels.windows}
    </>
  )
}
