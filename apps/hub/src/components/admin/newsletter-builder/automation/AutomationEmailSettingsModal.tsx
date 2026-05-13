"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardGroup, CardHeader } from "@/components/ui/card"
import { Dialog } from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DashboardModalContent, DashboardModalCardTitle } from "@/components/admin/layout/dashboard/modals"
import { updateStep, type AutomationStep } from "@/lib/actions/newsletters/automation-actions"
import { DripSettingsFields, useDripSettings } from "../layout/DripSettingsFields"

interface AutomationEmailSettingsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  step: AutomationStep | null
  onSuccess: (step: AutomationStep) => void
}

export function AutomationEmailSettingsModal({
  open,
  onOpenChange,
  step,
  onSuccess,
}: AutomationEmailSettingsModalProps) {
  const [activeTab, setActiveTab] = useState("general")
  const [subject, setSubject] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const drip = useDripSettings(false, false)
  const loadDripConfig = drip.loadFromConfig

  useEffect(() => {
    if (!step || !open) return

    setActiveTab("general")
    setSubject(step.subject || "")
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

    const { data, error: updateError } = await updateStep(step.id, {
      subject: subject.trim(),
      node_config: {
        ...(step.node_config || {}),
        drip_config: drip.buildConfig(),
      },
    })

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
              <TabsTrigger value="general" className="h-7 py-0">General</TabsTrigger>
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
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 mb-4">
              <p className="text-sm text-red-800">{error}</p>
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
                    <FieldLabel htmlFor="automation-email-settings-subject">Subject Line *</FieldLabel>
                    <Input
                      id="automation-email-settings-subject"
                      value={subject}
                      onChange={event => setSubject(event.target.value)}
                      placeholder="Email subject line"
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
                  <DripSettingsFields form={drip} idPrefix="automation-settings" />
                </CardContent>
              </Card>
            </CardGroup>
          </TabsContent>
        </DashboardModalContent>
      </Tabs>
    </Dialog>
  )
}
