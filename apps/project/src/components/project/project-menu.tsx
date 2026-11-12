import { ArchiveIcon, ArchiveRestoreIcon } from "lucide-react"

import { ProjectMembersList } from "@/components/project/project-members-card"
import { CoverRow } from "@/components/shared/notes/page-rows"
import {
  ProjectCategoryField,
  ProjectClientField,
  ProjectDoingLimitField,
  ProjectNameField,
  ProjectPaceFields,
  ProjectWholeTeamField,
} from "@/components/project/project-settings-fields"
import { useArchiveProject, useSaveProject } from "@/components/project/use-save-project"
import { TabbedMenu } from "@/components/shared/notes/tabbed-menu"
import { PickDayRow, PickGroup, PickMenuRow, PickRow } from "@/components/project/pick-rows"
import { ProjectDot } from "@/components/project/task-bits"
import { Button } from "@/components/ui/button"
import { LockRow } from "@/components/shared/notes/page-rows"
import type { ProjectPage } from "@/lib/api/project/projects"
import { dayLabel } from "@/lib/project/days"
import { PROJECT_COLOR_LABEL, PROJECT_COLORS, type ProjectColor } from "@/lib/project/rules"

/**
 * The project's ⋮ menu, at the right of its left panel's header, where the
 * cog and its Project settings window were (Tyler, 5 Nov 2026: "Replace the
 * project settings cog with a 3 dot vertical and convert the modal into a
 * dropdown instead"). Since 6 Nov 2026 it is the tabbed ⋮ My settings is (the
 * Admin 3 panel design): General is grouped rows (Project, Page, Schedule), each
 * picking in one press where there is a choice and opening a small box for a
 * typed value, then Lock page and Archive; Members is a tab.
 * Lock page makes the project's page in the left panel read only, even for
 * the site admin, until Unlock page (Tyler, 5 Nov 2026: "add a function here
 * to lock the tip tap"). It opens to the right of the ⋮, over the board
 * ("dropdown align on right").
 *
 * The Projects table still opens the same fields as a window from a row
 * (`ProjectSettingsDialog`). Fields save as they are left, so the one being
 * typed in is left before the menu shuts.
 */
export function ProjectMenu({ page }: { page: ProjectPage }) {
  const { project } = page
  const archive = useArchiveProject(project)
  const lock = useSaveProject(project.id)
  const { save } = useSaveProject(project.id)
  const cover = useSaveProject(project.id)
  const off = project.archived
  const row = "w-full justify-start font-normal"

  const general = (
    <div className="grid gap-5 px-4 py-3">
      {off ? (
        <p className="text-sm text-muted-foreground">Archived, so nothing here can change. Bring it back to work on it.</p>
      ) : null}
      <PickGroup title="Project">
        <PickRow label="Name" disabled={off} value={project.name}>
          <ProjectNameField project={project} bare />
        </PickRow>
        <PickMenuRow
          label="Colour"
          disabled={off}
          value={
            <>
              <ProjectDot color={project.color} />
              {PROJECT_COLOR_LABEL[project.color]}
            </>
          }
          selected={project.color}
          onPick={(color) => void save({ color: color as ProjectColor })}
          options={PROJECT_COLORS.map((color) => ({
            value: color,
            label: (
              <>
                <ProjectDot color={color} />
                {PROJECT_COLOR_LABEL[color]}
              </>
            ),
          }))}
        />
        <PickRow label="Client" disabled={off} empty={!project.client} value={project.client ?? "None"}>
          <ProjectClientField project={project} names={page.teamClients} bare />
        </PickRow>
        <PickRow label="Category" disabled={off} empty={!project.category} value={project.category ?? "None"}>
          <ProjectCategoryField project={project} names={page.siteCategories} bare />
        </PickRow>
      </PickGroup>
      {/* The page's cover, as every page in the shell's design has it (8 Nov 2026):
          None, Sky, the pictures it has had, and + for another. */}
      {off ? null : (
        <PickGroup title="Page">
          <CoverRow
            cover={{
              url: project.bannerUrl,
              images: project.coverImages,
              busy: cover.busy,
              set: ({ url, images }) =>
                void cover.save({ bannerUrl: url ?? "", coverImages: images }),
            }}
          />
        </PickGroup>
      )}
      <PickGroup title="Schedule">
        <PickDayRow
          label="Due date"
          disabled={off}
          empty={!project.dueDate}
          value={project.dueDate ? dayLabel(project.dueDate) : "None"}
          day={project.dueDate}
          clearLabel="No due date"
          onPick={(dueDate) => void save({ dueDate })}
        />
        <PickRow label="Status" disabled={off} value={`Slowing ${project.slowingAt} · Behind ${project.behindAt}`}>
          <ProjectPaceFields project={project} />
        </PickRow>
        <PickRow
          label="Doing per person"
          disabled={off}
          empty={!project.doingLimit}
          value={project.doingLimit ? String(project.doingLimit) : "No limit"}
        >
          <ProjectDoingLimitField project={project} bare />
        </PickRow>
        <PickRow label="Everyone on the team" disabled={off} value={project.wholeTeam ? "On" : "Off"}>
          <ProjectWholeTeamField project={project} bare />
        </PickRow>
      </PickGroup>
      <div className="-mx-2 grid gap-1 [&_[data-slot=button]]:font-normal">
        <Button type="button" variant="ghost" className={row} disabled={archive.busy} onClick={() => void archive.toggle()}>
          {project.archived ? <ArchiveRestoreIcon className="size-4" /> : <ArchiveIcon className="size-4" />}
          {project.archived ? "Bring back" : "Archive project"}
        </Button>
      </div>
    </div>
  )

  return (
    <TabbedMenu
      label="Project settings"
      align="start"
      width="20.4rem"
      tabs={[
        {
          value: "general",
          label: "General",
          content: general,
          // Lock blocks is the tab's footer, as on the shell's left page ⋮. An archived project's page can't change.
          footer: off ? undefined : (
            <LockRow
              locked={project.notesLocked}
              busy={lock.busy}
              onLock={(notesLocked) => void lock.save({ notesLocked })}
            />
          ),
        },
        {
          value: "members",
          label: "Members",
          content: (
            <div className="grid gap-4 px-4 py-3">
              <ProjectMembersList page={page} bare />
            </div>
          ),
        },
      ]}
    />
  )
}
