import { useState, useEffect } from "react"
import { getStepById, updateStep, getAutomationById } from "@/lib/actions/newsletters/automation-actions"
import { useBlockEditor, parseBlocksFromJson, blocksToJson } from "./useBlockEditor"
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
  const [saveMessage, setSaveMessage] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const blockEditor = useBlockEditor()

  const loadStep = async () => {
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
    blockEditor.setBlocks(parseBlocksFromJson(stepResult.data.content_blocks || {}))
    setLoading(false)
  }

  useEffect(() => {
    loadStep()
  }, [stepId, automationId])

  const handleSave = async () => {
    if (!step) return
    setIsSaving(true)
    setSaveMessage("Saving...")

    const contentBlocks = blocksToJson(blockEditor.blocks)

    try {
      const { data, error: saveError } = await updateStep(step.id, {
        subject,
        content_blocks: contentBlocks,
      })
      if (saveError) {
        setSaveMessage(`Error: ${saveError}`)
        setTimeout(() => setSaveMessage(""), 5000)
      } else if (data) {
        setStep(data)
        setSaveMessage("Saved!")
        setTimeout(() => setSaveMessage(""), 3000)
      }
    } catch (err) {
      setSaveMessage(`Error: ${err instanceof Error ? err.message : 'Failed to save'}`)
      setTimeout(() => setSaveMessage(""), 5000)
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
    saveMessage,
    loading,
    error,
    updateBlockContent: blockEditor.updateBlockContent,
    handleDeleteBlock: blockEditor.handleDeleteBlock,
    handleReorderBlocks: blockEditor.handleReorderBlocks,
    handleAddBlocks: blockEditor.handleAddBlocks,
    handleSave,
  }
}
