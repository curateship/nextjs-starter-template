"use client"

import { useEffect, useRef, useState } from "react"
import { ExternalLink, FileText, Globe, Loader2, Trash2 } from "lucide-react"

import { DashboardModalCardTitle, DashboardModalContent } from "@/components/admin/layout/dashboard/modals"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardGroup, CardHeader } from "@/components/ui/card"
import { Dialog } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import {
  addAiAutomationFileReference,
  addAiAutomationUrlReference,
  createAiAutomation,
  deleteAiAutomationReference,
  getAiAutomationById,
  updateAiAutomation,
} from "@/lib/actions/ai-automations/automation-actions"
import type { AiAutomationFrequency } from "@/lib/actions/ai-automations/schedule"
import type {
  AiAgentAutomation,
  AiAgentAutomationReference,
  AiAutomationStatus,
} from "@/lib/actions/ai-automations/types"
import { AI_PROVIDER_LABELS, type AIProvider } from "@/lib/utils/ai-models"

export type ConfiguredProvider = { provider: AIProvider; label: string; defaultModel: string }

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

function getClientTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
  } catch {
    return "UTC"
  }
}

function formatBytes(bytes: number | null) {
  if (!bytes) return null
  const sizes = ["Bytes", "KB", "MB", "GB"]
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), sizes.length - 1)
  return `${parseFloat((bytes / Math.pow(1024, index)).toFixed(2))} ${sizes[index]}`
}

export function AutomationCreateDialog({
  currentSiteId,
  onCreated,
  onOpenChange,
  open,
  providers,
  providersLoading,
  showError,
}: {
  currentSiteId?: string
  onCreated: () => Promise<void>
  onOpenChange: (open: boolean) => void
  open: boolean
  providers: ConfiguredProvider[]
  providersLoading: boolean
  showError: (message: string) => void
}) {
  const [name, setName] = useState("")
  const [prompt, setPrompt] = useState("")
  const [provider, setProvider] = useState<AIProvider>("openai")
  const [model, setModel] = useState("")
  const [frequency, setFrequency] = useState<AiAutomationFrequency>("weekly")
  const [time, setTime] = useState("09:00")
  const [dayOfWeek, setDayOfWeek] = useState(1)
  const [dayOfMonth, setDayOfMonth] = useState(1)
  const [timezone, setTimezone] = useState(getClientTimezone)
  const [creating, setCreating] = useState(false)

  const resetForm = () => {
    const firstProvider = providers[0]
    setName("")
    setPrompt("")
    setProvider(firstProvider?.provider ?? "openai")
    setModel(firstProvider?.defaultModel ?? "")
    setFrequency("weekly")
    setTime("09:00")
    setDayOfWeek(1)
    setDayOfMonth(1)
    setTimezone(getClientTimezone())
  }

  useEffect(() => {
    const firstProvider = providers[0]
    if (!firstProvider) return
    if (!providers.some((item) => item.provider === provider)) {
      setProvider(firstProvider.provider)
      setModel(firstProvider.defaultModel)
      return
    }
    if (!model.trim()) {
      setModel(providers.find((item) => item.provider === provider)?.defaultModel ?? "")
    }
  }, [model, provider, providers])

  const handleProviderChange = (nextProvider: AIProvider) => {
    setProvider(nextProvider)
    setModel(providers.find((item) => item.provider === nextProvider)?.defaultModel ?? "")
  }

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!currentSiteId || !name.trim() || !prompt.trim() || !model.trim()) return

    setCreating(true)
    const { data, error } = await createAiAutomation({
      siteId: currentSiteId,
      name: name.trim(),
      prompt: prompt.trim(),
      provider,
      model: model.trim(),
      status: "draft",
      recurrence: {
        frequency,
        time,
        timezone: timezone.trim() || "UTC",
        dayOfWeek,
        dayOfMonth,
      },
    })

    if (error) showError(error)
    if (data) {
      onOpenChange(false)
      resetForm()
      await onCreated()
    }
    setCreating(false)
  }

  const disabled =
    creating ||
    providersLoading ||
    providers.length === 0 ||
    !name.trim() ||
    !prompt.trim() ||
    !model.trim()

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      onOpenChange(nextOpen)
      if (!nextOpen) resetForm()
    }}>
      <form id="create-ai-automation-form" onSubmit={handleCreate} className="contents">
        <DashboardModalContent
          title="Create Automation"
          description="Create a recurring AI task for the current site."
          footer={
            <>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={creating}>
                Cancel
              </Button>
              <Button type="submit" form="create-ai-automation-form" disabled={disabled}>
                {creating ? "Creating..." : "Create Automation"}
              </Button>
            </>
          }
        >
          <AutomationPromptFields
            name={name}
            prompt={prompt}
            setName={setName}
            setPrompt={setPrompt}
          />

          <AutomationModelFields
            disabled={false}
            model={model}
            provider={provider}
            providers={providers}
            providerOptions={providers}
            providersEmptyMessage="No AI provider integration is configured for this site."
            setModel={setModel}
            setProvider={handleProviderChange}
          />

          <AutomationScheduleFields
            dayOfMonth={dayOfMonth}
            dayOfWeek={dayOfWeek}
            disabled={false}
            frequency={frequency}
            setDayOfMonth={setDayOfMonth}
            setDayOfWeek={setDayOfWeek}
            setFrequency={setFrequency}
            setTime={setTime}
            setTimezone={setTimezone}
            time={time}
            timezone={timezone}
          />
        </DashboardModalContent>
      </form>
    </Dialog>
  )
}

