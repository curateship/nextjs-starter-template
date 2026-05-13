"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardGroup, CardHeader } from "@/components/ui/card"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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

export function CreateAutomationEmailModal({ siteId, onCreate, onCancel }: CreateAutomationEmailModalProps) {
  const [subject, setSubject] = useState("")
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
      })
      .finally(() => {
        if (!cancelled) setTemplatesLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [siteId])

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
      content_blocks: selectedTemplate?.content_blocks || {},
      node_config: {
        drip_config: drip.buildConfig(),
      },
    })

    if (!success) setLoading(false)
  }

  return (
    <Tabs defaultValue="general">
      <form onSubmit={handleSubmit} className="contents">
        <DashboardModalContent
          title="Create Email"
          titleAccessory={
            <div className="flex min-w-0 flex-wrap items-center gap-4 pr-10">
              <TabsList className="h-9 shrink-0">
                <TabsTrigger value="general" className="h-7 py-0">General</TabsTrigger>
                <TabsTrigger value="drip-options" className="h-7 py-0">Drip Options</TabsTrigger>
              </TabsList>
            </div>
          }
          footer={
            <>
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
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

        <TabsContent value="general" className="mt-0 min-h-[320px]">
          <CardGroup className="grid">
            <Card>
              <CardHeader>
                <DashboardModalCardTitle>General</DashboardModalCardTitle>
              </CardHeader>
              <CardContent>
                <Field>
                  <FieldLabel htmlFor="automation-email-template">Start from template</FieldLabel>
                  {templatesLoading ? (
                    <div className="border-input inline-flex h-10 items-center justify-between gap-2 rounded-md border bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs">
                      <Skeleton className="h-4 w-24 rounded-sm" />
                      <ChevronDown className="size-4 opacity-50" />
                    </div>
                  ) : (
                    <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
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
                </Field>

                <Field>
                  <FieldLabel htmlFor="automation-email-subject">Subject Line *</FieldLabel>
                  <Input
                    id="automation-email-subject"
                    value={subject}
                    onChange={event => setSubject(event.target.value)}
                    placeholder="Email subject line"
                    required
                  />
                </Field>
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
        </DashboardModalContent>
      </form>
    </Tabs>
  )
}
