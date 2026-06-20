import { useEffect, useState } from "react"

import {
  DEFAULT_EDITOR_SETTINGS,
  DEFAULT_TASK_TEMPLATE,
} from "@/app/constants"
import {
  getEditorSettings,
  saveNativeEditorSettings,
} from "@/app/native/editor-settings"
import { readableError } from "@/app/path"
import type { EditorSettings, SettingsSaveStatus } from "@/app/types"

export function useEditorSettings() {
  const [editorSettings, setEditorSettings] = useState<EditorSettings>(DEFAULT_EDITOR_SETTINGS)
  const [draftTaskTemplate, setDraftTaskTemplate] = useState(DEFAULT_TASK_TEMPLATE)
  const [settingsSaveStatus, setSettingsSaveStatus] =
    useState<SettingsSaveStatus>("idle")
  const [settingsError, setSettingsError] = useState("")

  const settingsDirty = draftTaskTemplate !== editorSettings.defaultTaskTemplate

  useEffect(() => {
    let cancelled = false

    async function loadEditorSettings() {
      try {
        const settings = await getEditorSettings()
        if (cancelled) return
        setEditorSettings(settings)
        setDraftTaskTemplate(settings.defaultTaskTemplate)
      } catch (error) {
        if (!cancelled) setSettingsError(readableError(error))
      }
    }

    void loadEditorSettings()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (settingsSaveStatus !== "saved") return

    const timeout = window.setTimeout(() => setSettingsSaveStatus("idle"), 1800)
    return () => window.clearTimeout(timeout)
  }, [settingsSaveStatus])

  function updateDraftTaskTemplate(value: string) {
    setDraftTaskTemplate(value)
    setSettingsSaveStatus("idle")
    setSettingsError("")
  }

  function resetTaskTemplate() {
    updateDraftTaskTemplate(DEFAULT_TASK_TEMPLATE)
  }

  async function saveEditorSettings() {
    setSettingsError("")
    setSettingsSaveStatus("saving")

    try {
      const settings = await saveNativeEditorSettings({
        defaultTaskTemplate: draftTaskTemplate,
      })
      setEditorSettings(settings)
      setDraftTaskTemplate(settings.defaultTaskTemplate)
      setSettingsSaveStatus("saved")
    } catch (error) {
      setSettingsError(readableError(error))
      setSettingsSaveStatus("idle")
    }
  }

  return {
    draftTaskTemplate,
    resetTaskTemplate,
    saveEditorSettings,
    settingsDirty,
    settingsError,
    settingsSaveStatus,
    updateDraftTaskTemplate,
  }
}
