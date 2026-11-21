import * as React from "react"

import type { ViralProjectScreen } from "@/lib/viral/viral"

/**
 * What every panel of one project's page reads: the screen as loaded, and a
 * way to read it again. Kept in one place, as Travel's trip page does, so the
 * project's ⋮ and the right panel's buttons change the same project.
 */
export type ProjectContextValue = {
  screen: ViralProjectScreen
  refresh: () => Promise<void>
}

const ProjectContext = React.createContext<ProjectContextValue | null>(null)

export const ProjectProvider = ProjectContext.Provider

export function useProject(): ProjectContextValue {
  const value = React.useContext(ProjectContext)
  if (!value) throw new Error("useProject is only for inside a project's page.")
  return value
}
