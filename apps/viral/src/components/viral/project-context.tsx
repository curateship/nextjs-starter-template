import * as React from "react"
import { toast } from "sonner"

import { getViralErrorMessage } from "@/lib/api/viral/viral"
import { saveViralProjectSettingsFn } from "@/lib/api/viral/viral-projects"
import { showErrorToast } from "@/lib/toast/error-toast"
import type { ViralProjectItem, ViralProjectScreen } from "@/lib/viral/viral"

/**
 * What every panel of one project's page reads: the screen as loaded, and a
 * way to read it again. Kept in one place, as Travel's trip page does, so the
 * left panel's ⋮ and the right panel's buttons change the same project.
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

type SettingsPatch = Partial<{
  name: string
  description: string
  topic: string
  days: ViralProjectItem["days"]
  minViews: number
  minScore: number
  videoLength: ViralProjectItem["video_length"]
  spendLimitCents: number | null
}>

/**
 * Saves one or more of the project's settings, leaving the rest as stored,
 * and reads the page again. Resolves false when the save was refused, so a
 * self-saving field keeps what was typed (UI standard, "Settings").
 */
export function useSaveProject() {
  const { screen, refresh } = useProject()
  const project = screen.project
  return React.useCallback(
    async (patch: SettingsPatch, success?: string): Promise<boolean> => {
      try {
        await saveViralProjectSettingsFn({
          projectId: project.id,
          name: project.name,
          description: project.description,
          days: project.days,
          minViews: project.min_views,
          minScore: project.min_score,
          videoLength: project.video_length,
          spendLimitCents: project.spend_limit_cents,
          ...patch,
        })
        await refresh()
        if (success) toast.success(success)
        return true
      } catch (error) {
        showErrorToast(getViralErrorMessage(error))
        return false
      }
    },
    [project, refresh]
  )
}
