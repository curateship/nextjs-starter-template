import { DEFAULT_TASK_FILTER, DONE_TASK_STATUS, SHARED_SKILLS_PATH } from "@/app/constants"
import type { DocItem, FileEntry, SkillItem, TaskItem, TaskStatus } from "@/app/types"
import { fileName, parentPath } from "@/app/path"

export function taskFileEntry(task: TaskItem): FileEntry {
  return { name: fileName(task.path), path: task.path, isDir: false }
}

export function taskMatchesFilter(task: TaskItem, filter: TaskStatus) {
  if (filter === DEFAULT_TASK_FILTER) return task.status !== DONE_TASK_STATUS
  return task.status === filter
}

export function taskStatusFilterOptions(tasks: TaskItem[], currentFilter: TaskStatus) {
  const statuses = new Set<TaskStatus>([
    DEFAULT_TASK_FILTER,
    DONE_TASK_STATUS,
    currentFilter,
  ])

  for (const task of tasks) {
    if (task.status) statuses.add(task.status)
  }

  const dynamicStatuses = Array.from(statuses)
    .filter((status) => status !== DEFAULT_TASK_FILTER && status !== DONE_TASK_STATUS)
    .sort((left, right) => taskStatusLabel(left).localeCompare(taskStatusLabel(right)))

  return [DEFAULT_TASK_FILTER, ...dynamicStatuses, DONE_TASK_STATUS]
}

export function taskStatusLabel(status: TaskStatus) {
  if (status === DEFAULT_TASK_FILTER) return "Active"
  if (status === DONE_TASK_STATUS) return "Done"

  const words = status.trim().split(/[\s_-]+/).filter(Boolean)
  return words.length
    ? words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ")
    : "Active"
}

export function skillFolderEntry(skill: SkillItem): FileEntry {
  const path = parentPath(skill.path)
  return { name: fileName(path), path, isDir: true }
}

export function skillSlugFromPath(path: string) {
  return path.startsWith(`${SHARED_SKILLS_PATH}/`) ? path.split("/")[2] : ""
}

export function docFileEntry(doc: DocItem): FileEntry {
  return { name: fileName(doc.path), path: doc.path, isDir: false }
}

export function ensureMarkdownPath(path: string) {
  return path.toLowerCase().endsWith(".md") ? path : `${path}.md`
}

export function resourceNameFromPath(path: string) {
  return fileName(path).replace(/\.md$/i, "")
}
