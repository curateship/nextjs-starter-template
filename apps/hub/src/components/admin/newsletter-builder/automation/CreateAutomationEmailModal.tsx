"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { TabsContent } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AdminModalBody,
  AdminModalFooter,
} from "@/components/admin/layout/builder/AdminModalLayout"
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
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
      <AdminModalBody className="space-y-6 [&_label+button]:mt-2 [&_label+input]:mt-2">
        {error && (
          <div className="rounded-md border border-red-200 bg-red-100 p-4 text-sm text-red-800">
            {error}
          </div>
        )}

        <TabsContent value="general" className="mt-0 min-h-[320px] space-y-6">
          <div>
            <Label htmlFor="automation-email-template">Start from template</Label>
            {templatesLoading ? (
              <div className="border-input mt-2 inline-flex h-10 items-center justify-between gap-2 rounded-md border bg-transparent px-3 py-2 text-sm whitespace-nowrap shadow-xs">
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
          </div>

          <div>
            <Label htmlFor="automation-email-subject">Subject Line *</Label>
            <Input
              id="automation-email-subject"
              value={subject}
              onChange={event => setSubject(event.target.value)}
              placeholder="Email subject line"
              required
            />
          </div>
        </TabsContent>

        <TabsContent value="drip-options" className="mt-0 min-h-[320px] space-y-6">
          <DripSettingsFields form={drip} idPrefix="automation-create" />
        </TabsContent>
      </AdminModalBody>

      <AdminModalFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? "Creating..." : "Continue"}
        </Button>
      </AdminModalFooter>
    </form>
  )
}
