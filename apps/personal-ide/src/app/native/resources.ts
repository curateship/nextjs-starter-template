import { invoke } from "@tauri-apps/api/core"

import type { DocItem, SkillItem, TaskItem } from "@/app/types"

export function listResources(workspaceId: string) {
  return Promise.all([
    invoke<TaskItem[]>("list_tasks", { workspaceId }),
    invoke<SkillItem[]>("list_skills", { workspaceId }),
    invoke<DocItem[]>("list_docs", { workspaceId }),
  ]).then(([tasks, skills, docs]) => ({ tasks, skills, docs }))
}

export function createTask(workspaceId: string, title: string) {
  return invoke<TaskItem>("create_task", { workspaceId, title })
}

export function createSkill(workspaceId: string, name: string) {
  return invoke<SkillItem>("create_skill", { workspaceId, name })
}

export function createDoc(workspaceId: string, title: string) {
  return invoke<DocItem>("create_doc", { workspaceId, title })
}
