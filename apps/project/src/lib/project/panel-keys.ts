/**
 * Where Project's screens remember their layout in this browser. Kept here
 * rather than in the shell's `panelLayoutKey` list, because that list is a
 * shell file and an app never edits one.
 */
export const PROJECT_PANEL_LAYOUT_KEY = "project-page-horizontal"
export const MY_DASHBOARD_PANEL_LAYOUT_KEY = "project-my-dashboard-horizontal"
export const ADMIN_DASHBOARD_PANEL_LAYOUT_KEY = "project-admin-dashboard-horizontal"
export const TEAM_PANEL_LAYOUT_KEY = "project-team-dashboard-horizontal"
export const TASK_TYPES_PANEL_LAYOUT_KEY = "project-task-types-horizontal"

/** The Board or List tab the project page opened on last. */
export const PROJECT_TASK_VIEW_KEY = "project-page-task-view"
/** My dashboard's Board, List, Calendar or Timeline, remembered in this browser. */
export const MY_TASK_VIEW_KEY = "project-my-dashboard-task-view"
/** The task My dashboard had open last, opened again on arrival. */
export const MY_OPEN_TASK_KEY = "project-my-dashboard-open-task"
/** The task the site admin's My dashboard had open last. */
export const ADMIN_OPEN_TASK_KEY = "project-admin-dashboard-open-task"

/** The field columns a project's List shows when filtered to one task type, per type. */
export const fieldColumnsKey = (typeId: string) => `project-type-columns-${typeId}`

/** Whether every project's List shows the Time column (Task panel task 01, part 9). */
export const LIST_TIME_COLUMN_KEY = "project-list-time-column"
/** The Projects table's Time column, off until picked (Seven features, part 4). */
export const PROJECTS_TIME_COLUMN_KEY = "project-projects-time-column"

/** The project New task in the header chose last, so it is chosen first next time. */
export const NEW_TASK_PROJECT_KEY = "project-new-task-project"

/** The Team dashboard's right-hand tab opened last: Check-ins, Workload or Needs attention. */
export const TEAM_RIGHT_TAB_KEY = "project-team-right-tab"

/** The Board's "Group by person" switch, remembered in this browser. */
export const BOARD_GROUP_KEY = "project-board-group"

/** What a project's List and Timeline group by, from Filter's Group row, kept per project. */
export const taskGroupingKey = (projectId: string) => `project-task-grouping-${projectId}`

/** The List headings folded shut on a project, per grouping, since a heading's key only means something in its own. */
export const taskFoldsKey = (projectId: string, grouping: string) => `project-task-folds-${projectId}-${grouping}`

/** The headings folded shut on My dashboard's List, the employee's rows and the site admin's table alike. */
export const MY_TASK_FOLDS_KEY = "project-my-dashboard-task-folds"

/** The Team dashboard's middle tab (Calendar or Activity) and the calendar's Month or Week. */
export const TEAM_MIDDLE_TAB_KEY = "project-team-middle-tab"
export const TEAM_CALENDAR_VIEW_KEY = "project-team-calendar-view"
