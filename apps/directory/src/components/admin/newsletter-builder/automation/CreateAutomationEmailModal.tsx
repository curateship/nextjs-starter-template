"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardGroup, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { InlineRichTextEditor } from "@/components/admin/layout/builder/InlineRichTextEditor"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DashboardModalContent, DashboardModalCardTitle } from "@/components/admin/layout/dashboard/modals"
import { getTemplatesBySite, type NewsletterTemplate } from "@/lib/actions/newsletters/template-actions"
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down.js"
import { DripSettingsFields, useDripSettings } from "../layout/DripSettingsFields"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import { dismissErrorToast, showErrorToast } from "@/lib/error-toast"

export interface CreateAutomationEmailInput {
  subject: string
  content_blocks: Record<string, any>
  node_config: Record<string, any>
}

interface CreateAutomationEmailModalProps {
  siteId: string
  onCreate: (input: CreateAutomationEmailInput, openEditor: boolean) => Promise<boolean>
}

function getBodyFromBlocks(contentBlocks: Record<string, any>) {
  const bodyBlock = Object.values(contentBlocks || {}).find(
    (block: any) => block?.type === "newsletter-rich-text"
  ) as any

  return bodyBlock?.content?.htmlContent || ""
}

function withBodyBlock(contentBlocks: Record<string, any>, body: string) {
  const blocks = { ...(contentBlocks || {}) }
  const bodyBlockEntry = Object.entries(blocks).find(
    ([, block]: [string, any]) => block?.type === "newsletter-rich-text"
  )
  const bodyBlockKey = bodyBlockEntry?.[0] || "automation-body"
  const bodyBlock = (bodyBlockEntry?.[1] || {}) as any

  return {
    ...blocks,
    [bodyBlockKey]: {
      ...bodyBlock,
      id: bodyBlock.id || bodyBlockKey,
      type: "newsletter-rich-text",
      content: {
        ...(bodyBlock.content || {}),
        htmlContent: body,
      },
      display_order: bodyBlock.display_order ?? Object.keys(blocks).length,
    },
  }
}

