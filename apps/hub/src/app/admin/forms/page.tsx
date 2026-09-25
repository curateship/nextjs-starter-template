"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { AlertCircle, Archive, ClipboardList, ExternalLink, GripVertical, Plus, Send, Settings, Trash2 } from "lucide-react"
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { AdminLayout } from "@/components/admin/layout/admin-layout"
import {
  ConfirmDestructive,
  AdminErrorDialog,
  AdminListFooter,
  AdminListSkeleton,
  AdminSortButton,
  AdminTableShell,
  formatRelativeDate,
  useAdminBulkSelection,
  useAdminSort,
} from "@/components/admin/layout/list"
import { DashboardSubheader } from "@/components/admin/layout/dashboard/DashboardSubheader"
import { DashboardModalCardTitle, DashboardModalContent, DashboardModalFooterActions } from "@/components/admin/layout/dashboard/modals"
import { ModalTabs, ModalTabsProvider, useModalTabsDock } from "@/components/admin/layout/dashboard/modal-tabs"
import { StickyHeader } from "@/components/admin/layout/stickybar/StickyHeader"
import { useSiteSwitcher } from "@/components/admin/layout/providers/site-switcher-provider"
import {
  TableRightActions,
  TableRightActionsButton,
  TableRightActionsSearch,
  TableRightActionsSelectTrigger,
} from "@/components/admin/layout/content/table-right-actions"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardGroup, CardHeader } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  archiveGuidedForms,
  createGuidedForm,
  getGuidedFormsBySite,
  publishGuidedForm,
  updateGuidedForm,
  type GuidedForm,
} from "@/lib/actions/guided-forms/guided-form-actions"
import { getSiteUrl } from "@/lib/utils/site-url-generator"

type FormsSortColumn = "name" | "status" | "submissions" | "modified"
type FormStatusFilter = "all" | "draft" | "published" | "archived"

function prettyJson(value: unknown) {
  return JSON.stringify(value, null, 2)
}

function parseJsonArray(value: string) {
  const parsed = JSON.parse(value)
  if (!Array.isArray(parsed)) throw new Error("Expected an array")
  return parsed
}

type DraftStep = GuidedForm["draft_steps"][number]
type DraftField = DraftStep["fields"][number]

const FIELD_TYPE_OPTIONS: Array<{ value: DraftField["type"]; label: string }> = [
  { value: "short_text", label: "Short text" },
  { value: "long_text", label: "Long text" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "single_choice", label: "Single choice" },
  { value: "multi_choice", label: "Multi choice" },
  { value: "checkbox", label: "Checkbox" },
  { value: "consent", label: "Consent" },
]

function createDraftId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

function createDraftField(): DraftField {
  return {
    id: createDraftId("field"),
    type: "single_choice",
    label: "New question",
    required: false,
    options: ["Option 1", "Option 2"],
  }
}

function createDraftStep(): DraftStep {
  return {
    id: createDraftId("step"),
    title: "New step",
    description: "",
    fields: [createDraftField()],
  }
}

