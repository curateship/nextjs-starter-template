"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  AdminModalBody,
  AdminModalContent,
  AdminModalFooter,
  AdminModalHeader,
  AdminModalTitle,
} from "@/components/admin/layout/builder/AdminModalLayout"
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
  const [successMsg, setSuccessMsg] = useState<string | null>(null)
  const drip = useDripSettings(false, false)
  const loadDripConfig = drip.loadFromConfig

  useEffect(() => {
    if (!step || !open) return

    setActiveTab("general")
    setSubject(step.subject || "")
    loadDripConfig(step.node_config?.drip_config)
    setError(null)
    setSuccessMsg(null)
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
      setSuccessMsg("Saved!")
      setTimeout(() => setSuccessMsg(null), 3000)
    }
  }

  if (!step) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AdminModalContent>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex min-h-0 flex-1 flex-col">
          <AdminModalHeader>
            <div className="flex min-w-0 flex-wrap items-center gap-4 pr-10">
              <AdminModalTitle className="shrink-0">Email Settings</AdminModalTitle>
              <TabsList className="h-9 shrink-0">
                <TabsTrigger value="general" className="h-7 py-0">General</TabsTrigger>
                <TabsTrigger value="drip-options" className="h-7 py-0">Drip Options</TabsTrigger>
              </TabsList>
            </div>
          </AdminModalHeader>

          <AdminModalBody className="space-y-6 [&_label+input]:mt-2">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}
            {successMsg && (
              <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                <p className="text-sm text-green-800">{successMsg}</p>
              </div>
            )}

            <TabsContent value="general" className="mt-0 min-h-[320px] space-y-6">
              <div>
                <Label htmlFor="automation-email-settings-subject">Subject Line *</Label>
                <Input
                  id="automation-email-settings-subject"
                  value={subject}
                  onChange={event => setSubject(event.target.value)}
                  placeholder="Email subject line"
                />
              </div>
            </TabsContent>

            <TabsContent value="drip-options" className="mt-0 min-h-[320px] space-y-6">
              <DripSettingsFields form={drip} idPrefix="automation-settings" />
            </TabsContent>
          </AdminModalBody>

          <AdminModalFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Close
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </AdminModalFooter>
        </Tabs>
      </AdminModalContent>
    </Dialog>
  )
}
