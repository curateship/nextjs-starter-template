import * as React from "react"

import type { ProjectItem, ProjectSpend } from "@/lib/api/video/projects"

// The provider lives in project-settings.tsx: a file that exports a component
// may export only components, or fast refresh stops working.

export type ProjectSettingsValue = {
  project: ProjectItem
  spend: ProjectSpend | null
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

