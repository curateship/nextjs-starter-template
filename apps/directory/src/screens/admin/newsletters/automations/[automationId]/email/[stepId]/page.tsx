"use client"

import { use } from "react"
import { useRouter } from "@/lib/navigation-client"

import { NewsletterEditorShell } from "@/components/admin/newsletter-builder/layout/NewsletterEditorShell"
import { useAutomationEmailBuilder } from "@/components/admin/newsletter-builder/automation/useAutomationEmailBuilder"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { AutomationEmailSettingsModal } from "@/components/admin/newsletter-builder/automation/AutomationEmailSettingsModal"

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
      saveStatus={builder.saveStatus}
      isSaving={builder.isSaving}
      settingsDisabled={!builder.step}
      renderSettingsModal={(show, setShow) => (
        <AutomationEmailSettingsModal
          open={show}
          onOpenChange={setShow}
          step={builder.step}
          siteId={currentSite?.id || ""}
          onSuccess={builder.applyStepUpdate}
        />
      )}
    />
  )
}
