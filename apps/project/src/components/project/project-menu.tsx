import * as React from "react"
import { ArchiveIcon, ArchiveRestoreIcon, LockIcon, LockOpenIcon } from "lucide-react"

import { ProjectMembersList } from "@/components/project/project-members-card"
import {
  ProjectBannerField,
  ProjectCategoryField,
  ProjectClientField,
  ProjectColorField,
  ProjectDoingLimitField,
  ProjectDueField,
  ProjectNameField,
  ProjectPaceFields,
  ProjectWholeTeamField,
} from "@/components/project/project-settings-fields"
import { useArchiveProject, useSaveProject } from "@/components/project/use-save-project"
import { ProjectTaskTypesFields } from "@/components/project/project-task-types-card"
import { FoldingMenu, MenuAction, MenuLine, MenuSection, useOpenSections } from "@/components/shared/folding-menu"
import type { ProjectPage } from "@/lib/api/project/projects"
import { dayLabel } from "@/lib/project/days"
import { PROJECT_COLOR_LABEL } from "@/lib/project/rules"
import { offeredTypes } from "@/lib/project/task-types"

type Section =
  | "name"
  | "colour"
  | "client"
  | "category"
  | "due"
  | "doing"
  | "everyone"
  | "status"
  | "banner"
  | "members"
  | "templates"

/**
 * The project's ⋮ menu, at the right of its left panel's header, where the
 * cog and its Project settings window were (Tyler, 5 Nov 2026: "Replace the
 * project settings cog with a 3 dot vertical and convert the modal into a
 * dropdown instead"). It is the shell's one ⋮ menu (`FoldingMenu`, the UI
 * standard's "The one dropdown look"), as on Travel's trip page: a folding
 * row per setting, each saving itself, then a line, Lock page and Archive.
 * Lock page makes the project's page in the left panel read only, even for
 * the site admin, until Unlock page (Tyler, 5 Nov 2026: "add a function here
 * to lock the tip tap"). It opens to
 * the right of the ⋮, over the board ("dropdown align on right").
 *
 * The Projects table still opens the same fields as a window from a row
 * (`ProjectSettingsDialog`). Fields save as they are left, so the one being
 * typed in is left before the menu shuts.
 */
export function ProjectMenu({ page }: { page: ProjectPage }) {
  const { project } = page
  const [open, setOpen] = React.useState(false)
  const [shown, toggle] = useOpenSections<Section>()
  const archive = useArchiveProject(project)
  const lock = useSaveProject(project.id)
  const liveTypes = page.taskTypes.filter((type) => !type.archived)

  function change(next: boolean) {
    if (!next && document.activeElement instanceof HTMLElement) document.activeElement.blur()
    setOpen(next)
  }

  const row = (section: Section) => ({ open: shown.has(section), onToggle: () => toggle(section) })

  return (
    <FoldingMenu label="Project settings" align="start" open={open} onOpenChange={change}>
      {project.archived ? (
        <p className="px-2.5 py-1.5 text-muted-foreground">Archived, so nothing here can change. Bring it back to work on it.</p>
      ) : null}
      <MenuSection label="Name" value={project.name} {...row("name")}>
        <ProjectNameField project={project} bare />
      </MenuSection>
      <MenuSection label="Colour" value={PROJECT_COLOR_LABEL[project.color]} {...row("colour")}>
        <ProjectColorField project={project} bare />
      </MenuSection>
      <MenuSection label="Client" value={project.client ?? "None"} {...row("client")}>
        <ProjectClientField project={project} names={page.teamClients} bare />
      </MenuSection>
      <MenuSection label="Category" value={project.category ?? "None"} {...row("category")}>
        <ProjectCategoryField project={project} names={page.siteCategories} bare />
      </MenuSection>
      <MenuSection label="Due date" value={project.dueDate ? dayLabel(project.dueDate) : "None"} {...row("due")}>
        <ProjectDueField project={project} bare />
      </MenuSection>
      <MenuSection
        label="Doing per person"
        value={project.doingLimit ? String(project.doingLimit) : "No limit"}
        {...row("doing")}
      >
        <ProjectDoingLimitField project={project} bare />
      </MenuSection>
      <MenuSection label="Everyone on the team" value={project.wholeTeam ? "On" : "Off"} {...row("everyone")}>
        <ProjectWholeTeamField project={project} bare />
      </MenuSection>
      <MenuSection
        label="Status"
        value={`Slowing ${project.slowingAt} · Behind ${project.behindAt}`}
        {...row("status")}
      >
        <ProjectPaceFields project={project} />
      </MenuSection>
      <MenuSection label="Banner" value={project.bannerUrl ? "Added" : "None"} {...row("banner")}>
        <ProjectBannerField project={project} bare />
      </MenuSection>
      <MenuSection label="Members" value={String(page.members.length)} {...row("members")}>
        <div className="grid gap-4">
          <ProjectMembersList page={page} bare />
        </div>
      </MenuSection>
      {liveTypes.length > 0 ? (
        <MenuSection
          label="Task templates"
          value={`${offeredTypes(page.taskTypes, project.hiddenTypeIds).length} of ${liveTypes.length}`}
          {...row("templates")}
        >
          <div className="grid gap-4">
            <ProjectTaskTypesFields page={page} />
          </div>
        </MenuSection>
      ) : null}
      <MenuLine />
      <MenuAction
        icon={project.notesLocked ? <LockOpenIcon className="size-4" /> : <LockIcon className="size-4" />}
        disabled={project.archived || lock.busy}
        onClick={() =>
          void lock.save(
            { notesLocked: !project.notesLocked },
            project.notesLocked ? "Page unlocked." : "Page locked. Nobody can change it until it's unlocked."
          )
        }
      >
        {project.notesLocked ? "Unlock page" : "Lock page"}
      </MenuAction>
      <MenuAction
        icon={project.archived ? <ArchiveRestoreIcon className="size-4" /> : <ArchiveIcon className="size-4" />}
        disabled={archive.busy}
        onClick={() => void archive.toggle()}
      >
        {project.archived ? "Bring back" : "Archive project"}
      </MenuAction>
    </FoldingMenu>
  )
}
