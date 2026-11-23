import * as React from "react"
import { useRouter } from "@tanstack/react-router"

import { useCrmFrame } from "@/components/crm/crm-frame"
import { RightCoverProvider } from "@/components/shared/notes/page-cover"
import { middleGutterClassName, ThreePanels } from "@/components/shared/three-panels"
import { ManageWidgetsProvider } from "@/components/shared/widgets/widget-menus"
import { ErrorRow } from "@/components/ui/error-row"
import type { ViralLoaded } from "@/components/viral/dashboard/load-section"
import { FormatsSection } from "@/components/viral/dashboard/sections/formats-section"
import { HooksSection } from "@/components/viral/dashboard/sections/hooks-section"
import { ProjectsSection } from "@/components/viral/dashboard/sections/projects-section"
import { VaultSection } from "@/components/viral/dashboard/sections/vault-section"
import { useViralLeft } from "@/components/viral/dashboard/viral-left"
import { ViralOverview } from "@/components/viral/dashboard/viral-overview"
import { cn } from "@/lib/utils"
import { VIRAL_DASHBOARD_LAYOUT_KEY, VIRAL_OVERVIEW_LAYOUT_KEY, VIRAL_PLACE_KEY } from "@/lib/viral/dashboard-keys"
import { VIRAL_SECTION_LABELS, viralSectionOf, type ViralDashboardSearch, type ViralSection } from "@/lib/viral/dashboard-search"

/**
 * Viral as one three-panel dashboard (task features/03; Tyler, 19 Nov 2026:
 * "I want to consolidate the currant 4 pages dashboard into one 3 panel
 * dashboard using the shell's design patter", and again on 21 Nov: "combine
 * all these dashboard into one 3 panel dashboard"). Today, Projects, Vault
 * and Library became its rows, laid out piece for piece as Directory's
 * Events dashboard is.
 *
 * - **Left:** the person's page of blocks. Its fixed Dashboards block picks
 *   the row (Overview, Projects, Vault, Hooks, Formats) and counts each one.
 *   The Projects block narrows Vault, Hooks and Formats to one project, and
 *   the Folders block narrows Projects. Its ⋮ holds General (cover, Lock
 *   blocks) and Widgets. The + makes a new project.
 * - **Middle:** Overview's widgets straight on the dashboard, taking the
 *   right panel's room too; or a row's one header and table.
 * - **Right:** the record open (`?open=`): a project's preview, an idea, a
 *   hook or a format. The first row opens on arrival, and the dashboard goes
 *   back to where it was.
 *
 * A project opens inside the dashboard, at `/admin/projects/<id>`, under the
 * same left panel (`viral-project-screen.tsx`, `viral-left.tsx`).
 */
export function ViralDashboard({ loaded, search }: { loaded: ViralLoaded; search: ViralDashboardSearch }) {
  const router = useRouter()
  const section = viralSectionOf(search)
  const overview = section === "overview"
  const leftSide = useViralLeft({ section, narrowed: { project: search.project, folder: search.folder } })
  const { refreshFigures, widgets } = leftSide

  const onChanged = React.useCallback(async () => {
    await router.invalidate()
  }, [router])
  const firstLoad = React.useRef(loaded)
  React.useEffect(() => {
    if (loaded === firstLoad.current) return
    refreshFigures()
  }, [loaded, refreshFigures])

  const { place, frame, setRightSpot } = useCrmFrame<ViralSection>(section)
  const props = { search, frame, onChanged }

  let middle: React.ReactNode
  if (loaded.section !== section) {
    // The address moved on and its row is still being read.
    middle = null
  } else if (loaded.section === "projects") {
    middle = <ProjectsSection key="projects" {...props} data={loaded} onNewProject={leftSide.openNewProject} />
  } else if (loaded.section === "vault") {
    middle = <VaultSection key="vault" {...props} data={loaded} />
  } else if (loaded.section === "hooks") {
    middle = <HooksSection key="hooks" {...props} data={loaded} />
  } else if (loaded.section === "formats") {
    middle = <FormatsSection key="formats" {...props} data={loaded} />
  } else {
    middle = widgets.layout ? (
      <ViralOverview layout={widgets.layout} onChange={widgets.change} projectId={search.project} />
    ) : widgets.error ? (
      <ErrorRow message={widgets.error} onRetry={widgets.retry} />
    ) : null
  }

  const recordLabel = place?.rightLabel || "Record"

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <RightCoverProvider value={leftSide.coverUrl}>
        <ManageWidgetsProvider value={leftSide.manageWidgets}>
          <ThreePanels
            layoutKey={overview ? VIRAL_OVERVIEW_LAYOUT_KEY : VIRAL_DASHBOARD_LAYOUT_KEY}
            place={{
              key: VIRAL_PLACE_KEY,
              search,
              ids: place?.ids ?? [],
              ready: overview || place !== null,
              section,
            }}
            showMiddleFor={`${section}|${place?.showMiddleFor ?? ""}`}
            showRightFor={place?.showRightFor}
            reopenInHeader={!overview}
            left={{ label: "Page", showLabel: "Show the page", content: leftSide.left }}
            middle={{
              label: VIRAL_SECTION_LABELS[section],
              bare: overview,
              content: (
                <div
                  className={cn(
                    "@container flex h-full min-h-0 flex-col overflow-hidden [&_td[colspan]]:whitespace-normal",
                    !overview && ["bg-card", middleGutterClassName]
                  )}
                >
                  {middle}
                </div>
              ),
            }}
            right={
              overview
                ? undefined
                : {
                    label: recordLabel,
                    showLabel: place?.rightShowLabel || `Show the ${recordLabel.toLowerCase()}`,
                    content: <div ref={setRightSpot} className="flex h-full min-h-0 flex-col" />,
                  }
            }
          />
        </ManageWidgetsProvider>
      </RightCoverProvider>
      {leftSide.windows}
    </div>
  )
}
