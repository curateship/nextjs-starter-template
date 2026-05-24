export const ugcModuleKey = "ugc-ad-video"

export type UGCWorkflowInput = {
  actorImageUrl: string
  actorNotes?: string
  productName: string
  audience: string
  offer: string
  productNotes?: string
  productMediaUrl?: string
  hook?: string
  script?: string
  prompt: string
  voiceTone: string
  consentConfirmed: boolean
}

export type VideoGenerationSettings = {
  aspectRatio: "9:16" | "1:1" | "16:9"
  durationSeconds: number
  resolution: "720p" | "1080p"
  nativeAudio: boolean
}

export type WorkflowStep = {
  id: string
  label: string
  required: boolean
}

export type WorkflowModule = {
  key: string
  label: string
  steps: WorkflowStep[]
  allowedProviders: string[]
  defaultSettings: VideoGenerationSettings
}

export const ugcWorkflow: WorkflowModule = {
  key: ugcModuleKey,
  label: "UGC Ad Video",
  allowedProviders: ["seedance"],
  defaultSettings: {
    aspectRatio: "9:16",
    durationSeconds: 8,
    resolution: "720p",
    nativeAudio: true,
  },
  steps: [
    { id: "actor", label: "Actor", required: true },
    { id: "product", label: "Product", required: true },
    { id: "script", label: "Script", required: true },
    { id: "voice", label: "Voice", required: true },
  ],
}

const workflows = [ugcWorkflow]

export function listWorkflowModules() {
  return workflows
}

export function getWorkflowModule(key: string) {
  const module = workflows.find((workflow) => workflow.key === key)
  if (!module) {
    throw new Error("Workflow module not found")
  }
  return module
}

export function createInitialSteps() {
  return {
    writing_prompt: "done",
    generating: "active",
    saving: "pending",
    complete: "pending",
  }
}

export function createFailedSteps() {
  return {
    writing_prompt: "done",
    generating: "failed",
    saving: "pending",
    complete: "pending",
  }
}

export function createSucceededSteps() {
  return {
    writing_prompt: "done",
    generating: "done",
    saving: "done",
    complete: "done",
  }
}
