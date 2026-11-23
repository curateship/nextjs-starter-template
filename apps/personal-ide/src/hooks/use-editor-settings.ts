import { useEffect, useState } from "react"

import {
  DEFAULT_EDITOR_SETTINGS,
  DEFAULT_START_TASK_PROMPT,
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
  const [draftStartTaskPrompt, setDraftStartTaskPrompt] = useState(DEFAULT_START_TASK_PROMPT)
  const [settingsSaveStatus, setSettingsSaveStatus] =
    useState<SettingsSaveStatus>("idle")
  const [settingsError, setSettingsError] = useState("")

  const settingsDirty =
    draftTaskTemplate !== editorSettings.defaultTaskTemplate ||
    draftStartTaskPrompt !== editorSettings.startTaskPrompt

  useEffect(() => {
    let cancelled = false

    async function loadEditorSettings() {
      try {
        const settings = await getEditorSettings()
        if (cancelled) return
        setEditorSettings(settings)
        setDraftTaskTemplate(settings.defaultTaskTemplate)
        setDraftStartTaskPrompt(settings.startTaskPrompt)
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

  function updateDraftStartTaskPrompt(value: string) {
    setDraftStartTaskPrompt(value)
    setSettingsSaveStatus("idle")
    setSettingsError("")
  }

  function resetStartTaskPrompt() {
    updateDraftStartTaskPrompt(DEFAULT_START_TASK_PROMPT)
  }

  async function saveEditorSettings() {
    setSettingsError("")
    setSettingsSaveStatus("saving")

    try {
      const settings = await saveNativeEditorSettings({
        defaultTaskTemplate: draftTaskTemplate,
        startTaskPrompt: draftStartTaskPrompt,
      })
      setEditorSettings(settings)
      setDraftTaskTemplate(settings.defaultTaskTemplate)
      setDraftStartTaskPrompt(settings.startTaskPrompt)
      setSettingsSaveStatus("saved")
    } catch (error) {
      setSettingsError(readableError(error))
      setSettingsSaveStatus("idle")
    }
  }

  return {
    draftStartTaskPrompt,
    draftTaskTemplate,
    editorSettings,
    resetStartTaskPrompt,
    resetTaskTemplate,
    saveEditorSettings,
    settingsDirty,
    settingsError,
    settingsSaveStatus,
    updateDraftStartTaskPrompt,
    updateDraftTaskTemplate,
  }
}
