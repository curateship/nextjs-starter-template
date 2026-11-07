/**
 * Where Project's screens remember their layout in this browser. Kept here
 * rather than in the shell's `panelLayoutKey` list, because that list is a
 * shell file and an app never edits one.
 *
 * The `-2` is deliberate: a remembered layout outranks the default, so a
 * browser that kept the old widths would never show new defaults. Changing
 * the key drops the old widths once. Bump it again whenever the defaults in
 * `three-panels.tsx` move (Tyler, 31 Oct 2026, after the narrowest-width
 * default "is not fixed for the 5th time").
 */
export const PROJECT_PANEL_LAYOUT_KEY = "project-page-horizontal-2"
export const MY_DASHBOARD_PANEL_LAYOUT_KEY = "project-my-dashboard-horizontal-2"
export const ADMIN_DASHBOARD_PANEL_LAYOUT_KEY = "project-admin-dashboard-horizontal-2"
export const TEAM_PANEL_LAYOUT_KEY = "project-team-dashboard-horizontal-2"

/** The Board or List tab the project page opened on last. */
export const PROJECT_TASK_VIEW_KEY = "project-page-task-view"
/** My dashboard's Board, List, Calendar or Timeline, remembered in this browser. */
export const MY_TASK_VIEW_KEY = "project-my-dashboard-task-view"
/** The task My dashboard had open last, opened again on arrival. */
export const MY_OPEN_TASK_KEY = "project-my-dashboard-open-task"
/** The task the site admin's My dashboard had open last. */
export const ADMIN_OPEN_TASK_KEY = "project-admin-dashboard-open-task"
/** The task a project's page had open last, per project. */
export const projectOpenTaskKey = (projectId: string) => `project-page-open-task-${projectId}`
/** The task the Team dashboard had open last, per team, or on an employee's own `/team`. */
export const teamOpenTaskKey = (teamId: string | undefined) => `project-team-open-task-${teamId ?? "own"}`

/** The project New task in the header chose last, so it is chosen first next time. */
export const NEW_TASK_PROJECT_KEY = "project-new-task-project"


/** The Board's "Group by person" switch, remembered in this browser. */
export const BOARD_GROUP_KEY = "project-board-group"

/** What a project's List and Timeline group by, from Filter's Group row, kept per project. */
export const taskGroupingKey = (projectId: string) => `project-task-grouping-${projectId}`

/** The List headings folded shut on a project, per grouping, since a heading's key only means something in its own. */
export const taskFoldsKey = (projectId: string, grouping: string) => `project-task-folds-${projectId}-${grouping}`

/** The headings folded shut on My dashboard's List, the employee's rows and the site admin's table alike. */
export const MY_TASK_FOLDS_KEY = "project-my-dashboard-task-folds"
/** The headings folded shut in the site admin's Need your attention tab. */
export const MY_ATTENTION_FOLDS_KEY = "project-my-dashboard-attention-folds"
/** My dashboard's Group row, remembered in this browser. */
export const MY_TASK_GROUPING_KEY = "project-my-dashboard-task-grouping"

/** The headings folded shut on the Team dashboard's Tasks tab, per grouping, and its Group row. */
export const TEAM_TASK_FOLDS_KEY = "project-team-task-folds"
export const TEAM_TASK_GROUPING_KEY = "project-team-task-grouping"

/** The Team dashboard's middle tab (Tasks, Calendar or Activity) and the calendar's Month or Week. */
export const TEAM_MIDDLE_TAB_KEY = "project-team-middle-tab"
export const TEAM_CALENDAR_VIEW_KEY = "project-team-calendar-view"
