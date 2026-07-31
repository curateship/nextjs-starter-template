"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardGroup } from "@/components/ui/card"
import { Dialog } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { InlineRichTextEditor } from "@/components/admin/layout/builder/InlineRichTextEditor"
import { DashboardModalContent } from "@/components/admin/layout/dashboard/modals"
import { updateStep, type AutomationStep } from "@/lib/actions/newsletters/automation-actions"
import { DripSettingsFields, useDripSettings } from "../layout/DripSettingsFields"
import { dismissErrorToast, showErrorToast } from "@/lib/error-toast"

interface AutomationEmailSettingsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  step: AutomationStep | null
  siteId: string
  onSuccess: (step: AutomationStep) => void
}

export function AutomationEmailSettingsModal({
  open,
  onOpenChange,
  step,
  siteId,
  onSuccess,
}: AutomationEmailSettingsModalProps) {
  const [activeTab, setActiveTab] = useState("content")
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [saving, setSaving] = useState(false)
  // Failures report through the one shared error toast, never inside the modal
  // body — see workspace/docs/admin-action-feedback.md.
  const setError = (message: string | null) => {
    if (message) showErrorToast(message)
    else dismissErrorToast()
  }
  const drip = useDripSettings(false, false)
  const loadDripConfig = drip.loadFromConfig

  useEffect(() => {
    if (!step || !open) return

    const bodyBlock = Object.values(step.content_blocks || {}).find(
      (block: any) => block?.type === "newsletter-rich-text"
    ) as any

    setActiveTab("content")
    setSubject(step.subject || "")
    setBody(bodyBlock ? bodyBlock.content?.htmlContent || "" : step.content || "")
    loadDripConfig(step.node_config?.drip_config)
    setError(null)
  }, [step, open, loadDripConfig])

  const handleSave = async () => {
    if (!step) return
    if (!subject.trim()) {
      setError("Subject line is required")
      return
    }

    const dripError = drip.validate()
    if (dripError) {
      setError(dripError)
      return
    }

    setSaving(true)
    setError(null)

    const contentBlocks = { ...(step.content_blocks || {}) }
    const bodyBlockEntry = Object.entries(contentBlocks).find(
      ([, block]: [string, any]) => block?.type === "newsletter-rich-text"
    )
    const bodyBlockKey = bodyBlockEntry?.[0] || `automation-body-${step.id}`
    const bodyBlock = (bodyBlockEntry?.[1] || {}) as any

    const { data, error: updateError } = await updateStep({ data: { stepId: step.id, updates: {
      subject: subject.trim(),
      content_blocks: {
        ...contentBlocks,
        [bodyBlockKey]: {
          ...bodyBlock,
          id: bodyBlock.id || bodyBlockKey,
          type: "newsletter-rich-text",
          content: {
            ...(bodyBlock.content || {}),
            htmlContent: body,
          },
          display_order: bodyBlock.display_order ?? Object.keys(contentBlocks).length,
        },
      },
      node_config: {
        ...(step.node_config || {}),
        drip_config: drip.buildConfig(),
      },
    } } })

    setSaving(false)

    if (updateError) {
      setError(updateError)
      return
    }

    if (data) {
      onSuccess(data)
      onOpenChange(false)
    }
  }

  if (!step) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <DashboardModalContent
          title="Email Settings"
          titleAccessory={
            <TabsList className="h-9 shrink-0">
              <TabsTrigger value="content" className="h-7 py-0">Content</TabsTrigger>
              <TabsTrigger value="drip-options" className="h-7 py-0">Drip Options</TabsTrigger>
            </TabsList>
          }
          footer={
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
                Close
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </Button>
            </>
          }
        >
          <TabsContent value="content" className="mt-0 min-h-[320px]">
            <CardGroup className="grid">
              <Card>
                <CardContent>
                  <Input
                    id="automation-email-settings-subject"
                    aria-label="Subject line"
                    value={subject}
                    onChange={event => setSubject(event.target.value)}
                    placeholder="Email subject line..."
                    className="h-auto border-0 bg-transparent px-0 py-0 text-3xl font-semibold tracking-normal shadow-none outline-none focus-visible:ring-0 md:text-4xl"
                  />
                </CardContent>
              </Card>

              <Card>
                <CardContent>
                  <InlineRichTextEditor
                    blockId={`automation-body-${step.id}`}
                    content={{ htmlContent: body }}
                    onContentChange={setBody}
                    siteId={siteId}
                    isActive
                    editorPadding={0}
                  />
                </CardContent>
              </Card>
            </CardGroup>
          </TabsContent>

          <TabsContent value="drip-options" className="mt-0 min-h-[320px]">
            <CardGroup className="grid">
              <DripSettingsFields form={drip} idPrefix="automation-settings" variant="cards" />
            </CardGroup>
          </TabsContent>
        </DashboardModalContent>
      </Tabs>
    </Dialog>
  )
}
