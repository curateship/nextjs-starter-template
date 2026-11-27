import * as React from "react"

import type { ProjectItem } from "@/lib/api/video/projects"
import type { VideoSpend } from "@/lib/api/video/project-videos"

// The provider lives in project-settings.tsx: a file that exports a component
// may export only components, or fast refresh stops working.

export type ProjectSettingsValue = {
  project: ProjectItem
  /** What the open video has spent, its limit, and the whole project's total. */
  spend: VideoSpend | null
  openSettings: () => void
  /** Reads the spend again, after something in the editor spent money. */
  refreshSpend: () => void
}

export const ProjectSettingsContext = React.createContext<ProjectSettingsValue | null>(
  null
)

export function useProjectSettings() {
  const value = React.useContext(ProjectSettingsContext)
  if (!value) {
    throw new Error("useProjectSettings needs a ProjectSettingsProvider")
  }
  return value
}
