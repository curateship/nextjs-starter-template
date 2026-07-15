import * as React from "react"
import { Loader2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import type { AdminAction, AdminData } from "@/lib/api/admin"
import {
  adminActionSchema,
  adminCreateRecordSchema,
  adminUpdateRecordSchema,
  type PomoderAdminSection,
} from "@/server/admin-contract"

type FormValue = string | boolean
type FormState = Record<string, FormValue>
type Option = { value: string; label: string }
type Field = {
  name: string
  label: string
  type?:
    | "text"
    | "email"
    | "password"
    | "number"
    | "date"
    | "month"
    | "datetime-local"
    | "textarea"
    | "checkbox"
    | "select"
  required?: boolean
  min?: number
  max?: number
  options?: Option[]
  placeholder?: string
}

const sectionLabels: Record<PomoderAdminSection, string> = {
  users: "User",
  tasks: "Task",
  sessions: "Focus Session",
  rooms: "Room",
  media: "Media Asset",
  billing: "Subscription",
  ai: "AI Usage",
  reports: "Report",
}

export function PomoderAdminRecordDialog({
  section,
  data,
  editingId,
  onOpenChange,
  onSave,
}: {
  section: PomoderAdminSection
  data: AdminData
  editingId: string | null
  onOpenChange: (open: boolean) => void
  onSave: (action: AdminAction) => Promise<boolean>
}) {
  const editing = editingId !== null
  const [form, setForm] = React.useState<FormState>(() =>
    getInitialForm(section, data, editingId)
  )
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState("")
  const fields = getFields(section, data, editing)

  async function save() {
    const rawRecord = getRecord(section, form, editing)
    const result = (
      editing ? adminUpdateRecordSchema : adminCreateRecordSchema
    ).safeParse(rawRecord)
    if (!result.success) {
      setError("Check all required fields and values.")
      return
    }

    setSaving(true)
    setError("")
    const actionResult = adminActionSchema.safeParse(
      editing
        ? { type: "update_record" as const, id: editingId, record: result.data }
        : { type: "create_record" as const, record: result.data }
    )
    if (!actionResult.success) {
      setSaving(false)
      setError("The admin action is invalid.")
      return
    }
    const saved = await onSave(actionResult.data)
    setSaving(false)
    if (saved) onOpenChange(false)
    else
      setError(
        "The record could not be saved. Check for duplicate or conflicting values."
      )
  }

  const label = sectionLabels[section]
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!saving) onOpenChange(open)
      }}
    >
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>
            {editing ? `Edit ${label}` : `Add ${label}`}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? "Update the managed record."
              : "Create a new managed record."}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-4 sm:grid-cols-2">
          {fields.map((field) => (
            <FormField
              key={field.name}
              field={field}
              value={form[field.name]}
              disabled={saving}
              onChange={(value) =>
                setForm((current) => ({ ...current, [field.name]: value }))
              }
            />
          ))}
          {error ? (
            <p role="alert" className="text-sm text-destructive sm:col-span-2">
              {error}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter variant="plain">
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" disabled={saving} onClick={() => void save()}>
            {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
            {saving ? "Saving" : editing ? "Save Changes" : `Add ${label}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function FormField({
  field,
  value,
  disabled,
  onChange,
}: {
  field: Field
  value: FormValue | undefined
  disabled: boolean
  onChange: (value: FormValue) => void
}) {
  const id = `pomoder-admin-${field.name}`
  if (field.type === "checkbox") {
    return (
      <div className="flex items-center gap-2 self-end pb-2">
        <Checkbox
          id={id}
          checked={Boolean(value)}
          disabled={disabled}
          onCheckedChange={(checked) => onChange(checked === true)}
        />
        <Label htmlFor={id}>{field.label}</Label>
      </div>
    )
  }

  return (
    <div
      className={
        field.type === "textarea" ? "grid gap-2 sm:col-span-2" : "grid gap-2"
      }
    >
      <Label htmlFor={id}>{field.label}</Label>
      {field.type === "select" ? (
        <Select
          value={String(value || "__none__")}
          disabled={disabled}
          onValueChange={(next) => onChange(next === "__none__" ? "" : next)}
        >
          <SelectTrigger id={id} className="h-8 w-full">
            <SelectValue placeholder={`Select ${field.label.toLowerCase()}`} />
          </SelectTrigger>
          <SelectContent>
            {!field.required ? (
              <SelectItem value="__none__">None</SelectItem>
            ) : null}
            {field.options?.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : field.type === "textarea" ? (
        <Textarea
          id={id}
          required={field.required}
          disabled={disabled}
          value={String(value || "")}
          placeholder={field.placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <Input
          id={id}
          type={field.type || "text"}
          required={field.required}
          disabled={disabled}
          min={field.min}
          max={field.max}
          value={String(value ?? "")}
          placeholder={field.placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </div>
  )
}

function getFields(
  section: PomoderAdminSection,
  data: AdminData,
  editing: boolean
): Field[] {
  const users = data.lookups.users.map((user) => ({
    value: user.id,
    label: `${user.name} (${user.email})`,
  }))
  const tasks = data.lookups.tasks.map((task) => ({
    value: task.id,
    label: `${task.title} (${task.email})`,
  }))
  const rooms = data.lookups.rooms.map((room) => ({
    value: room.id,
    label: room.name,
  }))
  if (section === "users")
    return [
      { name: "name", label: "Name", required: true },
      { name: "email", label: "Email", type: "email", required: true },
      {
        name: "role",
        label: "Role",
        type: "select",
        required: true,
        options: options("user", "admin"),
      },
      {
        name: "password",
        label: editing ? "New Password" : "Password",
        type: "password",
        required: !editing,
        placeholder: editing
          ? "Leave blank to keep current password"
          : undefined,
      },
      { name: "verified", label: "Email Verified", type: "checkbox" },
    ]
  if (section === "tasks")
    return [
      {
        name: "userId",
        label: "User",
        type: "select",
        required: true,
        options: users,
      },
      { name: "title", label: "Task", required: true },
      { name: "plannedDate", label: "Date", type: "date", required: true },
      {
        name: "status",
        label: "Status",
        type: "select",
        required: true,
        options: options("active", "completed", "carried", "abandoned"),
      },
      {
        name: "pomodoroCount",
        label: "Pomodoro Count",
        type: "number",
        required: true,
        min: 0,
      },
    ]
  if (section === "sessions")
    return [
      {
        name: "userId",
        label: "User",
        type: "select",
        required: true,
        options: users,
      },
      { name: "taskId", label: "Task", type: "select", options: tasks },
      { name: "roomId", label: "Room", type: "select", options: rooms },
      {
        name: "mode",
        label: "Mode",
        type: "select",
        required: true,
        options: options("focus", "short", "long"),
      },
      {
        name: "status",
        label: "Status",
        type: "select",
        required: true,
        options: options("running", "paused", "completed", "cancelled"),
      },
      {
        name: "plannedSeconds",
        label: "Planned Seconds",
        type: "number",
        required: true,
        min: 1,
        max: 86400,
      },
      {
        name: "accumulatedSeconds",
        label: "Accumulated Seconds",
        type: "number",
        required: true,
        min: 0,
        max: 86400,
      },
    ]
  if (section === "rooms")
    return [
      {
        name: "hostUserId",
        label: "Host",
        type: "select",
        required: true,
        options: users,
      },
      { name: "name", label: "Name", required: true },
      { name: "slug", label: "Slug", required: true },
      {
        name: "visibility",
        label: "Visibility",
        type: "select",
        required: true,
        options: options("public", "unlisted"),
      },
      {
        name: "phase",
        label: "Phase",
        type: "select",
        required: true,
        options: options("waiting", "focus", "short", "long", "closed"),
      },
      {
        name: "focusMinutes",
        label: "Focus Minutes",
        type: "number",
        required: true,
        min: 1,
        max: 90,
      },
      {
        name: "shortBreakMinutes",
        label: "Short Break Minutes",
        type: "number",
        required: true,
        min: 1,
        max: 90,
      },
      {
        name: "longBreakMinutes",
        label: "Long Break Minutes",
        type: "number",
        required: true,
        min: 1,
        max: 90,
      },
      { name: "autoStart", label: "Auto-start Next", type: "checkbox" },
    ]
  if (section === "media")
    return [
      ...(!editing
        ? [
            {
              name: "ownerUserId",
              label: "Owner",
              type: "select",
              options: users,
            } as Field,
            {
              name: "kind",
              label: "Kind",
              type: "select",
              required: true,
              options: options("image", "video", "audio"),
            } as Field,
            {
              name: "source",
              label: "Source",
              type: "select",
              required: true,
              options: options("curated", "upload", "ai"),
            } as Field,
            {
              name: "storageKey",
              label: "Storage Key",
              required: true,
              placeholder: "curated/... or users/{owner-id}/...",
            } as Field,
          ]
        : []),
      { name: "name", label: "Name", required: true },
      {
        name: "status",
        label: "Status",
        type: "select",
        required: true,
        options: options("queued", "processing", "ready", "failed"),
      },
      { name: "mimeType", label: "MIME Type", required: true },
      {
        name: "fileSize",
        label: "File Size (bytes)",
        type: "number",
        required: true,
        min: 0,
      },
      { name: "premium", label: "Pro Asset", type: "checkbox" },
    ]
  if (section === "billing")
    return [
      {
        name: "userId",
        label: "User",
        type: "select",
        required: true,
        options: users,
      },
      { name: "stripeCustomerId", label: "Stripe Customer ID", required: true },
      { name: "stripeSubscriptionId", label: "Stripe Subscription ID" },
      { name: "status", label: "Status", required: true },
      { name: "priceId", label: "Price ID" },
      {
        name: "currentPeriodEnd",
        label: "Current Period End",
        type: "datetime-local",
      },
      {
        name: "cancelAtPeriodEnd",
        label: "Cancel at Period End",
        type: "checkbox",
      },
    ]
  if (section === "ai")
    return [
      {
        name: "userId",
        label: "User",
        type: "select",
        required: true,
        options: users,
      },
      { name: "month", label: "Month", type: "month", required: true },
      {
        name: "kind",
        label: "Kind",
        type: "select",
        required: true,
        options: options("background", "soundscape"),
      },
      {
        name: "reserved",
        label: "Reserved",
        type: "number",
        required: true,
        min: 0,
      },
      {
        name: "completed",
        label: "Completed",
        type: "number",
        required: true,
        min: 0,
      },
      {
        name: "refunded",
        label: "Refunded",
        type: "number",
        required: true,
        min: 0,
      },
    ]
  return [
    {
      name: "roomId",
      label: "Room",
      type: "select",
      required: true,
      options: rooms,
    },
    {
      name: "reporterUserId",
      label: "Reporter",
      type: "select",
      required: true,
      options: users,
    },
    { name: "reason", label: "Reason", type: "textarea", required: true },
  ]
}

function getInitialForm(
  section: PomoderAdminSection,
  data: AdminData,
  editingId: string | null
): FormState {
  const today = new Date().toISOString().slice(0, 10)
  const userId = data.users[0]?.id || ""
  if (section === "users") {
    const user = data.users.find((item) => item.id === editingId)
    return {
      name: user?.name || "",
      email: user?.email || "",
      role: user?.role || "user",
      password: "",
      verified: Boolean(user?.emailVerifiedAt),
    }
  }
  if (section === "tasks") {
    const row = data.tasks.find(({ task }) => task.id === editingId)?.task
    return {
      userId: row?.userId || userId,
      title: row?.title || "",
      plannedDate: row?.plannedDate || today,
      status: row?.status || "active",
      pomodoroCount: String(row?.pomodoroCount ?? 0),
    }
  }
  if (section === "sessions") {
    const row = data.focusSessions.find(
      ({ session }) => session.id === editingId
    )?.session
    return {
      userId: row?.userId || userId,
      taskId: row?.taskId || "",
      roomId: row?.roomId || "",
      mode: row?.mode || "focus",
      status: row?.status || "running",
      plannedSeconds: String(row?.plannedSeconds ?? 1500),
      accumulatedSeconds: String(row?.accumulatedSeconds ?? 0),
    }
  }
  if (section === "rooms") {
    const row = data.rooms.find(({ room }) => room.id === editingId)?.room
    return {
      hostUserId: row?.hostUserId || userId,
      slug: row?.slug || "",
      name: row?.name || "",
      visibility: row?.visibility || "public",
      phase: row?.phase || "waiting",
      focusMinutes: String(row?.focusMinutes ?? 25),
      shortBreakMinutes: String(row?.shortBreakMinutes ?? 5),
      longBreakMinutes: String(row?.longBreakMinutes ?? 15),
      autoStart: row?.autoStart || false,
    }
  }
  if (section === "media") {
    const row = data.media.find(({ media }) => media.id === editingId)?.media
    return {
      ownerUserId: row?.ownerUserId || "",
      name: row?.name || "",
      kind: row?.kind || "image",
      source: row?.source || "curated",
      status: row?.status || "ready",
      storageKey: row?.storageKey || "curated/",
      mimeType: row?.mimeType || "image/png",
      fileSize: String(row?.fileSize ?? 0),
      premium: row?.premium || false,
    }
  }
  if (section === "billing") {
    const row = data.subscriptions.find(
      ({ subscription }) => subscription.id === editingId
    )?.subscription
    return {
      userId: row?.userId || userId,
      stripeCustomerId: row?.stripeCustomerId || "",
      stripeSubscriptionId: row?.stripeSubscriptionId || "",
      status: row?.status || "active",
      priceId: row?.priceId || "",
      currentPeriodEnd: toDateTimeLocal(row?.currentPeriodEnd),
      cancelAtPeriodEnd: row?.cancelAtPeriodEnd || false,
    }
  }
  if (section === "ai") {
    const row = data.generationUsage.find(
      ({ usage }) => usage.id === editingId
    )?.usage
    return {
      userId: row?.userId || userId,
      month: (row?.month || today).slice(0, 7),
      kind: row?.kind || "background",
      reserved: String(row?.reserved ?? 0),
      completed: String(row?.completed ?? 0),
      refunded: String(row?.refunded ?? 0),
    }
  }
  const row = data.reports.find(({ report }) => report.id === editingId)?.report
  return {
    roomId: row?.roomId || data.rooms[0]?.room.id || "",
    reporterUserId: row?.reporterUserId || userId,
    reason: row?.reason || "",
  }
}

function getRecord(
  section: PomoderAdminSection,
  form: FormState,
  editing: boolean
) {
  const text = (name: string) => String(form[name] || "").trim()
  const number = (name: string) => Number(text(name))
  const nullable = (name: string) => text(name) || null
  if (section === "users")
    return {
      resource: section,
      name: text("name"),
      email: text("email"),
      role: text("role"),
      verified: Boolean(form.verified),
      ...(!editing || text("password") ? { password: text("password") } : {}),
    }
  if (section === "tasks")
    return {
      resource: section,
      userId: text("userId"),
      title: text("title"),
      plannedDate: text("plannedDate"),
      status: text("status"),
      pomodoroCount: number("pomodoroCount"),
    }
  if (section === "sessions")
    return {
      resource: section,
      userId: text("userId"),
      taskId: nullable("taskId"),
      roomId: nullable("roomId"),
      mode: text("mode"),
      status: text("status"),
      plannedSeconds: number("plannedSeconds"),
      accumulatedSeconds: number("accumulatedSeconds"),
    }
  if (section === "rooms")
    return {
      resource: section,
      hostUserId: text("hostUserId"),
      slug: text("slug"),
      name: text("name"),
      visibility: text("visibility"),
      phase: text("phase"),
      focusMinutes: number("focusMinutes"),
      shortBreakMinutes: number("shortBreakMinutes"),
      longBreakMinutes: number("longBreakMinutes"),
      autoStart: Boolean(form.autoStart),
    }
  if (section === "media")
    return editing
      ? {
          resource: section,
          name: text("name"),
          status: text("status"),
          mimeType: text("mimeType"),
          fileSize: number("fileSize"),
          premium: Boolean(form.premium),
        }
      : {
          resource: section,
          ownerUserId: nullable("ownerUserId"),
          name: text("name"),
          kind: text("kind"),
          source: text("source"),
          status: text("status"),
          storageKey: text("storageKey"),
          mimeType: text("mimeType"),
          fileSize: number("fileSize"),
          premium: Boolean(form.premium),
        }
  if (section === "billing")
    return {
      resource: section,
      userId: text("userId"),
      stripeCustomerId: text("stripeCustomerId"),
      stripeSubscriptionId: nullable("stripeSubscriptionId"),
      status: text("status"),
      priceId: nullable("priceId"),
      currentPeriodEnd: text("currentPeriodEnd")
        ? new Date(text("currentPeriodEnd")).toISOString()
        : null,
      cancelAtPeriodEnd: Boolean(form.cancelAtPeriodEnd),
    }
  if (section === "ai")
    return {
      resource: section,
      userId: text("userId"),
      month: `${text("month")}-01`,
      kind: text("kind"),
      reserved: number("reserved"),
      completed: number("completed"),
      refunded: number("refunded"),
    }
  return {
    resource: section,
    roomId: text("roomId"),
    reporterUserId: text("reporterUserId"),
    reason: text("reason"),
  }
}

function options(...values: string[]) {
  return values.map((value) => ({
    value,
    label: value
      .replaceAll("_", " ")
      .replace(/^./, (letter) => letter.toUpperCase()),
  }))
}

function toDateTimeLocal(value: Date | string | null | undefined) {
  if (!value) return ""
  const date = new Date(value)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}
