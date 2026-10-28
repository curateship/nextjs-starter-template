import type { ShellSection } from "@/lib/custom-shell"

/**
 * Project's dashboards in the left menu: My dashboard, Projects, Team and
 * Task types. The members' and admins' menus get it from a background job
 * (`src/server/project/navigation.ts`); an employee's menu starts as it
 * (`roles` in `src/app/options.ts`).
 */

export const PROJECT_NAV_SECTION_ID = "section-project"
export const TASK_TYPES_ITEM_ID = "item-project-task-types"
export const MY_DASHBOARD_ITEM_ID = "item-project-dashboard"
export const TEAM_ITEM_ID = "item-project-team"

export function taskTypesItem(): ShellSection["entries"][number] {
  return {
    type: "item",
    id: TASK_TYPES_ITEM_ID,
    label: "Task templates",
    href: "/task-types",
    icon: "shapes",
    visible: true,
  }
}

export function projectNavSection(): ShellSection {
  return {
    id: PROJECT_NAV_SECTION_ID,
    title: "Work",
    entries: [
      {
        type: "item",
        id: MY_DASHBOARD_ITEM_ID,
        label: "My dashboard",
        href: "/dashboard",
        icon: "layout-dashboard",
        visible: true,
      },
      {
        type: "item",
        id: "item-project-projects",
        label: "Projects",
        href: "/projects",
        icon: "folder-kanban",
        visible: true,
      },
      {
        type: "item",
        id: TEAM_ITEM_ID,
        label: "Team",
        href: "/team",
        icon: "users",
        visible: true,
      },
      taskTypesItem(),
    ],
  }
}
