import { invoke } from "@tauri-apps/api/core"

import { DOCS_PATH, SHARED_SKILLS_PATH, TASKS_PATH } from "@/app/constants"
import type { DocItem, ResourceFolders, SkillItem, TaskItem } from "@/app/types"

export function listResources(workspaceId: string) {
  return Promise.all([
    invoke<TaskItem[]>("list_tasks", { workspaceId }),
    invoke<SkillItem[]>("list_skills", { workspaceId }),
    invoke<DocItem[]>("list_docs", { workspaceId }),
    invoke<string[]>("list_resource_folders", { workspaceId, base: TASKS_PATH }),
    invoke<string[]>("list_resource_folders", { workspaceId, base: SHARED_SKILLS_PATH }),
    invoke<string[]>("list_resource_folders", { workspaceId, base: DOCS_PATH }),
  ]).then(([tasks, skills, docs, taskFolders, skillFolders, docFolders]) => ({
    tasks,
    skills,
    docs,
    folders: {
      tasks: taskFolders,
      skills: skillFolders,
      docs: docFolders,
    } satisfies ResourceFolders,
  }))
}

export function createTask(workspaceId: string, title: string, folder?: string) {
  return invoke<TaskItem>("create_task", { workspaceId, title, folder: folder || null })
}

export function createSkill(workspaceId: string, name: string, folder?: string) {
  return invoke<SkillItem>("create_skill", { workspaceId, name, folder: folder || null })
}

export function createDoc(workspaceId: string, title: string, folder?: string) {
  return invoke<DocItem>("create_doc", { workspaceId, title, folder: folder || null })
}
