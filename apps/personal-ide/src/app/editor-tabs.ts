import type { EditorTab } from "@/app/types"

export function isSettingsTab(tab?: EditorTab) {
  return tab?.kind === "settings"
}
