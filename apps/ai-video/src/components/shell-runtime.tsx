import * as React from "react"

import type { ShellConfig } from "@/lib/ai-video"

type SaveStatus = "idle" | "saving" | "saved"

export type ShellRuntime = {
  config: ShellConfig
  settingsError: string | null
  saveStatus: SaveStatus
  feedbackRefreshToken: number
  onConfigChange: (config: ShellConfig) => void
  onSaveConfig: () => Promise<boolean>
  onOpenFeedback: () => void
  onOpenFeedbackThread: (feedbackId: string) => void
}

export const ShellRuntimeContext = React.createContext<ShellRuntime | null>(
  null
)

export function useShellRuntime() {
  const context = React.useContext(ShellRuntimeContext)
  if (!context) {
    throw new Error("Shell runtime is missing")
  }
  return context
}
