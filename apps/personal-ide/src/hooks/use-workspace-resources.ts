import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { DEFAULT_TASK_FILTER } from "@/app/constants"
import { listResources } from "@/app/native/resources"
import { readableError } from "@/app/path"
import {
  taskMatchesFilter,
  taskStatusFilterOptions,
} from "@/app/resources"
import type {
  DocItem,
  GitRefreshMode,
  ResourceFolders,
  SkillItem,
  TaskItem,
  TaskStatus,
} from "@/app/types"

type ResourceSnapshot = {
  docs: DocItem[]
  folders: ResourceFolders
  skills: SkillItem[]
  tasks: TaskItem[]
}

const EMPTY_FOLDERS: ResourceFolders = { tasks: [], skills: [], docs: [] }

type UseWorkspaceResourcesOptions = {
  activeWorkspaceId: string
  activeWorkspaceIdRef: { current: string }
  onError: (message: string) => void
  onRefreshGit?: (workspaceId: string, mode?: GitRefreshMode) => void
}

export function useWorkspaceResources({
  activeWorkspaceId,
  activeWorkspaceIdRef,
  onError,
  onRefreshGit,
}: UseWorkspaceResourcesOptions) {
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [taskFilter, setTaskFilter] = useState<TaskStatus>(DEFAULT_TASK_FILTER)
  const [skills, setSkills] = useState<SkillItem[]>([])
  const [skillFilter, setSkillFilter] = useState("all")
  const [docs, setDocs] = useState<DocItem[]>([])
  const [resourceFolders, setResourceFolders] = useState<ResourceFolders>(EMPTY_FOLDERS)
  const resourcesRef = useRef<ResourceSnapshot>({
    docs: [],
    folders: EMPTY_FOLDERS,
    skills: [],
    tasks: [],
  })

  useEffect(() => {
    resourcesRef.current = { docs, folders: resourceFolders, skills, tasks }
  }, [docs, resourceFolders, skills, tasks])

  const setResources = useCallback((resources: ResourceSnapshot) => {
    setTasks((current) => tasksEqual(current, resources.tasks) ? current : resources.tasks)
    setSkills((current) => skillsEqual(current, resources.skills) ? current : resources.skills)
    setDocs((current) => docsEqual(current, resources.docs) ? current : resources.docs)
    setResourceFolders((current) => (
      foldersEqual(current, resources.folders) ? current : resources.folders
    ))
  }, [])

  const resetResources = useCallback(() => {
    setResources({ docs: [], folders: EMPTY_FOLDERS, skills: [], tasks: [] })
  }, [setResources])

  const refreshResources = useCallback(async function refreshResources(
    workspaceId = activeWorkspaceId
  ) {
    if (!workspaceId) return

    try {
      const next = await listResources(workspaceId)
      if (activeWorkspaceIdRef.current !== workspaceId) return

      setResources(next)
      onRefreshGit?.(workspaceId)
    } catch (error) {
      if (activeWorkspaceIdRef.current !== workspaceId) return
      onError(readableError(error))
    }
  }, [activeWorkspaceId, activeWorkspaceIdRef, onError, onRefreshGit, setResources])

  const taskStatusOptions = useMemo(
    () => taskStatusFilterOptions(tasks, taskFilter),
    [tasks, taskFilter]
  )
  const visibleTasks = useMemo(
    () => tasks.filter((task) => taskMatchesFilter(task, taskFilter)),
    [taskFilter, tasks]
  )
  const visibleSkills = useMemo(
    () => skills.filter((skill) => skillFilter === "all" || skill.tags?.includes(skillFilter)),
    [skillFilter, skills]
  )

  return {
    docs,
    refreshResources,
    resetResources,
    resourceFolders,
    resourcesRef,
    setResources,
    skillFilter,
    skills,
    setSkillFilter,
    setTaskFilter,
    taskFilter,
    tasks,
    taskStatusOptions,
    visibleSkills,
    visibleTasks,
  }
}

function foldersEqual(left: ResourceFolders, right: ResourceFolders) {
  const sameList = (a: string[], b: string[]) =>
    arraysEqual(a, b, (item, next) => item === next)
  return (
    sameList(left.tasks, right.tasks) &&
    sameList(left.skills, right.skills) &&
    sameList(left.docs, right.docs)
  )
}

function docsEqual(left: DocItem[], right: DocItem[]) {
  return arraysEqual(left, right, (doc, next) => (
    doc.name === next.name && doc.path === next.path
  ))
}

function skillsEqual(left: SkillItem[], right: SkillItem[]) {
  return arraysEqual(left, right, (skill, next) => (
    skill.name === next.name &&
    skill.slug === next.slug &&
    skill.path === next.path &&
    arraysEqual(skill.tags, next.tags, (tag, nextTag) => tag === nextTag)
  ))
}

function tasksEqual(left: TaskItem[], right: TaskItem[]) {
  return arraysEqual(left, right, (task, next) => (
    task.title === next.title &&
    task.path === next.path &&
    task.status === next.status &&
    task.skill === next.skill &&
    task.error === next.error
  ))
}

function arraysEqual<T>(
  left: T[],
  right: T[],
  itemEqual: (leftItem: T, rightItem: T) => boolean
) {
  if (left.length !== right.length) return false

  return left.every((item, index) => itemEqual(item, right[index]))
}