export function AutomationSettingsDialog({
  automation,
  onAutomationUpdated,
  onClose,
  onReferenceCountChange,
  providers,
  showError,
}: {
  automation: AiAgentAutomation | null
  onAutomationUpdated: (automation: AiAgentAutomation) => void
  onClose: () => void
  onReferenceCountChange: (automationId: string, delta: number) => void
  providers: ConfiguredProvider[]
  showError: (message: string) => void
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const requestIdRef = useRef(0)
  const [selectedAutomation, setSelectedAutomation] = useState<AiAgentAutomation | null>(null)
  const [references, setReferences] = useState<AiAgentAutomationReference[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [name, setName] = useState("")
  const [prompt, setPrompt] = useState("")
  const [provider, setProvider] = useState<AIProvider>("openai")
  const [model, setModel] = useState("")
  const [status, setStatus] = useState<AiAutomationStatus>("draft")
  const [frequency, setFrequency] = useState<AiAutomationFrequency>("weekly")
  const [time, setTime] = useState("09:00")
  const [dayOfWeek, setDayOfWeek] = useState(1)
  const [dayOfMonth, setDayOfMonth] = useState(1)
  const [timezone, setTimezone] = useState(getClientTimezone)
  const [referenceUrl, setReferenceUrl] = useState("")
  const [referenceFile, setReferenceFile] = useState<File | null>(null)
  const [addingUrl, setAddingUrl] = useState(false)
  const [addingFile, setAddingFile] = useState(false)
  const [deletingReferenceId, setDeletingReferenceId] = useState<string | null>(null)

  const applyForm = (item: AiAgentAutomation) => {
    setName(item.name)
    setPrompt(item.prompt)
    setProvider(item.provider)
    setModel(item.model)
    setStatus(item.status)
    setFrequency(item.recurrence.frequency)
    setTime(item.recurrence.time)
    setDayOfWeek(item.recurrence.dayOfWeek ?? 1)
    setDayOfMonth(item.recurrence.dayOfMonth ?? 1)
    setTimezone(item.recurrence.timezone)
  }

  const resetForm = () => {
    requestIdRef.current += 1
    setSelectedAutomation(null)
    setReferences([])
    setReferenceUrl("")
    setReferenceFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  useEffect(() => {
    if (!automation) {
      resetForm()
      return
    }

    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    setSelectedAutomation(automation)
    setReferences([])
    applyForm(automation)
    setLoading(true)

    getAiAutomationById(automation.id).then(({ data, references: referenceRows, error }) => {
      if (requestIdRef.current !== requestId) return
      if (error) showError(error)
      if (data) {
        setSelectedAutomation(data)
        applyForm(data)
        setReferences(referenceRows)
      }
      setLoading(false)
    })
  }, [automation, showError])

  const providerOptions = selectedAutomation && !providers.some((item) => item.provider === selectedAutomation.provider)
    ? [
      {
        provider: selectedAutomation.provider,
        label: `${AI_PROVIDER_LABELS[selectedAutomation.provider]} (not configured)`,
        defaultModel: selectedAutomation.model,
      },
      ...providers,
    ]
    : providers

  const handleProviderChange = (nextProvider: AIProvider) => {
    setProvider(nextProvider)
    setModel(providers.find((item) => item.provider === nextProvider)?.defaultModel ?? model)
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  const handleSave = async () => {
    if (!selectedAutomation || !name.trim() || !prompt.trim() || !model.trim()) return

    setSaving(true)
    const { data, error } = await updateAiAutomation(selectedAutomation.id, {
      name: name.trim(),
      prompt: prompt.trim(),
      provider,
      model: model.trim(),
      status,
      recurrence: {
        frequency,
        time,
        timezone: timezone.trim() || "UTC",
        dayOfWeek,
        dayOfMonth,
      },
    })

    if (error) showError(error)
    if (data) {
      setSelectedAutomation(data)
      applyForm(data)
      onAutomationUpdated(data)
    }

    setSaving(false)
  }

  const handleAddUrl = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!selectedAutomation || !referenceUrl.trim()) return

    setAddingUrl(true)
    const { data, error } = await addAiAutomationUrlReference(selectedAutomation.id, referenceUrl.trim())
    if (error) showError(error)
    if (data) {
      setReferenceUrl("")
      setReferences((current) => [...current, data])
      onReferenceCountChange(selectedAutomation.id, 1)
    }
    setAddingUrl(false)
  }

  const handleAddFile = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!selectedAutomation || !referenceFile) return

    setAddingFile(true)
    const { data, error } = await addAiAutomationFileReference(selectedAutomation.id, referenceFile)
    if (error) showError(error)
    if (data) {
      setReferenceFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ""
      setReferences((current) => [...current, data])
      onReferenceCountChange(selectedAutomation.id, 1)
    }
    setAddingFile(false)
  }

  const handleDeleteReference = async (referenceId: string) => {
    if (!selectedAutomation) return

    setDeletingReferenceId(referenceId)
    const { success, error } = await deleteAiAutomationReference(referenceId)
    if (error) showError(error)
    if (success) {
      setReferences((current) => current.filter((reference) => reference.id !== referenceId))
      onReferenceCountChange(selectedAutomation.id, -1)
    }
    setDeletingReferenceId(null)
  }

  const disabled =
    saving ||
    loading ||
    !name.trim() ||
    !prompt.trim() ||
    !model.trim()

  return (
    <Dialog open={automation !== null} onOpenChange={(open) => !open && handleClose()}>
      <DashboardModalContent
        title={selectedAutomation ? `Settings: ${selectedAutomation.name}` : "Automation Settings"}
        description="Edit the automation prompt, model, schedule, status, and references."
        footer={
          <>
            <Button type="button" variant="outline" onClick={handleClose} disabled={saving}>
              Close
            </Button>
            <Button type="button" onClick={handleSave} disabled={disabled}>
              {saving ? "Saving..." : "Save Settings"}
            </Button>
          </>
        }
      >
        <AutomationPromptFields
          disabled={loading}
          name={name}
          prompt={prompt}
          setName={setName}
          setPrompt={setPrompt}
        />

        <AutomationModelFields
          disabled={loading}
          model={model}
          provider={provider}
          providers={providers}
          providerOptions={providerOptions}
          providersEmptyMessage="No AI provider integration is configured for this site."
          setModel={setModel}
          setProvider={handleProviderChange}
        >
          <Field>
            <FieldLabel>Status</FieldLabel>
            <Select value={status} onValueChange={(value) => setStatus(value as AiAutomationStatus)} disabled={loading}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="paused">Paused</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </AutomationModelFields>

        <AutomationScheduleFields
          dayOfMonth={dayOfMonth}
          dayOfWeek={dayOfWeek}
          disabled={loading}
          frequency={frequency}
          setDayOfMonth={setDayOfMonth}
          setDayOfWeek={setDayOfWeek}
          setFrequency={setFrequency}
          setTime={setTime}
          setTimezone={setTimezone}
          time={time}
          timezone={timezone}
        />

        <AutomationReferencesFields
          addingFile={addingFile}
          addingUrl={addingUrl}
          deletingReferenceId={deletingReferenceId}
          fileInputRef={fileInputRef}
          loading={loading}
          onAddFile={handleAddFile}
          onAddUrl={handleAddUrl}
          onDeleteReference={handleDeleteReference}
          referenceFile={referenceFile}
          references={references}
          referenceUrl={referenceUrl}
          setReferenceFile={setReferenceFile}
          setReferenceUrl={setReferenceUrl}
        />
      </DashboardModalContent>
    </Dialog>
  )
}