export function CreateAutomationEmailModal({ siteId, onCreate }: CreateAutomationEmailModalProps) {
  const { currentSite } = useSiteSwitcher()
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [templates, setTemplates] = useState<NewsletterTemplate[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(true)
  const [selectedTemplateId, setSelectedTemplateId] = useState("blank")
  const [loadingAction, setLoadingAction] = useState<"save" | "continue" | null>(null)
  const [subjectInvalid, setSubjectInvalid] = useState(false)
  const [activeTab, setActiveTab] = useState("content")
  // Failures report through the one shared error toast, never inside the modal
  // body — see workspace/docs/admin-action-feedback.md.
  const setError = (message: string | null) => {
    if (message) showErrorToast(message)
    else dismissErrorToast()
  }
  const drip = useDripSettings(false, false)
  const loadDripConfig = drip.loadFromConfig

  useEffect(() => {
    if (currentSite?.id === siteId && currentSite.settings?.newsletter_drip_defaults) {
      loadDripConfig(currentSite.settings.newsletter_drip_defaults)
    }
  }, [currentSite?.id, currentSite?.settings?.newsletter_drip_defaults, loadDripConfig, siteId])

  useEffect(() => {
    if (!siteId) return

    let cancelled = false
    setTemplatesLoading(true)
    getTemplatesBySite({ data: { siteId: siteId } })
      .then(({ data }) => {
        if (cancelled) return
        const loaded = data || []
        setTemplates(loaded)
        const defaultTemplate = loaded.find(template => template.is_default)
        setSelectedTemplateId(defaultTemplate ? defaultTemplate.id : "blank")
        setBody(defaultTemplate ? getBodyFromBlocks(defaultTemplate.content_blocks || {}) : "")
      })
      .finally(() => {
        if (!cancelled) setTemplatesLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [siteId])

  const handleTemplateChange = (templateId: string) => {
    const selectedTemplate = templateId !== "blank"
      ? templates.find(template => template.id === templateId)
      : null

    setSelectedTemplateId(templateId)
    setBody(selectedTemplate ? getBodyFromBlocks(selectedTemplate.content_blocks || {}) : "")
  }

  const handleCreate = async (openEditor: boolean) => {
    if (!subject.trim()) {
      // The subject lives on the Content tab, so a submit from Drip Options has
      // to bring the user back to the field the message is about.
      setActiveTab("content")
      setSubjectInvalid(true)
      setError("Subject line is required")
      return
    }

    setSubjectInvalid(false)
    if (!siteId) {
      setError("No site selected")
      return
    }

    const dripError = drip.validate()
    if (dripError) {
      setError(dripError)
      return
    }

    const loadingKey = openEditor ? "continue" : "save"
    setLoadingAction(loadingKey)
    setError(null)

    const selectedTemplate = selectedTemplateId !== "blank"
      ? templates.find(template => template.id === selectedTemplateId)
      : null

    const success = await onCreate(
      {
        subject: subject.trim(),
        content_blocks: withBodyBlock(selectedTemplate?.content_blocks || {}, body),
        node_config: {
          drip_config: drip.buildConfig(),
        },
      },
      openEditor
    )

    if (!success) setLoadingAction(null)
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    await handleCreate(true)
  }

  const loading = loadingAction !== null

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab}>
      <form id="create-automation-email-form" onSubmit={handleSubmit} className="contents">
        <DashboardModalContent
          title="Create Email"
          titleAccessory={
            <div className="flex min-w-0 flex-wrap items-center gap-4 pr-10">
              <TabsList className="h-9 shrink-0">
                <TabsTrigger value="content" className="h-7 py-0">Content</TabsTrigger>
                <TabsTrigger value="drip-options" className="h-7 py-0">Drip Options</TabsTrigger>
                <TabsTrigger value="settings" className="h-7 py-0">Settings</TabsTrigger>
              </TabsList>
            </div>
          }
          footer={
            <>
              <Button type="button" variant="outline" onClick={() => handleCreate(false)} disabled={loading}>
                {loadingAction === "save" ? "Saving..." : "Save"}
              </Button>
              <Button form="create-automation-email-form" type="submit" disabled={loading}>
                {loadingAction === "continue" ? "Creating..." : "Continue to Editor"}
              </Button>
            </>
          }
        >
        <TabsContent value="content" className="mt-0 min-h-[320px]">
          <CardGroup className="grid">
            <Card>
              <CardContent>
                <Input
                  id="automation-email-subject"
                  aria-label="Subject line"
                  value={subject}
                  onChange={event => {
                    setSubject(event.target.value)
                    if (subjectInvalid && event.target.value.trim()) setSubjectInvalid(false)
                  }}
                  placeholder="Email subject line..."
                  aria-invalid={subjectInvalid}
                  className="h-auto border-0 bg-transparent px-0 py-0 text-3xl font-semibold tracking-normal shadow-none outline-none focus-visible:ring-0 md:text-4xl"
                />
              </CardContent>
            </Card>

            <Card>
              <CardContent>
                <InlineRichTextEditor
                  blockId="automation-body-new"
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
            <DripSettingsFields form={drip} idPrefix="automation-create" variant="cards" />
          </CardGroup>
        </TabsContent>

        <TabsContent value="settings" className="mt-0 min-h-[320px]">
          <CardGroup className="grid">
            <Card>
              <CardHeader>
                <DashboardModalCardTitle>Template</DashboardModalCardTitle>
              </CardHeader>
              <CardContent>
                {templatesLoading ? (
                  <div className="border-input inline-flex h-10 items-center justify-between gap-2 rounded-md border bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs">
                    <Skeleton className="h-4 w-24 rounded-sm" />
                    <ChevronDown className="size-4 opacity-50" />
                  </div>
                ) : (
                  <Select value={selectedTemplateId} onValueChange={handleTemplateChange}>
                    <SelectTrigger id="automation-email-template" size="button">
                      <SelectValue placeholder="Select template" />
                    </SelectTrigger>
                    <SelectContent className="z-60">
                      <SelectItem value="blank">Blank</SelectItem>
                      {templates.map(template => (
                        <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </CardContent>
            </Card>
          </CardGroup>
        </TabsContent>
        </DashboardModalContent>
      </form>
    </Tabs>
  )
}
