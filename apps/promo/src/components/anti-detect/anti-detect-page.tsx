import type * as React from "react"

import { RACK_APP_BLOCKS, RackBlocksProvider, RackProgramPanel, type RackBlocks } from "@/components/anti-detect/rack-blocks"
import { makeDashboardBlocks, type DashboardBlocks } from "@/components/dashboard-page/dashboard-blocks"
import { DashboardPagePanel, type DashboardPageApi } from "@/components/dashboard-page/dashboard-page-panel"
import type { TabbedMenuState } from "@/components/shared/notes/tabbed-menu"
import { ANTI_DETECT_PROJECTS_NODE, ANTI_DETECT_SECTIONS_NODE } from "@/lib/anti-detect/page"
import {
  ANTI_DETECT_LIST_SECTIONS,
  ANTI_DETECT_SECTION_LABELS,
  ANTI_DETECT_SECTIONS,
  type AntiDetectListSection,
  type AntiDetectSection,
} from "@/lib/anti-detect/search"
import {
  getAntiDetectErrorMessage,
  lockAntiDetectPage,
  saveAntiDetectPage,
  setAntiDetectPageCoverPhoto,
} from "@/lib/api/anti-detect"
import type { StoredPage } from "@/lib/notes/page-body"

export type AntiDetectBlocks = DashboardBlocks<AntiDetectSection, AntiDetectListSection>

/**
 * The Anti Detect dashboard's own "/" blocks (Tyler, 12 Nov 2026):
 * Dashboards (Overview, Profiles, Proxies, Racks, Bans) and Projects, which
 * narrows every section to what one project's accounts use (his answer:
 * "Projects").
 */
const blocks = makeDashboardBlocks<AntiDetectSection, AntiDetectListSection>({
  dashboard: "Anti Detect",
  sections: ANTI_DETECT_SECTIONS,
  listSections: ANTI_DETECT_LIST_SECTIONS,
  labels: ANTI_DETECT_SECTION_LABELS,
  sectionsNode: ANTI_DETECT_SECTIONS_NODE,
  projectsNode: ANTI_DETECT_PROJECTS_NODE,
  sectionsKind: "promo-anti-detect-sections",
  projectsKind: "promo-anti-detect-projects",
  noProjects: "No projects yet. New project on the Projects dashboard makes one.",
})

const API: DashboardPageApi = {
  save: saveAntiDetectPage,
  lock: lockAntiDetectPage,
  setCover: setAntiDetectPageCoverPhoto,
  message: getAntiDetectErrorMessage,
}

/** Every block the page knows: Dashboards and Projects, then the rack blocks. */
const APP_BLOCKS = [...blocks.appBlocks, ...RACK_APP_BLOCKS]

/** The left panel: the shared `DashboardPagePanel` titled Anti Detect, starting with Dashboards, Projects and the rack blocks. */
export function AntiDetectPagePanel({
  blocks: value,
  rackBlocks,
  ...rest
}: {
  page: StoredPage | null
  error: string | null
  onRetry: () => void
  blocks: AntiDetectBlocks
  rackBlocks: RackBlocks
  widgets: React.ReactNode
  menuState: TabbedMenuState
  onPageChange: (page: StoredPage) => void
}) {
  return (
    <DashboardPagePanel
      {...rest}
      title="Anti Detect"
      api={API}
      appBlocks={APP_BLOCKS}
      // The picked rack's program, or each rack's check-in (Tyler, 12 Nov 2026: "Move the rack program into the settings tab").
      extraTabs={[{ value: "rack-program", label: "Rack program", content: <RackProgramPanel blocks={rackBlocks} /> }]}
      blocks={(children) => (
        <blocks.Provider value={value}>
          <RackBlocksProvider value={rackBlocks}>{children}</RackBlocksProvider>
        </blocks.Provider>
      )}
      sectionsBlock={<blocks.SectionsBlock />}
    />
  )
}