function AutomationPromptFields({
  disabled = false,
  name,
  prompt,
  setName,
  setPrompt,
}: {
  disabled?: boolean
  name: string
  prompt: string
  setName: (value: string) => void
  setPrompt: (value: string) => void
}) {
  return (
    <CardGroup className="grid">
      <Card>
        <CardHeader>
          <DashboardModalCardTitle>Prompt</DashboardModalCardTitle>
        </CardHeader>
        <CardContent>
          <Field>
            <FieldLabel>Name *</FieldLabel>
            <Input value={name} onChange={(event) => setName(event.target.value)} disabled={disabled} required />
          </Field>
          <Field>
            <FieldLabel>Prompt *</FieldLabel>
            <Textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              disabled={disabled}
              className="min-h-40"
              required
            />
          </Field>
        </CardContent>
      </Card>
    </CardGroup>
  )
}

function AutomationModelFields({
  children,
  disabled,
  model,
  provider,
  providerOptions,
  providers,
  providersEmptyMessage,
  setModel,
  setProvider,
}: {
  children?: React.ReactNode
  disabled: boolean
  model: string
  provider: AIProvider
  providerOptions: ConfiguredProvider[]
  providers: ConfiguredProvider[]
  providersEmptyMessage: string
  setModel: (value: string) => void
  setProvider: (provider: AIProvider) => void
}) {
  return (
    <CardGroup className="grid">
      <Card>
        <CardHeader>
          <DashboardModalCardTitle>Model</DashboardModalCardTitle>
        </CardHeader>
        <CardContent>
          {providers.length === 0 ? (
            <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              {providersEmptyMessage}
            </div>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel>Provider *</FieldLabel>
              <Select value={provider} onValueChange={(value) => setProvider(value as AIProvider)} disabled={disabled}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {providerOptions.map((item) => (
                    <SelectItem key={item.provider} value={item.provider}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Model *</FieldLabel>
              <Input value={model} onChange={(event) => setModel(event.target.value)} disabled={disabled} required />
            </Field>
            {children}
          </div>
        </CardContent>
      </Card>
    </CardGroup>
  )
}

function AutomationScheduleFields({
  dayOfMonth,
  dayOfWeek,
  disabled,
  frequency,
  setDayOfMonth,
  setDayOfWeek,
  setFrequency,
  setTime,
  setTimezone,
  time,
  timezone,
}: {
  dayOfMonth: number
  dayOfWeek: number
  disabled: boolean
  frequency: AiAutomationFrequency
  setDayOfMonth: (value: number) => void
  setDayOfWeek: (value: number) => void
  setFrequency: (value: AiAutomationFrequency) => void
  setTime: (value: string) => void
  setTimezone: (value: string) => void
  time: string
  timezone: string
}) {
  return (
    <CardGroup className="grid">
      <Card>
        <CardHeader>
          <DashboardModalCardTitle>Schedule</DashboardModalCardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel>Frequency</FieldLabel>
              <Select value={frequency} onValueChange={(value) => setFrequency(value as AiAutomationFrequency)} disabled={disabled}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Time</FieldLabel>
              <Input type="time" value={time} onChange={(event) => setTime(event.target.value)} disabled={disabled} />
            </Field>
            {frequency === "weekly" ? (
              <Field>
                <FieldLabel>Day</FieldLabel>
                <Select value={String(dayOfWeek)} onValueChange={(value) => setDayOfWeek(Number(value))} disabled={disabled}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WEEKDAYS.map((day, index) => (
                      <SelectItem key={day} value={String(index)}>
                        {day}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : null}
            {frequency === "monthly" ? (
              <Field>
                <FieldLabel>Day of month</FieldLabel>
                <Input
                  type="number"
                  min={1}
                  max={31}
                  value={dayOfMonth}
                  onChange={(event) => setDayOfMonth(Number(event.target.value))}
                  disabled={disabled}
                />
              </Field>
            ) : null}
            <Field>
              <FieldLabel>Timezone</FieldLabel>
              <Input value={timezone} onChange={(event) => setTimezone(event.target.value)} disabled={disabled} />
              <FieldDescription>Use an IANA timezone such as America/Toronto.</FieldDescription>
            </Field>
          </div>
        </CardContent>
      </Card>
    </CardGroup>
  )
}

function AutomationReferencesFields({
  addingFile,
  addingUrl,
  deletingReferenceId,
  fileInputRef,
  loading,
  onAddFile,
  onAddUrl,
  onDeleteReference,
  referenceFile,
  references,
  referenceUrl,
  setReferenceFile,
  setReferenceUrl,
}: {
  addingFile: boolean
  addingUrl: boolean
  deletingReferenceId: string | null
  fileInputRef: React.RefObject<HTMLInputElement | null>
  loading: boolean
  onAddFile: (event: React.FormEvent) => void
  onAddUrl: (event: React.FormEvent) => void
  onDeleteReference: (referenceId: string) => void
  referenceFile: File | null
  references: AiAgentAutomationReference[]
  referenceUrl: string
  setReferenceFile: (file: File | null) => void
  setReferenceUrl: (url: string) => void
}) {
  return (
    <CardGroup className="grid">
      <Card>
        <CardHeader>
          <DashboardModalCardTitle>References</DashboardModalCardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 lg:grid-cols-2">
            <form className="grid gap-3" onSubmit={onAddUrl}>
              <Field>
                <FieldLabel>HTTPS link</FieldLabel>
                <div className="flex gap-2">
                  <Input
                    value={referenceUrl}
                    onChange={(event) => setReferenceUrl(event.target.value)}
                    placeholder="https://example.com/events"
                    disabled={loading}
                  />
                  <Button type="submit" variant="outline" disabled={addingUrl || loading || !referenceUrl.trim()}>
                    {addingUrl ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
                    Add
                  </Button>
                </div>
              </Field>
            </form>
            <form className="grid gap-3" onSubmit={onAddFile}>
              <Field>
                <FieldLabel>Document</FieldLabel>
                <div className="flex gap-2">
                  <Input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.txt,.md,.markdown,.csv,.docx,text/plain,text/markdown,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    onChange={(event) => setReferenceFile(event.target.files?.[0] ?? null)}
                    disabled={loading}
                  />
                  <Button type="submit" variant="outline" disabled={addingFile || loading || !referenceFile}>
                    {addingFile ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                    Add
                  </Button>
                </div>
              </Field>
            </form>
          </div>

          <div className="overflow-hidden rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead column="main">Reference</TableHead>
                  <TableHead column="meta">Type</TableHead>
                  <TableHead column="meta">Size</TableHead>
                  <TableHead column="meta">Text</TableHead>
                  <TableHead column="meta">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                      Loading references...
                    </TableCell>
                  </TableRow>
                ) : references.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                      No references added.
                    </TableCell>
                  </TableRow>
                ) : (
                  references.map((reference) => (
                    <TableRow key={reference.id}>
                      <TableCell column="main">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{reference.label}</div>
                          {reference.source_url ? (
                            <a
                              href={reference.source_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex max-w-full items-center gap-1 truncate text-xs text-muted-foreground hover:text-foreground"
                            >
                              <span className="truncate">{reference.source_url}</span>
                              <ExternalLink className="h-3 w-3 shrink-0" />
                            </a>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell column="meta">
                        <Badge variant="outline">{reference.reference_type === "url" ? "URL" : "File"}</Badge>
                      </TableCell>
                      <TableCell column="mutedMeta">{formatBytes(reference.file_size) ?? "-"}</TableCell>
                      <TableCell column="mutedMeta">{reference.extracted_chars.toLocaleString()} chars</TableCell>
                      <TableCell column="meta">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => onDeleteReference(reference.id)}
                          disabled={deletingReferenceId === reference.id}
                          title="Delete reference"
                        >
                          {deletingReferenceId === reference.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                          <span className="sr-only">Delete reference</span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </CardGroup>
  )
}
