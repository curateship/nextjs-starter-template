import * as React from "react"
import { PlusIcon, UploadIcon, UserPlusIcon } from "lucide-react"

import { NewRecordDropdown } from "@/components/shared/new-record-dropdown"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { addLeads, getLeadErrorMessage } from "@/lib/api/crm/leads"
import { CRM_STAGE_LABELS, CRM_STAGES, type CrmStage } from "@/lib/crm/crm"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { showErrorToast } from "@/lib/toast/error-toast"

const EMPTY_FORM = { email: "", name: "", company: "", phone: "" }

/**
 * The add-lead form: address, name, company, phone and stage, with what
 * Create does. Used by Leads' New lead and by the CRM page's + → Add lead.
 * An address already a lead is updated rather than added twice.
 */
export function useLeadForm(onCreated: (leadId: string) => Promise<void>) {
  const [form, setForm] = React.useState(EMPTY_FORM)
  const [stage, setStage] = React.useState<CrmStage>("new")
  const [invalid, setInvalid] = React.useState(false)
  const [run, saving] = useAsyncAction(getLeadErrorMessage)

  const field =
    (key: keyof typeof EMPTY_FORM) =>
    (event: React.ChangeEvent<HTMLInputElement>) =>
      setForm((current) => ({ ...current, [key]: event.target.value }))

  /** Adds the lead; true once it exists. */
  const submit = async (): Promise<boolean> => {
    const email = form.email.trim()
    if (!email) {
      setInvalid(true)
      showErrorToast("Email address is required.")
      return false
    }
    let created = false
    await run(async () => {
      const result = await addLeads({
        from: "hand",
        rows: [
          {
            email,
            name: form.name.trim() || null,
            company: form.company.trim() || null,
            phone: form.phone.trim() || null,
            stage,
          },
        ],
      })
      setForm(EMPTY_FORM)
      setStage("new")
      setInvalid(false)
      created = true
      const id = result.leadIds[0]
      if (id) await onCreated(id)
    }, `Added ${email}.`)
    return created
  }

  const fields = (
    <>
      <div className="grid gap-2">
        <Label htmlFor="new-lead-email">Email</Label>
        <Input
          id="new-lead-email"
          type="email"
          autoFocus
          value={form.email}
          placeholder="ada@example.com"
          aria-invalid={invalid || undefined}
          onChange={(event) => {
            field("email")(event)
            setInvalid(false)
          }}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="new-lead-name">Name</Label>
        <Input id="new-lead-name" value={form.name} onChange={field("name")} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="grid min-w-0 gap-2">
          <Label htmlFor="new-lead-company">Company</Label>
          <Input id="new-lead-company" value={form.company} onChange={field("company")} />
        </div>
        <div className="grid min-w-0 gap-2">
          <Label htmlFor="new-lead-phone">Phone</Label>
          <Input id="new-lead-phone" type="tel" value={form.phone} onChange={field("phone")} />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="new-lead-stage">Status</Label>
        <Select value={stage} onValueChange={(value) => setStage(value as CrmStage)}>
          <SelectTrigger id="new-lead-stage" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CRM_STAGES.map((option) => (
              <SelectItem key={option} value={option}>
                {CRM_STAGE_LABELS[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </>
  )

  return { fields, submit, saving }
}

/**
 * New lead, under the Leads header's button, the same two choices as New
 * contact on Subscribers (Tyler, 9 Nov 2026: "allow me to add manual leads as
 * well as paste a csv file too just like suvscribers"): Add a lead turns the
 * dropdown into the form (address, name, company, phone, stage), and Upload a
 * CSV file opens the import window. An address already a lead is updated
 * rather than added twice. The lead is not put on the subscriber list.
 */
export function NewLeadDropdown({
  onCreated,
  onImport,
}: {
  /** The new lead, opened in the right panel once the list has them. */
  onCreated: (leadId: string) => Promise<void>
  onImport: () => void
}) {
  const [open, setOpen] = React.useState(false)
  const [choosing, setChoosing] = React.useState(true)
  const lead = useLeadForm(onCreated)

  return (
    <NewRecordDropdown
      label="New lead"
      open={open}
      onOpenChange={(next) => {
        if (next) setChoosing(true)
        setOpen(next)
      }}
      choices={
        choosing ? (
          <div className="grid" role="menu" aria-label="Add leads">
            <Button
              type="button"
              role="menuitem"
              variant="ghost"
              className="w-full justify-start gap-2 px-2 font-normal"
              onClick={() => setChoosing(false)}
            >
              <UserPlusIcon className="size-4 text-muted-foreground" />
              Add a lead
            </Button>
            <Button
              type="button"
              role="menuitem"
              variant="ghost"
              className="w-full justify-start gap-2 px-2 font-normal"
              onClick={() => {
                setOpen(false)
                onImport()
              }}
            >
              <UploadIcon className="size-4 text-muted-foreground" />
              Upload a CSV file
            </Button>
          </div>
        ) : undefined
      }
      submitLabel="Create lead"
      busy={lead.saving}
      onSubmit={() =>
        void lead.submit().then((created) => {
          if (created) setOpen(false)
        })
      }
      trigger={
        <Button type="button" className="ml-1 @max-3xl:size-8 @max-3xl:px-0" aria-label="New lead">
          <PlusIcon className="size-4" />
          <span className="@max-3xl:hidden">New lead</span>
        </Button>
      }
    >
      {lead.fields}
    </NewRecordDropdown>
  )
}
