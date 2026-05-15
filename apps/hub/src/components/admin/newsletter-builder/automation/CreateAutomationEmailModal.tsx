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
import { ChevronDown } from "lucide-react"
import { DripSettingsFields, useDripSettings } from "../layout/DripSettingsFields"

export interface CreateAutomationEmailInput {
  subject: string
  content_blocks: Record<string, any>
  node_config: Record<string, any>
}

interface CreateAutomationEmailModalProps {
  siteId: string
  onCreate: (input: CreateAutomationEmailInput) => Promise<boolean>
  onCancel: () => void
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

export function CreateAutomationEmailModal({ siteId, onCreate, onCancel }: CreateAutomationEmailModalProps) {
  const [subject, setSubject] = useState("")
  const [body, setBody] = useState("")
  const [templates, setTemplates] = useState<NewsletterTemplate[]>([])
  const [templatesLoading, setTemplatesLoading] = useState(true)
  const [selectedTemplateId, setSelectedTemplateId] = useState("blank")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const drip = useDripSettings(true, true)

  useEffect(() => {
    if (!siteId) return

    let cancelled = false
    setTemplatesLoading(true)
    getTemplatesBySite(siteId)
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

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()

    if (!subject.trim()) {
      setError("Subject line is required")
      return
    }
    if (!siteId) {
      setError("No site selected")
      return
    }

    const dripError = drip.validate()
    if (dripError) {
      setError(dripError)
      return
    }

    setLoading(true)
    setError(null)

    const selectedTemplate = selectedTemplateId !== "blank"
      ? templates.find(template => template.id === selectedTemplateId)
      : null

    const success = await onCreate({
      subject: subject.trim(),
      content_blocks: withBodyBlock(selectedTemplate?.content_blocks || {}, body),
      node_config: {
        drip_config: drip.buildConfig(),
      },
    })

    if (!success) setLoading(false)
  }

  return (
    <Tabs defaultValue="content">
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
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancel
              </Button>
              <Button form="create-automation-email-form" type="submit" disabled={loading}>
                {loading ? "Creating..." : "Continue"}
              </Button>
            </>
          }
        >
          {error && (
            <div className="rounded-md border border-red-200 bg-red-100 p-4 text-sm text-red-800 mb-4">
              {error}
            </div>
          )}

        <TabsContent value="content" className="mt-0 min-h-[320px]">
          <CardGroup className="grid">
            <Card>
              <CardContent>
                <Input
                  id="automation-email-subject"
                  aria-label="Subject line"
                  value={subject}
                  onChange={event => setSubject(event.target.value)}
                  placeholder="Email subject line..."
                  required
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
            <Card>
              <CardHeader>
                <DashboardModalCardTitle>Drip options</DashboardModalCardTitle>
              </CardHeader>
              <CardContent>
                <DripSettingsFields form={drip} idPrefix="automation-create" />
              </CardContent>
            </Card>
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
