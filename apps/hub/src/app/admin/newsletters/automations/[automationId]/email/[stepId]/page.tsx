"use client"

import { use } from "react"
import { useRouter } from "next/navigation"

import { NewsletterEditorShell } from "@/components/admin/newsletter-builder/layout/NewsletterEditorShell"
import { useAutomationEmailBuilder } from "@/components/admin/newsletter-builder/config/useAutomationEmailBuilder"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"

interface PageProps {
  params: Promise<{ automationId: string; stepId: string }>
}

export default function AutomationEmailEditorPage({ params }: PageProps) {
  const { automationId, stepId } = use(params)
  const router = useRouter()
  const { currentSite } = useSiteSwitcher()
  const builder = useAutomationEmailBuilder({ stepId, automationId })

  return (
    <NewsletterEditorShell
      loading={builder.loading}
      loadingActionCount={3}
      loadingShowHeader
      error={builder.error}
      showError={Boolean(builder.error && !builder.step)}
      errorBackLabel="Back to Automation"
      onErrorBack={() => router.push(`/admin/newsletters/automations/${automationId}`)}
      blocks={builder.blocks}
      selectedBlock={builder.selectedBlock}
      onSelectBlock={builder.setSelectedBlock}
      onDeleteBlock={builder.handleDeleteBlock}
      onReorderBlocks={builder.handleReorderBlocks}
      onAddBlocks={builder.handleAddBlocks}
      updateBlockContent={builder.updateBlockContent}
      onSaveSelectedBlock={builder.saveSelectedBlockContent}
      siteId={currentSite?.id || ""}
      subject={builder.subject}
      onSubjectChange={builder.setSubject}
      saveMessage={builder.saveMessage}
      isSaving={builder.isSaving}
      onSave={builder.handleSave}
    />
  )
}