function SortableFieldEditor({
  field,
  fieldIndex,
  removeField,
  stepIndex,
  updateField,
}: {
  field: DraftField
  fieldIndex: number
  removeField: (stepIndex: number, fieldIndex: number) => void
  stepIndex: number
  updateField: (stepIndex: number, fieldIndex: number, updates: Partial<DraftField>) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: field.id })
  const usesOptions = field.type === "single_choice" || field.type === "multi_choice"
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} className="rounded-lg border bg-background p-3 transition-colors hover:border-muted-foreground">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              className="cursor-grab text-muted-foreground opacity-60 transition-opacity hover:opacity-100 active:cursor-grabbing"
              title="Drag to reorder question"
              {...attributes}
              {...listeners}
            >
              <GripVertical className="h-4 w-4" />
              <span className="sr-only">Drag to reorder question</span>
            </button>
            <span className="truncate text-sm font-medium">Question {fieldIndex + 1}</span>
          </div>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeField(stepIndex, fieldIndex)} title="Remove question">
            <Trash2 className="h-3.5 w-3.5" />
            <span className="sr-only">Remove question</span>
          </Button>
        </div>
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px]">
          <div className="space-y-1">
            <Label htmlFor={`field-label-${field.id}`} className="text-xs font-medium">Question</Label>
            <Input
              id={`field-label-${field.id}`}
              value={field.label}
              onChange={(event) => updateField(stepIndex, fieldIndex, { label: event.target.value })}
              placeholder="What are you looking for?"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`field-type-${field.id}`} className="text-xs font-medium">Type</Label>
            <Select
              value={field.type}
              onValueChange={(value) => updateField(stepIndex, fieldIndex, {
                type: value as DraftField["type"],
                options: value === "single_choice" || value === "multi_choice" ? (field.options?.length ? field.options : ["Option 1", "Option 2"]) : undefined,
              })}
            >
              <SelectTrigger id={`field-type-${field.id}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FIELD_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
          <div className="space-y-1">
            <Label htmlFor={`field-placeholder-${field.id}`} className="text-xs font-medium">Placeholder</Label>
            <Input
              id={`field-placeholder-${field.id}`}
              value={field.placeholder || ""}
              onChange={(event) => updateField(stepIndex, fieldIndex, { placeholder: event.target.value })}
              placeholder="Optional"
            />
          </div>
          <label className="flex items-end gap-2 pb-2 text-sm">
            <Checkbox
              checked={field.required === true}
              onCheckedChange={(checked) => updateField(stepIndex, fieldIndex, { required: checked === true })}
            />
            Required
          </label>
        </div>
        {usesOptions ? (
          <div className="space-y-1">
            <Label htmlFor={`field-options-${field.id}`} className="text-xs font-medium">Options</Label>
            <Input
              id={`field-options-${field.id}`}
              value={(field.options || []).join(", ")}
              onChange={(event) => updateField(stepIndex, fieldIndex, {
                options: event.target.value.split(",").map((option) => option.trim()).filter(Boolean),
              })}
              placeholder="Option 1, Option 2"
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}

function SortableStepEditor({
  addField,
  removeField,
  removeStep,
  step,
  stepIndex,
  updateField,
  updateStep,
}: {
  addField: (stepIndex: number) => void
  removeField: (stepIndex: number, fieldIndex: number) => void
  removeStep: (stepIndex: number) => void
  step: DraftStep
  stepIndex: number
  updateField: (stepIndex: number, fieldIndex: number, updates: Partial<DraftField>) => void
  updateStep: (stepIndex: number, updates: Partial<DraftStep>) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step.id })
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} className="rounded-lg border bg-background p-3 transition-colors hover:border-muted-foreground">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              className="cursor-grab text-muted-foreground opacity-60 transition-opacity hover:opacity-100 active:cursor-grabbing"
              title="Drag to reorder step"
              {...attributes}
              {...listeners}
            >
              <GripVertical className="h-4 w-4" />
              <span className="sr-only">Drag to reorder step</span>
            </button>
            <span className="truncate text-sm font-medium">Step {stepIndex + 1}</span>
            <span className="text-xs text-muted-foreground">{step.fields.length} question{step.fields.length === 1 ? "" : "s"}</span>
          </div>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeStep(stepIndex)} title="Remove step">
            <Trash2 className="h-3.5 w-3.5" />
            <span className="sr-only">Remove step</span>
          </Button>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
          <Label htmlFor={`step-title-${step.id}`} className="text-xs font-medium">Title</Label>
          <Input
            id={`step-title-${step.id}`}
            value={step.title}
            onChange={(event) => updateStep(stepIndex, { title: event.target.value })}
            placeholder="New step"
          />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`step-description-${step.id}`} className="text-xs font-medium">Description</Label>
            <Input
              id={`step-description-${step.id}`}
              value={step.description || ""}
              onChange={(event) => updateStep(stepIndex, { description: event.target.value })}
              placeholder="Optional"
            />
          </div>
        </div>
        <SortableContext items={step.fields.map((field) => field.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-3">
            {step.fields.map((field, fieldIndex) => (
              <SortableFieldEditor
                key={field.id}
                field={field}
                fieldIndex={fieldIndex}
                removeField={removeField}
                stepIndex={stepIndex}
                updateField={updateField}
              />
            ))}
          </div>
        </SortableContext>
      <Button type="button" variant="outline" onClick={() => addField(stepIndex)}>
        <Plus className="h-4 w-4" />
        Add question
      </Button>
      </div>
    </div>
  )
}

function getStatusBadge(form: GuidedForm) {
  if (form.status === "published") {
    return <Badge variant="default" className="bg-green-100 text-green-800 dark:bg-green-950/50 dark:text-green-300">Published</Badge>
  }
  if (form.status === "archived") {
    return <Badge variant="outline">Archived</Badge>
  }
  return <Badge variant="secondary">Draft</Badge>
}

function getFormSearchText(form: GuidedForm) {
  return `${form.name} ${form.slug} ${form.headline}`.toLowerCase()
}

function ErrorBanner({ message }: { message: string }) {
  if (!message) return null
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {message}
    </div>
  )
}

function CreateFormModal({
  onCancel,
  onSuccess,
  siteId,
}: {
  onCancel: () => void
  onSuccess: (form: GuidedForm) => void
  siteId: string
}) {
  const [name, setName] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!name.trim()) {
      setError("Form name is required")
      return
    }

    setSaving(true)
    setError("")
    const result = await createGuidedForm({ siteId, name })
    setSaving(false)
    if (result.error || !result.data) {
      setError(result.error || "Failed to create form")
      return
    }
    onSuccess(result.data)
  }

  return (
    <form id="create-guided-form" onSubmit={handleSubmit} className="contents">
      <DashboardModalContent
        title="Create Form"
        description="Create a post-signup question flow. You can configure questions, outcomes, and publishing after creation."
        footer={
          <>
            <Button type="button" variant="outline" onClick={onCancel} disabled={saving}>
              Cancel
            </Button>
            <DashboardModalFooterActions>
              <Button form="create-guided-form" type="submit" disabled={saving}>
                {saving ? "Creating..." : "Create"}
              </Button>
            </DashboardModalFooterActions>
          </>
        }
      >
        <ErrorBanner message={error} />
        <CardGroup className="grid">
          <Card>
            <CardHeader>
              <DashboardModalCardTitle>Form settings</DashboardModalCardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Label htmlFor="new-form-name">Name</Label>
                <Input
                  id="new-form-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Signup follow-up"
                />
              </div>
            </CardContent>
          </Card>
        </CardGroup>
      </DashboardModalContent>
    </form>
  )
}

function FormSettingsModal({
  form,
  onOpenChange,
  onSuccess,
  open,
}: {
  form: GuidedForm | null
  onOpenChange: (open: boolean) => void
  onSuccess: (form: GuidedForm) => void
  open: boolean
}) {
  if (!form) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <ModalTabsProvider>
        <FormSettingsModalContent form={form} onOpenChange={onOpenChange} onSuccess={onSuccess} />
      </ModalTabsProvider>
    </Dialog>
  )
}

function FormSettingsModalContent({
  form,
  onOpenChange,
  onSuccess,
}: {
  form: GuidedForm
  onOpenChange: (open: boolean) => void
  onSuccess: (form: GuidedForm) => void
}) {
  const tabs = useModalTabsDock()
  const activeTab = tabs?.activeTab || "flow"
  const setModalTabs = tabs?.setTabs
  const clearModalTabs = tabs?.clearTabs
  const [saving, setSaving] = useState(false)
  const [savingAction, setSavingAction] = useState<"save" | "publish" | null>(null)
  const [error, setError] = useState("")
  const [draft, setDraft] = useState({
    name: form.name,
    slug: form.slug,
    headline: form.headline,
    subhead: form.subhead,
    contactSync: form.contact_sync_enabled,
    adminNotification: form.admin_notification_enabled,
    adminNotificationEmail: form.admin_notification_email ?? "",
    steps: form.draft_steps,
    outcomesJson: prettyJson(form.draft_outcomes),
  })
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  useEffect(() => {
    setModalTabs?.([
      { value: "flow", label: "Flow" },
      { value: "settings", label: "Settings" },
    ], "flow")
    return () => clearModalTabs?.()
  }, [clearModalTabs, setModalTabs])

  useEffect(() => {
    setDraft({
      name: form.name,
      slug: form.slug,
      headline: form.headline,
      subhead: form.subhead,
      contactSync: form.contact_sync_enabled,
      adminNotification: form.admin_notification_enabled,
      adminNotificationEmail: form.admin_notification_email ?? "",
      steps: form.draft_steps,
      outcomesJson: prettyJson(form.draft_outcomes),
    })
    setError("")
  }, [form])

  async function saveDraft() {
    const result = await updateGuidedForm(form.id, {
      name: draft.name,
      slug: draft.slug,
      headline: draft.headline,
      subhead: draft.subhead,
      contact_sync_enabled: draft.contactSync,
      admin_notification_enabled: draft.adminNotification,
      admin_notification_email: draft.adminNotificationEmail,
      draft_steps: draft.steps,
      draft_outcomes: parseJsonArray(draft.outcomesJson),
    })

    if (result.error || !result.data) {
      throw new Error(result.error || "Failed to save form")
    }
    return result.data
  }

  async function handleSave() {
    setSaving(true)
    setSavingAction("save")
    setError("")
    try {
      const updated = await saveDraft()
      onSuccess(updated)
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save form")
    }
    setSaving(false)
    setSavingAction(null)
  }

  async function handlePublish() {
    setSaving(true)
    setSavingAction("publish")
    setError("")
    try {
      const updated = await saveDraft()
      const result = await publishGuidedForm(form.id)
      if (result.error) throw new Error(result.error)
      onSuccess({ ...updated, status: "published" })
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to publish form")
    }
    setSaving(false)
    setSavingAction(null)
  }

  function updateStep(stepIndex: number, updates: Partial<DraftStep>) {
    setDraft((current) => ({
      ...current,
      steps: current.steps.map((step, index) => index === stepIndex ? { ...step, ...updates } : step),
    }))
  }

  function updateField(stepIndex: number, fieldIndex: number, updates: Partial<DraftField>) {
    setDraft((current) => ({
      ...current,
      steps: current.steps.map((step, index) => {
        if (index !== stepIndex) return step
        return {
          ...step,
          fields: step.fields.map((field, fieldPosition) => fieldPosition === fieldIndex ? { ...field, ...updates } : field),
        }
      }),
    }))
  }

  function addStep() {
    setDraft((current) => ({ ...current, steps: [...current.steps, createDraftStep()] }))
  }

  function removeStep(stepIndex: number) {
    setDraft((current) => ({ ...current, steps: current.steps.filter((_, index) => index !== stepIndex) }))
  }

  function addField(stepIndex: number) {
    setDraft((current) => ({
      ...current,
      steps: current.steps.map((step, index) => index === stepIndex ? { ...step, fields: [...step.fields, createDraftField()] } : step),
    }))
  }

  function removeField(stepIndex: number, fieldIndex: number) {
    setDraft((current) => ({
      ...current,
      steps: current.steps.map((step, index) => index === stepIndex ? { ...step, fields: step.fields.filter((_, fieldPosition) => fieldPosition !== fieldIndex) } : step),
    }))
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    setDraft((current) => {
      const oldIndex = current.steps.findIndex((step) => step.id === active.id)
      const newIndex = current.steps.findIndex((step) => step.id === over.id)
      if (oldIndex !== -1 && newIndex !== -1) {
        return { ...current, steps: arrayMove(current.steps, oldIndex, newIndex) }
      }

      const activeStepIndex = current.steps.findIndex((step) => step.fields.some((field) => field.id === active.id))
      const overStepIndex = current.steps.findIndex((step) => step.fields.some((field) => field.id === over.id))
      if (activeStepIndex === -1 || activeStepIndex !== overStepIndex) return current

      const step = current.steps[activeStepIndex]
      const activeFieldIndex = step.fields.findIndex((field) => field.id === active.id)
      const overFieldIndex = step.fields.findIndex((field) => field.id === over.id)
      if (activeFieldIndex === -1 || overFieldIndex === -1) return current

      return {
        ...current,
        steps: current.steps.map((item, index) => index === activeStepIndex
          ? { ...item, fields: arrayMove(item.fields, activeFieldIndex, overFieldIndex) }
          : item),
      }
    })
  }

  return (
    <DashboardModalContent
      title={
        <span className="flex min-w-0 items-center gap-3">
          <span className="truncate">Configure &quot;{form.name}&quot;</span>
          {getStatusBadge(form)}
        </span>
      }
      titleAccessory={<ModalTabs />}
      footer={
        <>
          <div />
          <DashboardModalFooterActions>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="button" variant="outline" onClick={handleSave} disabled={saving}>
              {savingAction === "save" ? "Saving..." : "Save"}
            </Button>
            <Button type="button" onClick={handlePublish} disabled={saving || form.status === "archived"}>
              {savingAction === "publish" ? "Publishing..." : "Publish"}
            </Button>
          </DashboardModalFooterActions>
        </>
      }
      footerClassName="sm:justify-between"
      className="max-w-[1040px]"
    >
      <ErrorBanner message={error} />

      {activeTab === "settings" ? (
        <CardGroup className="grid">
          <Card>
            <CardHeader>
              <DashboardModalCardTitle>Form settings</DashboardModalCardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="form-name">Name</Label>
                  <Input id="form-name" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="form-slug">Slug</Label>
                  <Input id="form-slug" value={draft.slug} onChange={(event) => setDraft((current) => ({ ...current, slug: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="form-headline">Headline</Label>
                  <Input id="form-headline" value={draft.headline} onChange={(event) => setDraft((current) => ({ ...current, headline: event.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="form-subhead">Subhead</Label>
                  <Input id="form-subhead" value={draft.subhead} onChange={(event) => setDraft((current) => ({ ...current, subhead: event.target.value }))} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
            <DashboardModalCardTitle>Post-signup handling</DashboardModalCardTitle>
            </CardHeader>
            <CardContent>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={draft.contactSync} onCheckedChange={(checked) => setDraft((current) => ({ ...current, contactSync: checked === true }))} />
                Update matching newsletter contact metadata
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={draft.adminNotification} onCheckedChange={(checked) => setDraft((current) => ({ ...current, adminNotification: checked === true }))} />
                Admin notification
              </label>
              <div className="space-y-2">
                <Label htmlFor="form-notification-email">Notification email</Label>
                <Input id="form-notification-email" type="email" value={draft.adminNotificationEmail} onChange={(event) => setDraft((current) => ({ ...current, adminNotificationEmail: event.target.value }))} />
              </div>
            </CardContent>
          </Card>
        </CardGroup>
      ) : null}

      {activeTab === "flow" ? (
        <CardGroup className="grid">
          <Card>
            <CardHeader>
              <DashboardModalCardTitle>Questions</DashboardModalCardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {draft.steps.length === 0 ? (
                  <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                    No steps yet. Add a step to start building your follow-up form.
                  </div>
                ) : null}
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                  <SortableContext items={draft.steps.map((step) => step.id)} strategy={verticalListSortingStrategy}>
                    <div className="space-y-4">
                      {draft.steps.map((step, stepIndex) => (
                        <SortableStepEditor
                          key={step.id}
                          addField={addField}
                          removeField={removeField}
                          removeStep={removeStep}
                          step={step}
                          stepIndex={stepIndex}
                          updateField={updateField}
                          updateStep={updateStep}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
                <Button type="button" variant="outline" onClick={addStep}>
                  <Plus className="h-4 w-4" />
                  Add step
                </Button>
              </div>
            </CardContent>
          </Card>
        </CardGroup>
      ) : null}

    </DashboardModalContent>
  )
}

export default function AdminGuidedFormsPage() {
  const { currentSite, loading: sitesLoading, pageSize: contextPageSize } = useSiteSwitcher()
  const [forms, setForms] = useState<GuidedForm[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [errorDialogOpen, setErrorDialogOpen] = useState(false)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [settingsForm, setSettingsForm] = useState<GuidedForm | null>(null)
  const [pendingArchiveId, setPendingArchiveId] = useState<string | null>(null)
  const [archiving, setArchiving] = useState(false)
  const [archiveError, setArchiveError] = useState<string | null>(null)
  const [bulkArchiving, setBulkArchiving] = useState(false)
  const [bulkArchiveConfirmOpen, setBulkArchiveConfirmOpen] = useState(false)
  const [publishingId, setPublishingId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [filterStatus, setFilterStatus] = useState<FormStatusFilter>("all")
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(contextPageSize)
  const formSelection = useAdminBulkSelection()
  const formSort = useAdminSort<FormsSortColumn>("modified", "desc")

  const loadForms = useCallback(async () => {
    if (!currentSite?.id) {
      setForms([])
      setLoading(!sitesLoading)
      return
    }

    setLoading(true)
    const result = await getGuidedFormsBySite(currentSite.id, { pageSize: 100 })
    setLoading(false)
    if (result.error) {
      setError(result.error)
      setErrorDialogOpen(true)
      return
    }
    setForms(result.data ?? [])
  }, [currentSite?.id, sitesLoading])

  useEffect(() => {
    loadForms()
  }, [loadForms])

  useEffect(() => {
    setPageSize(contextPageSize)
    setCurrentPage(1)
  }, [contextPageSize])

  const statusCounts = useMemo(() => ({
    all: forms.length,
    draft: forms.filter((form) => form.status === "draft").length,
    published: forms.filter((form) => form.status === "published").length,
    archived: forms.filter((form) => form.status === "archived").length,
  }), [forms])

  const filteredForms = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return forms.filter((form) => {
      if (filterStatus !== "all" && form.status !== filterStatus) return false
      return !query || getFormSearchText(form).includes(query)
    })
  }, [filterStatus, forms, searchQuery])

  const sortedForms = useMemo(() => {
    const items = [...filteredForms]
    const direction = formSort.sortDirection === "asc" ? 1 : -1
    return items.sort((a, b) => {
      if (formSort.sortColumn === "name") return a.name.localeCompare(b.name) * direction
      if (formSort.sortColumn === "status") return a.status.localeCompare(b.status) * direction
      if (formSort.sortColumn === "submissions") return (a.submission_count - b.submission_count) * direction
      return (new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()) * direction
    })
  }, [filteredForms, formSort.sortColumn, formSort.sortDirection])

  const total = sortedForms.length
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safeCurrentPage = Math.min(currentPage, totalPages)
  const visibleForms = sortedForms.slice((safeCurrentPage - 1) * pageSize, safeCurrentPage * pageSize)
  const visibleFormIds = visibleForms.map((form) => form.id)
  const publicSiteUrl = currentSite ? getSiteUrl(currentSite) : ""

  function showError(message: string) {
    setError(message)
    setErrorDialogOpen(true)
  }

  function handleFormUpdated(updated: GuidedForm) {
    setForms((current) => current.map((form) => form.id === updated.id ? { ...form, ...updated } : form))
  }

  async function handlePublish(form: GuidedForm) {
    setPublishingId(form.id)
    const result = await publishGuidedForm(form.id)
    setPublishingId(null)
    if (result.error) {
      showError(result.error)
      return
    }
    setForms((current) => current.map((item) => item.id === form.id ? { ...item, status: "published" } : item))
  }

  async function confirmArchive() {
    if (!pendingArchiveId) return
    const formId = pendingArchiveId
    setArchiving(true)
    const result = await archiveGuidedForms([formId])
    setArchiving(false)
    if (result.error) {
      setArchiveError(result.error)
      return
    }
    setForms((current) => current.map((form) => form.id === formId ? { ...form, status: "archived" } : form))
    formSelection.remove(formId)
    setPendingArchiveId(null)
  }

  async function handleBulkArchive() {
    const ids = Array.from(formSelection.selectedIds)
    if (!ids.length) return

    setBulkArchiving(true)
    const result = await archiveGuidedForms(ids)
    setBulkArchiving(false)
    if (result.error) {
      setArchiveError(result.error)
      return
    }
    setForms((current) => current.map((form) => ids.includes(form.id) ? { ...form, status: "archived" } : form))
    formSelection.clearSelection()
    setBulkArchiveConfirmOpen(false)
  }

  function renderSortHeader(column: FormsSortColumn, label: string) {
    return (
      <AdminSortButton
        active={formSort.sortColumn === column}
        direction={formSort.sortDirection}
        onClick={() => formSort.toggleSort(column)}
      >
        {label}
      </AdminSortButton>
    )
  }

  return (
    <>
      <StickyHeader />
      <AdminLayout>
        <DashboardSubheader items={[{ label: "Forms" }]} />

        <AdminTableShell
          title="Forms"
          icon={<ClipboardList className="text-muted-foreground" />}
          count={total}
          selectedCount={formSelection.selectedCount}
          onClearSelection={formSelection.clearSelection}
          titleActions={formSelection.selectedCount > 0 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-2"
              onClick={() => { setArchiveError(null); setBulkArchiveConfirmOpen(true) }}
              disabled={bulkArchiving}
            >
              <Archive className="size-4" />
              Archive ({formSelection.selectedCount})
            </Button>
          ) : null}
          status={error ? { tone: "error", text: error } : null}
          controls={
            <TableRightActions>
              <TableRightActionsSearch
                value={searchQuery}
                onChange={(event) => {
                  setSearchQuery(event.target.value)
                  setCurrentPage(1)
                }}
                placeholder="Search forms"
              />
              <Select
                value={filterStatus}
                onValueChange={(value) => {
                  setFilterStatus(value as FormStatusFilter)
                  setCurrentPage(1)
                }}
              >
                <TableRightActionsSelectTrigger aria-label="Form status filter">
                  <SelectValue />
                </TableRightActionsSelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All ({statusCounts.all})</SelectItem>
                  <SelectItem value="published">Published ({statusCounts.published})</SelectItem>
                  <SelectItem value="draft">Draft ({statusCounts.draft})</SelectItem>
                  <SelectItem value="archived">Archived ({statusCounts.archived})</SelectItem>
                </SelectContent>
              </Select>
              <TableRightActionsButton onClick={() => setShowCreateDialog(true)} disabled={!currentSite?.id}>
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Create Form</span>
              </TableRightActionsButton>
            </TableRightActions>
          }
          footer={!loading ? (
            <AdminListFooter
              currentPage={safeCurrentPage}
              pageSize={pageSize}
              total={total}
              onPageChange={setCurrentPage}
              onPageSizeChange={setPageSize}
            />
          ) : null}
        >
          <ScrollArea className="w-full">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead column="select">
                    <Checkbox
                      checked={formSelection.isPageSelected(visibleFormIds)}
                      onCheckedChange={() => formSelection.togglePage(visibleFormIds)}
                      aria-label="Select all forms"
                    />
                  </TableHead>
                  <TableHead column="main">{renderSortHeader("name", "Form")}</TableHead>
                  <TableHead column="meta">{renderSortHeader("status", "Status")}</TableHead>
                  <TableHead column="meta">{renderSortHeader("submissions", "Submissions")}</TableHead>
                  <TableHead column="meta">{renderSortHeader("modified", "Modified")}</TableHead>
                  <TableHead column="meta">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <AdminListSkeleton columns={6} rowCount={5} actionCount={4} />
                ) : error ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center">
                      <AlertCircle className="mx-auto h-10 w-10 text-destructive" />
                      <h3 className="mt-4 text-lg font-semibold">Error Loading Forms</h3>
                      <p className="text-muted-foreground">{error}</p>
                    </TableCell>
                  </TableRow>
                ) : visibleForms.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center">
                      <ClipboardList className="mx-auto h-10 w-10 text-muted-foreground" />
                      <h3 className="mt-4 text-lg font-semibold">No forms found</h3>
                      <p className="mt-2 text-muted-foreground">Create a guided form to capture submissions.</p>
                      <Button onClick={() => setShowCreateDialog(true)} className="mt-4" variant="outline" disabled={!currentSite?.id}>
                        Create Form
                      </Button>
                    </TableCell>
                  </TableRow>
                ) : visibleForms.map((form) => (
                  <TableRow
                    key={form.id}
                    data-state={formSelection.selectedIds.has(form.id) ? "selected" : undefined}
                    className="group"
                  >
                    <TableCell column="select">
                      <Checkbox
                        checked={formSelection.selectedIds.has(form.id)}
                        onCheckedChange={() => formSelection.toggleOne(form.id)}
                        aria-label={`Select ${form.name}`}
                      />
                    </TableCell>
                    <TableCell column="main">
                      <Link
                        href={`/admin/forms/${form.id}/submissions`}
                        className="flex min-w-0 items-center space-x-4 text-left transition-opacity hover:opacity-80"
                      >
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-muted">
                          <ClipboardList className="h-5 w-5 text-muted-foreground" />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium hover:underline sm:text-base">{form.name}</span>
                          <span className="block truncate text-xs text-muted-foreground sm:text-sm">/forms/{form.slug}</span>
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell column="meta">{getStatusBadge(form)}</TableCell>
                    <TableCell column="meta">{form.submission_count.toLocaleString()}</TableCell>
                    <TableCell column="mutedMeta">{formatRelativeDate(form.updated_at)}</TableCell>
                    <TableCell column="meta">
                      <div className="flex items-center">
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => setSettingsForm(form)} title="Form settings">
                          <Settings className="h-4 w-4" />
                          <span className="sr-only">Form settings</span>
                        </Button>
                        {form.status === "published" ? (
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" asChild>
                            <Link href={`${publicSiteUrl}/forms/${form.slug}`} target="_blank" title="Open form">
                              <ExternalLink className="h-4 w-4" />
                              <span className="sr-only">Open form</span>
                            </Link>
                          </Button>
                        ) : null}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => handlePublish(form)}
                          disabled={publishingId === form.id || form.status === "archived"}
                          title="Publish"
                        >
                          <Send className="h-4 w-4" />
                          <span className="sr-only">Publish</span>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => { setArchiveError(null); setPendingArchiveId(form.id) }}
                          disabled={form.status === "archived"}
                          title="Archive"
                        >
                          <Archive className="h-4 w-4" />
                          <span className="sr-only">Archive</span>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </AdminTableShell>

        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          {currentSite?.id ? (
            <CreateFormModal
              siteId={currentSite.id}
              onCancel={() => setShowCreateDialog(false)}
              onSuccess={(form) => {
                setForms((current) => [form, ...current])
                setShowCreateDialog(false)
                setSettingsForm(form)
              }}
            />
          ) : null}
        </Dialog>

        <FormSettingsModal
          open={settingsForm !== null}
          form={settingsForm}
          onOpenChange={(open) => {
            if (!open) setSettingsForm(null)
          }}
          onSuccess={handleFormUpdated}
        />

        <ConfirmDestructive
          action="archive-form"
          open={pendingArchiveId !== null}
          title="Archive Form"
          description="Archive this form? Archived forms cannot receive public submissions."
          disabled={archiving}
          error={archiveError}
          confirmLabel={archiving ? "Archiving..." : "Archive"}
          impactRequest={currentSite?.id && pendingArchiveId
            ? { ids: [pendingArchiveId], siteId: currentSite.id, target: "form" }
            : undefined}
          onCancel={() => { setPendingArchiveId(null); setArchiveError(null) }}
          onConfirm={confirmArchive}
        />

        <ConfirmDestructive
          action="archive-form"
          open={bulkArchiveConfirmOpen}
          title={`Archive ${formSelection.selectedCount} form${formSelection.selectedCount === 1 ? "" : "s"}?`}
          disabled={bulkArchiving}
          error={archiveError}
          confirmLabel={bulkArchiving ? "Archiving..." : "Archive"}
          impactRequest={currentSite?.id && formSelection.selectedCount
            ? { ids: Array.from(formSelection.selectedIds), siteId: currentSite.id, target: "form" }
            : undefined}
          onCancel={() => { setBulkArchiveConfirmOpen(false); setArchiveError(null) }}
          onConfirm={handleBulkArchive}
        />

        <AdminErrorDialog
          open={errorDialogOpen}
          message={error}
          onOpenChange={(open) => {
            setErrorDialogOpen(open)
            if (!open) setError("")
          }}
        />
      </AdminLayout>
    </>
  )
}
