import * as React from "react"
import { useNavigate, useRouter } from "@tanstack/react-router"

import type { ViralLoaded } from "@/components/viral/dashboard/load-section"
import { FormatsSection } from "@/components/viral/dashboard/sections/formats-section"
import { HooksSection } from "@/components/viral/dashboard/sections/hooks-section"
import { VaultSection } from "@/components/viral/dashboard/sections/vault-section"
import { researchSearchOf, withOpen } from "@/lib/content-app/research-search"
import { useCrmFrame } from "@/components/crm/crm-frame"
import { RightCoverProvider } from "@/components/shared/notes/page-cover"
import { middleGutterClassName, ThreePanels } from "@/components/shared/three-panels"
import { ManageWidgetsProvider } from "@/components/shared/widgets/widget-menus"
import { useProjectsLeft } from "@/components/content-app/projects-left"
import { AccountsSection } from "@/components/social/projects-dashboard/accounts-section"
import { MessagesSection } from "@/components/social/projects-dashboard/messages-section"
import { ProjectsOverview } from "@/components/social/projects-dashboard/projects-overview"
import { ProjectsSectionList } from "@/components/social/projects-dashboard/projects-section"
import { ErrorRow } from "@/components/ui/error-row"
import type { ArchiveProjectRow } from "@/lib/api/archive/items"
import type { InboxRow } from "@/lib/api/social/phone-apps"
import type { ProjectRow } from "@/lib/api/social/projects"
import type { RedditAccountsPage } from "@/lib/api/social/reddit-accounts"
import {
  PROJECTS_SECTION_LABELS,
  sectionOf,
  isResearchSection,
  sectionSearch,
  type ProjectsSearch,
  type ProjectsSection,
} from "@/lib/social/projects-dashboard-search"
import {
  PROJECTS_DASHBOARD_LAYOUT_KEY,
  PROJECTS_OVERVIEW_LAYOUT_KEY,
  PROJECTS_PLACE_KEY,
} from "@/lib/social/panel-keys"
import { cn } from "@/lib/utils"

/** What the route reads for every section at once, so each Dashboards row has its count from the start. */
export type ProjectsDashboardData = {
  projects: ProjectRow[]
  accounts: RedditAccountsPage
  messages: InboxRow[]
  archive: ArchiveProjectRow[]
  /** Research's Vault, Hooks or Formats, read when one of them shows; null otherwise (`content-app.md`). */
  research: ViralLoaded | null
}

/**
 * The Projects dashboard (Tyler, 12 Nov 2026: "We need to consolidate
 * projects, voices, accounts, archive and messages into one cohesive 3 panel
 * design"). Laid out as the Admin dashboard, the CRM and Travel's Trips
 * dashboard are.
 *
 * - **Left:** the person's page of blocks (`useProjectsLeft`). Its fixed
 *   Dashboards and Viral blocks pick the section. Its ⋮ holds General (cover,
 *   Lock blocks) and Widgets. A project's page draws the same left panel.
 * - **Middle:** Overview's widgets straight on the dashboard, taking the
 *   right panel's room too; or a section's list, each in one header and
 *   table shape.
 * - **Right:** the row picked (`?open=`). The first row opens on arrival,
 *   and the dashboard goes back to where it was.
 *
 * The frame stays while the section changes (`useCrmFrame`), so the left
 * page, its ⋮ and anything typed there carry on across a switch. A project
 * opens from its row on the Projects list at `/admin/projects/<id>`, which
 * keeps this left panel and fills the middle and right (Tyler, 27 Nov 2026:
 * "click project > middle and right panel change").
 */
export function ProjectsDashboard({ data, search }: { data: ProjectsDashboardData; search: ProjectsSearch }) {
  const navigate = useNavigate({ from: "/admin/projects" })
  const router = useRouter()
  const section = sectionOf(search)
  const overview = section === "overview"

  const { left, coverUrl, widgets, manageWidgets } = useProjectsLeft({
    section,
    counts: {
      projects: data.projects.length,
      accounts: data.accounts.accounts.filter((account) => !account.retiredAt).length,
      messages: data.messages.length,
    },
    onPickSection: (next: ProjectsSection) => void navigate({ search: sectionSearch(next) }),
  })

  const { place, frame, setRightSpot } = useCrmFrame<ProjectsSection>(section)

  let middle: React.ReactNode
  const research = researchSearchOf(search)
  if (research && isResearchSection(section)) {
    // Research's own section screens, as on its dashboard before Content (`content-app.md`).
    const loaded = data.research
    const props = { search: withOpen(research, search), frame, onChanged: () => router.invalidate() }
    middle =
      !loaded || loaded.section !== section ? null : loaded.section === "vault" ? (
        <VaultSection key="vault" {...props} data={loaded} />
      ) : loaded.section === "hooks" ? (
        <HooksSection key="hooks" {...props} data={loaded} />
      ) : loaded.section === "formats" ? (
        <FormatsSection key="formats" {...props} data={loaded} />
      ) : null
  } else if (section === "projects") {
    middle = <ProjectsSectionList key="projects" projects={data.projects} search={search} projectId="" frame={frame} />
  } else if (section === "accounts") {
    middle = <AccountsSection key="accounts" initial={data.accounts} projects={data.projects} search={search} projectId="" frame={frame} />
  } else if (section === "messages") {
    middle = <MessagesSection key="messages" initial={data.messages} search={search} projectId="" frame={frame} />
  } else {
    middle = widgets.layout ? (
      <ProjectsOverview data={data} layout={widgets.layout} onChange={widgets.change} />
    ) : widgets.error ? (
      <ErrorRow message={widgets.error} onRetry={widgets.retry} />
    ) : null
  }

  const recordLabel = place?.rightLabel ?? "Record"

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* The left page's cover carries on behind the record on the right. */}
      <RightCoverProvider value={coverUrl}>
        <ManageWidgetsProvider value={manageWidgets}>
          <ThreePanels
            // Overview is two panels, with a layout of its own.
            layoutKey={overview ? PROJECTS_OVERVIEW_LAYOUT_KEY : PROJECTS_DASHBOARD_LAYOUT_KEY}
            place={{
              key: PROJECTS_PLACE_KEY,
              search,
              ids: place?.ids ?? [],
              // Until the section showing has said which rows it shows.
              ready: overview || place !== null,
              section,
            }}
            showMiddleFor={`${section}|${place?.showMiddleFor ?? ""}`}
            showRightFor={place?.showRightFor}
            reopenInHeader={!overview}
            left={{
              label: "Page",
              showLabel: "Show the page",
              content: left,
            }}
            middle={{
              label: PROJECTS_SECTION_LABELS[section],
              bare: overview,
              content: (
                // The container its tables measure, so their columns drop out as the middle narrows.
                // A list's empty line wraps, so a phone never scrolls sideways to read it.
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
                    showLabel: place?.rightShowLabel ?? `Show the ${recordLabel.toLowerCase()}`,
                    content: <div ref={setRightSpot} className="flex h-full min-h-0 flex-col" />,
                  }
            }
          />
        </ManageWidgetsProvider>
      </RightCoverProvider>
    </div>
  )
}
