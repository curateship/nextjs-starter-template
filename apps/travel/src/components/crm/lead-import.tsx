import * as React from "react"
import { Loader2Icon, UploadIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FormDialog } from "@/components/ui/form-dialog"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { addLeads, getLeadErrorMessage } from "@/lib/api/crm/leads"
import { CONTACT_IMPORT_MAX_ROWS, parseCsv } from "@/lib/contacts/contact-csv"
import {
  guessLeadImportField as guessImportField,
  LEAD_IMPORT_BATCH,
  LEAD_IMPORT_FIELD_LABELS as IMPORT_FIELD_LABELS,
  readLeadImportRows,
  type LeadImportField as ImportField,
} from "@/lib/crm/lead-csv"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"

const IMPORT_FIELDS = Object.keys(IMPORT_FIELD_LABELS) as ImportField[]

/** A file read and matched, ready to send. */
type ReadFile = {
  name: string
  headings: string[]
  rows: string[][]
  fields: ImportField[]
}


/**
 * The leads import window, the Subscribers one's shape (Tyler, 9 Nov 2026:
 * "allow me to add manual leads as well as paste a csv file too just like
 * suvscribers"): pick a CSV file, check what each column is read as, then
 * import. Columns are guessed from their headings. New addresses join Leads
 * at New; a lead already there gains the file's name, company and phone and
 * keeps their stage, deal and conversations. Rows go 500 at a time, and a
 * failed batch stops the import and says how far it got.
 */
