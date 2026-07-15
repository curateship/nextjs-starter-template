import { useState, useEffect, useCallback } from "react"
import { getStepById, updateStep, getAutomationById } from "@/lib/actions/newsletters/automation-actions"
import { useSaveStatus } from "@/components/admin/layout/builder/save-status"
import { useBlockEditor, parseBlocksFromJson, blocksToJson } from "../config/useBlockEditor"
import type { AutomationStep, EmailAutomation } from "@/lib/actions/newsletters/automation-actions"

interface UseAutomationEmailBuilderParams {
  stepId: string
  automationId: string
}

export function useAutomationEmailBuilder({ stepId, automationId }: UseAutomationEmailBuilderParams) {
  const [step, setStep] = useState<AutomationStep | null>(null)
  const [automation, setAutomation] = useState<EmailAutomation | null>(null)
  const [subject, setSubject] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useSaveStatus()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const blockEditor = useBlockEditor()
  const setBlocks = blockEditor.setBlocks

  const loadStep = useCallback(async () => {
    setLoading(true)
    const [stepResult, automationResult] = await Promise.all([
      getStepById(stepId),
      getAutomationById(automationId),
    ])

    if (stepResult.error || !stepResult.data) {
      setError(stepResult.error || "Step not found")
      setLoading(false)
      return
    }
    if (automationResult.error || !automationResult.data) {
      setError(automationResult.error || "Automation not found")
      setLoading(false)
      return
    }

    setStep(stepResult.data)
    setAutomation(automationResult.data)
    setSubject(stepResult.data.subject || "")
    setBlocks(parseBlocksFromJson(stepResult.data.content_blocks || {}))
    setLoading(false)
  }, [automationId, setBlocks, stepId])

  useEffect(() => {
    loadStep()
  }, [loadStep])

  const handleSave = async () => {
    if (!step) return
    setIsSaving(true)
    setSaveStatus("saving")

    const contentBlocks = blocksToJson(blockEditor.blocks)

    try {
      const { data, error: saveError } = await updateStep(step.id, {
        subject,
        content_blocks: contentBlocks,
      })
      if (saveError) {
        setSaveStatus("error", saveError)
      } else if (data) {
        setStep(data)
        setSaveStatus("saved")
      }
    } catch (err) {
      setSaveStatus("error", err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setIsSaving(false)
    }
  }

  return {
    step,
    automation,
    subject,
    setSubject,
    blocks: blockEditor.blocks,
    selectedBlock: blockEditor.selectedBlock,
    setSelectedBlock: blockEditor.setSelectedBlock,
    isSaving,
    saveStatus,
    loading,
    error,
    updateBlockContent: blockEditor.updateBlockContent,
    replaceSelectedBlockContent: blockEditor.replaceSelectedBlockContent,
    handleDeleteBlock: blockEditor.handleDeleteBlock,
    handleReorderBlocks: blockEditor.handleReorderBlocks,
    handleAddBlocks: blockEditor.handleAddBlocks,
    applyStepUpdate: (updatedStep: AutomationStep) => {
      setStep(updatedStep)
      setSubject(updatedStep.subject || "")
    },
    handleSave,
    saveSelectedBlockContent: async (content: Record<string, any>, nextSubject = subject) => {
      if (!step) return false

      const updatedBlocks = blockEditor.replaceSelectedBlockContent(content)
      if (!updatedBlocks) {
        return false
      }

      setIsSaving(true)
      setSaveStatus("saving")

      try {
        const { data, error: saveError } = await updateStep(step.id, {
          subject: nextSubject,
          content_blocks: blocksToJson(updatedBlocks),
        })
        if (saveError) {
          setSaveStatus("error", saveError)
          return false
        }

        if (data) {
          setStep(data)
          setSubject(nextSubject)
          setSaveStatus("saved")
          return true
        }
      } catch (err) {
        setSaveStatus("error", err instanceof Error ? err.message : 'Failed to save')
      } finally {
        setIsSaving(false)
      }

      return false
    },
  }
}
