import { useState, useEffect, useCallback, useRef } from "react"
import { getStepById, updateStep, getAutomationById } from "@/lib/actions/newsletters/automation-actions"
import { useAutoSave } from "@/components/admin/layout/builder/use-auto-save"
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const blockEditor = useBlockEditor()
  const setBlocks = blockEditor.setBlocks

  const loadStep = useCallback(async () => {
    setLoading(true)
    const [stepResult, automationResult] = await Promise.all([
      getStepById({ data: { stepId: stepId } }),
      getAutomationById({ data: { automationId: automationId } }),
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

  const stepRef = useRef(step)
  stepRef.current = step
  const subjectRef = useRef(subject)
  subjectRef.current = subject
  const blocksRef = useRef(blockEditor.blocks)
  blocksRef.current = blockEditor.blocks
  const lastSavedJsonRef = useRef<string | null>(null)

  // Auto-save: the subject line and the blocks are written once the edits stop.
  const { saveStatus, isSaving, scheduleSave, saveNow } = useAutoSave<{
    blocks: ReturnType<typeof useBlockEditor>['blocks']
    subject: string
  }>({
    save: async (draft) => {
      const currentStep = stepRef.current
      if (!currentStep) return { saved: true }

      const { data, error: saveError } = await updateStep({ data: { stepId: currentStep.id, updates: {
        subject: draft.subject,
        content_blocks: blocksToJson(draft.blocks),
      } } })

      if (saveError) return { saved: false, reason: saveError }
      if (data) setStep(data)
      return { saved: true }
    }
  })

  const watchedJson = JSON.stringify({ blocks: blockEditor.blocks, subject })

  useEffect(() => {
    if (loading) {
      lastSavedJsonRef.current = null
      return
    }
    if (lastSavedJsonRef.current === null) {
      lastSavedJsonRef.current = watchedJson
      return
    }
    if (lastSavedJsonRef.current === watchedJson) return

    lastSavedJsonRef.current = watchedJson
    scheduleSave({ blocks: blocksRef.current, subject: subjectRef.current })
  }, [loading, scheduleSave, watchedJson])

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
      lastSavedJsonRef.current = null
    },
    saveNow: () => saveNow({ blocks: blocksRef.current, subject: subjectRef.current }),
    saveSelectedBlockContent: async (content: Record<string, any>, nextSubject = subject) => {
      const updatedBlocks = blockEditor.replaceSelectedBlockContent(content)
      if (!updatedBlocks) {
        return false
      }

      // The block dialog closes on this, so it writes now rather than leaving
      // the edit sitting in the debounce.
      setSubject(nextSubject)
      lastSavedJsonRef.current = JSON.stringify({ blocks: updatedBlocks, subject: nextSubject })
      return saveNow({ blocks: updatedBlocks, subject: nextSubject })
    },
  }
}
