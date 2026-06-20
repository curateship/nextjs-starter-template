import { invoke } from "@tauri-apps/api/core"

import type { EditorSettings } from "@/app/types"

export function getEditorSettings() {
  return invoke<EditorSettings>("get_editor_settings")
}

export function saveNativeEditorSettings(settings: EditorSettings) {
  return invoke<EditorSettings>("save_editor_settings", { settings })
}
