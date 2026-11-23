import { AutomationEditor } from "@/features/automations/components/editor/automation-editor"

export default async function AutomationEditorPage({ params }: { params: Promise<{ automationId: string }> }) {
  const { automationId } = await params
  return <AutomationEditor automationId={automationId} />
}