export function LeadImportDialog({
  onClose,
  onImported,
}: {
  onClose: () => void
  onImported: () => Promise<void>
}) {
  const [file, setFile] = React.useState<ReadFile | null>(null)
  const [sent, setSent] = React.useState<number | null>(null)
  const [dragging, setDragging] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const busy = sent !== null

  const read = file ? readLeadImportRows(file.rows, file.fields) : null
  const hasEmail = file?.fields.includes("email") ?? false

  const pick = async (picked: File | undefined) => {
    if (!picked) return
    const text = await picked.text().catch(() => null)
    const table = text === null ? [] : parseCsv(text)
    const [headings, ...rows] = table
    if (!headings || rows.length === 0) {
      showErrorToast(`${picked.name} has no rows to import. It needs a heading row and at least one lead.`)
      return
    }
    if (rows.length > CONTACT_IMPORT_MAX_ROWS) {
      showErrorToast(
        `${picked.name} has ${rows.length.toLocaleString()} rows. One file can hold up to ${CONTACT_IMPORT_MAX_ROWS.toLocaleString()}, so split it and import each part.`
      )
      return
    }
    const fields = headings.map(guessImportField)
    // Only one column can be the address; a second guess is left out.
    const firstEmail = fields.indexOf("email")
    setFile({
      name: picked.name,
      headings,
      rows,
      fields: fields.map((field, index) => (field === "email" && index !== firstEmail ? "skip" : field)),
    })
  }

  const setField = (column: number, field: ImportField) =>
    setFile((current) =>
      current
        ? {
            ...current,
            // Picking the address for one column takes it off any other.
            fields: current.fields.map((existing, index) =>
              index === column ? field : field === "email" && existing === "email" ? "skip" : existing
            ),
          }
        : current
    )

  const start = async () => {
    if (!file || !read) {
      showErrorToast("Choose a CSV file first.")
      return
    }
    if (!hasEmail) {
      showErrorToast("Pick which column holds the email address.")
      return
    }
    if (read.rows.length === 0) {
      showErrorToast("None of the rows has a real email address, so there is nobody to import.")
      return
    }
    setSent(0)
    for (let at = 0; at < read.rows.length; at += LEAD_IMPORT_BATCH) {
      const batch = read.rows.slice(at, at + LEAD_IMPORT_BATCH)
      try {
        await addLeads({ from: "csv", rows: batch })
        setSent(at + batch.length)
      } catch (error) {
        setSent(null)
        showErrorToast(
          at === 0
            ? getLeadErrorMessage(error)
            : `Stopped after ${at.toLocaleString()} of ${read.rows.length.toLocaleString()} leads, who are in. ${getLeadErrorMessage(error)}`
        )
        await onImported()
        return
      }
    }
    onClose()
    await onImported()
  }

  return (
    <FormDialog open dirty={file !== null} busy={busy} onClose={onClose}>
      {(requestClose) => (
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>Import leads</DialogTitle>
            <DialogDescription>
              New addresses join Leads at New. A lead already there gains the file's name, company and phone,
              and keeps their stage, deal and conversations.
            </DialogDescription>
          </DialogHeader>
          <form
            className="flex min-h-0 flex-1 flex-col"
            onSubmit={(event) => {
              event.preventDefault()
              void start()
            }}
          >
            <DialogBody>
              <Card size="sm">
                <CardHeader>
                  <CardTitle>The file</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4">
                  <div
                    className={cn(
                      "grid justify-items-center gap-2 rounded-lg border border-dashed p-6 text-center",
                      dragging && "bg-muted"
                    )}
                    onDragOver={(event) => {
                      event.preventDefault()
                      setDragging(true)
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(event) => {
                      event.preventDefault()
                      setDragging(false)
                      void pick(event.dataTransfer.files[0])
                    }}
                  >
                    <p className="text-sm">
                      {file
                        ? `${file.name}, ${file.rows.length.toLocaleString()} ${file.rows.length === 1 ? "row" : "rows"}`
                        : "Drop a CSV file here, or choose one."}
                    </p>
                    <Button type="button" variant="outline" disabled={busy} onClick={() => inputRef.current?.click()}>
                      <UploadIcon className="size-4" />
                      {file ? "Choose another file" : "Choose a CSV file"}
                    </Button>
                    <input
                      ref={inputRef}
                      type="file"
                      accept=".csv,text/csv"
                      className="sr-only"
                      tabIndex={-1}
                      aria-label="CSV file"
                      onChange={(event) => {
                        void pick(event.target.files?.[0])
                        event.target.value = ""
                      }}
                    />
                  </div>
                </CardContent>
              </Card>
              {file ? (
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>What each column holds</CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4">
                    {file.headings.map((heading, column) => (
                      <div key={column} className="grid items-center gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                        <div className="min-w-0">
                          <Label htmlFor={`lead-import-column-${column}`} className="truncate">
                            {heading.trim() || `Column ${column + 1}`}
                          </Label>
                          <p className="truncate text-xs text-muted-foreground">
                            {file.rows[0]?.[column]?.trim() || "Empty in the first row"}
                          </p>
                        </div>
                        <Select
                          value={file.fields[column] ?? "skip"}
                          onValueChange={(value) => setField(column, value as ImportField)}
                          disabled={busy}
                        >
                          <SelectTrigger id={`lead-import-column-${column}`} className="sm:w-40">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {IMPORT_FIELDS.map((field) => (
                              <SelectItem key={field} value={field}>
                                {IMPORT_FIELD_LABELS[field]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                    <p className="text-sm text-muted-foreground" aria-live="polite">
                      {!hasEmail
                        ? "Pick the column that holds the email address."
                        : describeReady(read?.rows.length ?? 0, read?.invalid ?? 0)}
                    </p>
                  </CardContent>
                </Card>
              ) : null}
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={requestClose} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? <Loader2Icon className="animate-spin" /> : null}
                {busy
                  ? `Importing ${sent.toLocaleString()} of ${(read?.rows.length ?? 0).toLocaleString()}`
                  : read && read.rows.length
                    ? `Import ${read.rows.length.toLocaleString()} ${read.rows.length === 1 ? "lead" : "leads"}`
                    : "Import leads"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      )}
    </FormDialog>
  )
}

/** How many will go in, and how many rows are left out. */
function describeReady(ready: number, invalid: number): string {
  const people = `${ready.toLocaleString()} ${ready === 1 ? "lead" : "leads"} ready to import.`
  if (!invalid) return people
  return `${people} ${invalid.toLocaleString()} ${invalid === 1 ? "row has" : "rows have"} no real email address and will be left out.`
}
