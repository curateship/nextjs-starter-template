import type { ProjectColumn } from "@/components/project/task-list"
import type { ProjectChoice } from "@/components/project/task-cell-menus"
import type { AdminDashboard } from "@/lib/api/project/admin-dashboard"
import { PERSONAL_PROJECT_ID, PERSONAL_PROJECT_NAME } from "@/lib/project/rules"

/**
 * The table's Project chip: the project's own name and colour. Every task's
 * dropdown is the same (Tyler, 23 Oct 2026: "all should be this"): Just me,
 * then every team's open projects under the team's name, the task's own
 * project ticked.
 */
export function adminProjectColumn(dashboard: Pick<AdminDashboard, "projectInfo">): ProjectColumn {
  const { projectInfo } = dashboard
  const movable = Object.entries(projectInfo)
    .filter(([, info]) => info.movable)
    .sort(([, a], [, b]) => (a.teamName ?? "").localeCompare(b.teamName ?? "") || a.name.localeCompare(b.name))
  // Their own list, or its stand-in id before it exists (made on the first move into it).
  const ownId = Object.entries(projectInfo).find(([, info]) => info.teamName === null)?.[0] ?? PERSONAL_PROJECT_ID
  const all: ProjectChoice[] = [
    { id: ownId, name: PERSONAL_PROJECT_NAME, color: "slate", group: null },
    ...movable.map(([id, info]) => ({ id, name: info.name, color: info.color, group: info.teamName })),
  ]
  return {
    of: (task) => projectInfo[task.projectId] ?? { name: task.projectName, color: "slate" },
    choices: () => all,
  }
}
