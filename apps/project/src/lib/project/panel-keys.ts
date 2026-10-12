/**
 * Where Project's screens remember their layout in this browser. Kept here
 * rather than in the shell's `panelLayoutKey` list, because that list is a
 * shell file and an app never edits one.
 */
export const PROJECT_PANEL_LAYOUT_KEY = "project-page-horizontal"
export const MY_DASHBOARD_PANEL_LAYOUT_KEY = "project-my-dashboard-horizontal"
export const TEAM_PANEL_LAYOUT_KEY = "project-team-dashboard-horizontal"
export const TASK_TYPES_PANEL_LAYOUT_KEY = "project-task-types-horizontal"

/** The Board or List tab the project page opened on last. */
export const PROJECT_TASK_VIEW_KEY = "project-page-task-view"

/** The field columns a project's List shows when filtered to one task type, per type. */
export const fieldColumnsKey = (typeId: string) => `project-type-columns-${typeId}`

/** The project New task in the header chose last, so it is chosen first next time. */
export const NEW_TASK_PROJECT_KEY = "project-new-task-project"

/** The Team dashboard's right-hand tab opened last: Check-ins, Workload or Needs attention. */
export const TEAM_RIGHT_TAB_KEY = "project-team-right-tab"
