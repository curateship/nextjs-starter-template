import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { DEFAULT_TASK_FILTER } from "@/app/constants"
import { listResources } from "@/app/native/resources"
import { readableError } from "@/app/path"
import {
  taskMatchesFilter,
  taskStatusFilterOptions,
} from "@/app/resources"
import type { DocItem, SkillItem, TaskItem, TaskStatus } from "@/app/types"

type ResourceSnapshot = {
  docs: DocItem[]
  skills: SkillItem[]
  tasks: TaskItem[]
}

type UseWorkspaceResourcesOptions = {
  activeWorkspaceId: string
  activeWorkspaceIdRef: { current: string }
  onError: (message: string) => void
  onRefreshGit?: (workspaceId: string) => void
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
  const resourcesRef = useRef<ResourceSnapshot>({ docs: [], skills: [], tasks: [] })

  useEffect(() => {
    resourcesRef.current = { docs, skills, tasks }
  }, [docs, skills, tasks])

  const setResources = useCallback((resources: ResourceSnapshot) => {
    setTasks(resources.tasks)
    setSkills(resources.skills)
    setDocs(resources.docs)
  }, [])

  const resetResources = useCallback(() => {
    setResources({ docs: [], skills: [], tasks: [] })
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
